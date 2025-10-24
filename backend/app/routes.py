import os
from typing import List,Optional
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, BackgroundTasks,HTTPException, Form
from .model import AnalysisRequest, save_and_schedule_deletion, analyze_files
# new imports for career finder (put near top of routes.py)
import uuid
import json
from fastapi.encoders import jsonable_encoder

# CareerRequest model we just added
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


# ----------------- CAREER-FINDER ENDPOINTS -----------------
# Ensure UPLOADS_DIR exists (already defined above)
# Attempt flexible import of your jobsearch module (jobsearch.py)
try:
    from .jobsearch import parse_resume_custom, generate_llm_advice, fetch_job_listings
except Exception:
    try:
        from jobsearch import parse_resume_custom, generate_llm_advice, fetch_job_listings
    except Exception:
        parse_resume_custom = generate_llm_advice = fetch_job_listings = None

@router.post("/career/analyze/")
async def career_analyze(request: CareerRequest, jooble_key: Optional[str] = None):
    """
    Expects JSON:
      { "job_description": "...", "file_ids": ["<uuid>.pdf", ...] }
    Uses already-uploaded files (from your /upload/ endpoint).
    """
    # Ensure jobsearch functions available
    if parse_resume_custom is None or generate_llm_advice is None:
        raise HTTPException(
            status_code=500,
            detail="Career module not importable. Place jobsearch.py at project root or ensure package imports."
        )

    parsed_resumes = []
    for fid in request.file_ids or []:
        file_path = UPLOADS_DIR / fid
        if not file_path.exists():
            parsed_resumes.append({"filename": fid, "error": "file not found"})
            continue
        try:
            parsed = parse_resume_custom(str(file_path))
            parsed_resumes.append({"filename": fid, "parsed": parsed})
        except Exception as e:
            parsed_resumes.append({"filename": fid, "error": f"parse failed: {str(e)}"})

    parsed_for_advice = parsed_resumes[0]["parsed"] if parsed_resumes and "parsed" in parsed_resumes[0] else {}

    try:
        advice = generate_llm_advice(parsed_for_advice, request.job_description)
    except Exception as e:
        advice = {"error": f"generate_llm_advice failed: {str(e)}"}

    external_jobs = []
    # fetch_job_listings in jobsearch.py will return [] if api_key missing
    if jooble_key and fetch_job_listings is not None:
        try:
            external_jobs = fetch_job_listings(request.job_description, api_key=jooble_key)
        except Exception as e:
            external_jobs = [{"error": f"fetch_job_listings failed: {str(e)}"}]

    return jsonable_encoder({
        "parsed_resumes": parsed_resumes,
        "advice": advice,
        "external_jobs": external_jobs
    })


@router.post("/career/upload_and_analyze/")
async def career_upload_and_analyze(
    background_tasks: BackgroundTasks,
    resume: UploadFile = File(...),
    goal: str = Form(...),
    jooble_key: Optional[str] = Form(None)
):
    """
    Convenience multipart endpoint:
      - upload one resume file + 'goal' string
      - returns parsed resume, advice, optional external jobs
    """
    if parse_resume_custom is None or generate_llm_advice is None:
        raise HTTPException(
            status_code=500,
            detail="Career module not importable. Place jobsearch.py at project root or ensure package imports."
        )

    # validate extension
    ext = Path(resume.filename).suffix.lower()
    if ext not in {".pdf", ".docx"}:
        raise HTTPException(status_code=400, detail="Unsupported file type. Accepts .pdf and .docx")

    # save file (same pattern as your upload helper)
    unique_name = f"{uuid.uuid4().hex}{ext}"
    saved_path = UPLOADS_DIR / unique_name
    try:
        with open(saved_path, "wb") as f:
            f.write(await resume.read())
    finally:
        await resume.close()

    try:
        parsed = parse_resume_custom(str(saved_path))
        advice = generate_llm_advice(parsed, goal)
    except Exception as e:
        try:
            saved_path.unlink()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Parsing or advice generation failed: {str(e)}")

    external_jobs = []
    if jooble_key and fetch_job_listings is not None:
        try:
            external_jobs = fetch_job_listings(goal, api_key=jooble_key)
        except Exception as e:
            external_jobs = [{"error": f"fetch_job_listings failed: {str(e)}"}]

    # optional: schedule deletion using your existing background_tasks helper
    background_tasks.add_task(save_and_schedule_deletion, [], background_tasks, [resume])


    return jsonable_encoder({
        "filename": unique_name,
        "parsed": parsed,
        "advice": advice,
        "external_jobs": external_jobs
    })
