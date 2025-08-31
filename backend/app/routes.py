import os
from typing import List
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, BackgroundTasks
from .model import AnalysisRequest, save_and_schedule_deletion, analyze_files

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