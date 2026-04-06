# backend/app/routes.py
import os
from typing import List, Optional
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, BackgroundTasks, HTTPException, Form
from .model import AnalysisRequest, save_and_schedule_deletion, analyze_files, delete_file_after_delay
import uuid
from fastapi.encoders import jsonable_encoder
from .model import CareerRequest

router = APIRouter()
UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads"
os.makedirs(UPLOADS_DIR, exist_ok=True)


@router.post("/upload/")
async def upload_resumes(
    background_tasks: BackgroundTasks,
    resumes: List[UploadFile] = File(...)
):
    file_ids = await save_and_schedule_deletion(resumes, background_tasks, UPLOADS_DIR)
    return {"file_ids": file_ids}


@router.post("/analyze/")
async def analyze_resumes(request: AnalysisRequest):
    ranked_results = analyze_files(request, UPLOADS_DIR)
    return {"ranked_resumes": ranked_results}


# ----------------- CAREER-FINDER SETUP -----------------
# jobsearch.py is a LangGraph pipeline — build it once at startup.
try:
    from .jobsearch import build_graph, CareerState
    _career_pipeline = build_graph()
    _career_available = True
except Exception as e:
    _career_pipeline = None
    _career_available = False
    print(f"[career] Failed to load jobsearch pipeline: {e}")


def _run_pipeline(resume_path: str, goal: str) -> dict:
    """Invoke the compiled LangGraph pipeline and return the final state."""
    initial_state: CareerState = {
        "resume_path": resume_path,
        "goal": goal,
        "resume": None,
        "advice": None,
        "universities": None,
        "jobs": None,
        "errors": [],
    }
    return _career_pipeline.invoke(initial_state)


def _state_to_response(state: dict, filename: str) -> dict:
    """
    Map the LangGraph final state to the shape CareerFinder.jsx expects:
      { filename, parsed, advice: { course_suggestions, university_suggestions,
        job_suggestions, career_paths, skill_gaps, advice_summary }, external_jobs }
    """
    resume    = state.get("resume") or {}
    advice    = state.get("advice") or {}
    unis      = state.get("universities") or []   # enriched by fetch_universities_node
    jobs      = state.get("jobs") or []           # live listings from fetch_jobs_node

    normalized_advice = {
        "career_paths":           advice.get("career_paths", []),
        "course_suggestions":     advice.get("course_suggestions", []),
        "university_suggestions": unis,           # already enriched with website URLs
        "job_suggestions":        advice.get("career_paths", []),  # career_paths doubles as job roles
        "job_search_keywords":    advice.get("job_search_keywords", []),
        "skill_gaps":             advice.get("skill_gaps", []),
        "advice_summary":         advice.get("advice_summary", ""),
    }

    return {
        "filename":      filename,
        "parsed":        resume,
        "advice":        normalized_advice,
        "external_jobs": jobs,
    }


# ----------------- CAREER-FINDER ENDPOINTS -----------------

@router.post("/career/analyze/")
async def career_analyze(request: CareerRequest):
    """
    Runs the career pipeline for each already-uploaded file_id.
    Expects JSON: { "job_description": "...", "file_ids": ["<uuid>.pdf", ...] }
    """
    if not _career_available:
        raise HTTPException(status_code=500, detail="Career pipeline unavailable — check jobsearch imports.")

    results = []
    for fid in request.file_ids or []:
        file_path = UPLOADS_DIR / fid
        if not file_path.exists():
            results.append({"filename": fid, "error": "file not found"})
            continue
        try:
            state = _run_pipeline(str(file_path), request.job_description)
            results.append(_state_to_response(state, fid))
        except Exception as e:
            results.append({"filename": fid, "error": str(e)})

    return jsonable_encoder({"results": results})


@router.post("/career/upload_and_analyze/")
async def career_upload_and_analyze(
    background_tasks: BackgroundTasks,
    resume: UploadFile = File(...),
    goal: str = Form(...),
):
    """
    Multipart endpoint: upload one resume + career goal string.
    Returns parsed resume, AI advice, enriched universities, and live job listings.
    """
    if not _career_available:
        raise HTTPException(status_code=500, detail="Career pipeline unavailable — check jobsearch imports.")

    ext = Path(resume.filename).suffix.lower()
    if ext not in {".pdf", ".docx"}:
        raise HTTPException(status_code=400, detail="Unsupported file type. Accepts .pdf and .docx")

    unique_name = f"{uuid.uuid4().hex}{ext}"
    saved_path = UPLOADS_DIR / unique_name
    try:
        with open(saved_path, "wb") as f:
            f.write(await resume.read())
    finally:
        await resume.close()

    try:
        state = _run_pipeline(str(saved_path), goal)
    except Exception as e:
        try:
            saved_path.unlink()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Career pipeline failed: {str(e)}")

    background_tasks.add_task(delete_file_after_delay, saved_path, 600)

    return jsonable_encoder(_state_to_response(state, unique_name))