import os
import uuid
import time
import docx
import PyPDF2
from pathlib import Path
from typing import List
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer, util
from fastapi import UploadFile, BackgroundTasks

# Load the model once on startup
ml_model = SentenceTransformer('all-MiniLM-L6-v2')

class AnalysisRequest(BaseModel):
    job_description: str
    file_ids: List[str]

def delete_file_after_delay(filepath: Path, delay: int):
    time.sleep(delay)
    try:
        os.remove(filepath)
    except OSError as e:
        print(f"Error deleting file {filepath}: {e}")

async def save_and_schedule_deletion(
    resumes: List[UploadFile],
    background_tasks: BackgroundTasks,
    upload_dir: Path
):
    file_ids = []
    for resume_file in resumes:
        unique_id = str(uuid.uuid4())
        extension = Path(resume_file.filename).suffix
        filepath = upload_dir / f"{unique_id}{extension}"
        with open(filepath, "wb") as buffer:
            buffer.write(await resume_file.read())
        background_tasks.add_task(delete_file_after_delay, filepath, 600)
        file_ids.append(f"{unique_id}{extension}")
    return file_ids

def analyze_files(request: AnalysisRequest, upload_dir: Path):
    job_embedding = ml_model.encode(request.job_description, convert_to_tensor=True)
    results = []
    for file_id in request.file_ids:
        filepath = upload_dir / file_id
        if not filepath.exists():
            continue

        text = ""
        if filepath.suffix == ".pdf":
            with open(filepath, "rb") as f:
                reader = PyPDF2.PdfReader(f)
                text = "".join(page.extract_text() for page in reader.pages)
        elif filepath.suffix == ".docx":
            doc = docx.Document(filepath)
            text = "\n".join([p.text for p in doc.paragraphs])
        
        if text:
            resume_embedding = ml_model.encode(text, convert_to_tensor=True)
            score = util.cos_sim(job_embedding, resume_embedding).item()
            results.append({"filename": file_id, "score": round(score * 100, 2)})

    return sorted(results, key=lambda x: x['score'], reverse=True)
