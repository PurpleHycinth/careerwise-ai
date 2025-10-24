import os
import uuid
import time
import docx
import PyPDF2
import re
import json
from pathlib import Path
from typing import List, Dict, Optional
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer, util
from fastapi import UploadFile, BackgroundTasks
import torch
from datetime import datetime

# -----------------------
# Config: Mongo + Cloud URL
# -----------------------
MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.environ.get("MONGO_DB", "careerwise")
MONGO_COLLECTION = os.environ.get("MONGO_COLLECTION", "analyses")

# Base public URL where uploaded files will be available in production.
# Example: https://cdn.yourdomain.com/uploads
# If empty, cloud_path fields will be empty strings.
CLOUD_BASE_URL = os.environ.get("CLOUD_BASE_URL", "").rstrip("/")

def make_cloud_path(file_id: str) -> str:
    if not CLOUD_BASE_URL:
        return ""
    # Ensure file_id does not start with slash
    file_id = file_id.lstrip("/")
    return f"{CLOUD_BASE_URL}/{file_id}"

# -----------------------
# MongoDB client (optional)
# -----------------------
try:
    from pymongo import MongoClient
    mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    # test connection (will raise if cannot connect)
    mongo_client.server_info()
    mongo_db = mongo_client[MONGO_DB]
    mongo_col = mongo_db[MONGO_COLLECTION]
    _mongo_available = True
    print(f"[mongo] connected to {MONGO_URI}, DB={MONGO_DB}, collection={MONGO_COLLECTION}")
except Exception as e:
    mongo_client = None
    mongo_db = None
    mongo_col = None
    _mongo_available = False
    print(f"[mongo] not available: {e}")

# -----------------------
# Model: load your fine-tuned model here
# -----------------------
ml_model = SentenceTransformer("fine-tuned-all-MiniLM-L6-v2-12")
device = "cuda" if torch.cuda.is_available() else "cpu"

# -----------------------
# Small utilities (no nltk required)
# -----------------------
_SENT_SPLIT_RE = re.compile(r'(?<=[\.\?!\n])\s+')

def split_sentences_simple(text: str) -> List[str]:
    if not text:
        return []
    sents = [s.strip() for s in _SENT_SPLIT_RE.split(text) if s and s.strip()]
    if len(sents) <= 1:
        sents = [t.strip() for t in re.split(r'(?<=[\.\?!])\s+', text) if t.strip()]
    return sents

def clamp01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))

# -----------------------
# Explainability helpers
# -----------------------
def sentence_level_scores(jd_text: str, resume_text: str, model: SentenceTransformer, top_k: int = 5) -> Dict:
    jd_emb = model.encode(jd_text, convert_to_tensor=True)
    resume_sents = split_sentences_simple(resume_text)
    if not resume_sents:
        return {"resume_sentences": [], "top_k": []}
    sent_embs = model.encode(resume_sents, convert_to_tensor=True)
    cosims = util.cos_sim(sent_embs, jd_emb)
    scores = [float(x[0]) for x in cosims.tolist()]
    scored = [
        {"sent": s, "score": round(sc, 4), "idx": i}
        for i, (s, sc) in enumerate(zip(resume_sents, scores))
    ]
    scored_sorted = sorted(scored, key=lambda x: x["score"], reverse=True)
    return {"resume_sentences": scored_sorted, "top_k": scored_sorted[:top_k]}

def occlusion_sentence_contrib_fast(jd_text: str, resume_text: str, model: SentenceTransformer, top_k: int = 5) -> List[Dict]:
    jd_emb = model.encode(jd_text, convert_to_tensor=True)
    sents = split_sentences_simple(resume_text)
    if not sents:
        return []
    sent_embs = model.encode(sents, convert_to_tensor=True)
    if isinstance(sent_embs, torch.Tensor) and isinstance(jd_emb, torch.Tensor):
        sent_embs_t = sent_embs.to(jd_emb.device)
        full_mean = torch.mean(sent_embs_t, dim=0, keepdim=True)
        base_score = float(util.cos_sim(full_mean, jd_emb).item())
        n = sent_embs_t.shape[0]
        results = []
        for i in range(n):
            if n == 1:
                without_score = 0.0
            else:
                remaining_mean = (full_mean * n - sent_embs_t[i]) / (n - 1)
                without_score = float(util.cos_sim(remaining_mean, jd_emb).item())
            delta = base_score - without_score
            results.append({
                "idx": i,
                "sent": sents[i],
                "base_score": round(base_score, 4),
                "without_score": round(without_score, 4),
                "delta": round(delta, 4)
            })
        results_sorted = sorted(results, key=lambda x: x["delta"], reverse=True)
        return results_sorted[:top_k]
    else:
        full_emb = util.mean_pool(torch.tensor(sent_embs), attention_mask=None) if not isinstance(sent_embs, torch.Tensor) else torch.mean(sent_embs, dim=0, keepdim=True)
        base_score = float(util.cos_sim(full_emb, jd_emb).item())
        results = []
        for i, s in enumerate(sents):
            remaining = " ".join([x for j, x in enumerate(sents) if j != i]).strip()
            if not remaining:
                without_score = 0.0
            else:
                rem_emb = model.encode(remaining, convert_to_tensor=True)
                without_score = float(util.cos_sim(rem_emb, jd_emb).item())
            delta = base_score - without_score
            results.append({
                "idx": i, "sent": s, "base_score": round(base_score, 4),
                "without_score": round(without_score, 4), "delta": round(delta, 4)
            })
        results_sorted = sorted(results, key=lambda x: x["delta"], reverse=True)
        return results_sorted[:top_k]

def match_resume_to_jd_sentences(jd_text: str, resume_text: str, model: SentenceTransformer, top_k: int = 1) -> List[Dict]:
    jd_sents = split_sentences_simple(jd_text)
    resume_sents = split_sentences_simple(resume_text)
    if not resume_sents or not jd_sents:
        return []
    jd_embs = model.encode(jd_sents, convert_to_tensor=True)
    res_embs = model.encode(resume_sents, convert_to_tensor=True)
    sim_matrix = util.cos_sim(res_embs, jd_embs)
    out = []
    for i, res_sent in enumerate(resume_sents):
        sims = sim_matrix[i].tolist()
        indexed = list(enumerate(sims))
        indexed_sorted = sorted(indexed, key=lambda x: x[1], reverse=True)[:top_k]
        matches = [{"jd_idx": idx, "jd_sent": jd_sents[idx], "score": round(float(score), 4)} for idx, score in indexed_sorted]
        out.append({"resume_idx": i, "resume_sent": res_sent, "matches": matches})
    return out

def skill_keyword_suggestions(jd_text: str, resume_text: str, top_n: int = 12) -> Dict:
    from collections import Counter
    def tokenize_words(text):
        tokens = re.findall(r"[A-Za-z\+\#\.\-]+", text)
        tokens = [t.lower() for t in tokens if len(t) > 1]
        return tokens
    jd_tokens = tokenize_words(jd_text)
    resume_tokens = set(tokenize_words(resume_text))
    if not jd_tokens:
        return {"skills_candidate": [], "present": [], "missing": []}
    counts = Counter(jd_tokens)
    stopwords = set(["and", "or", "with", "in", "the", "of", "for", "to", "on", "a", "an", "is", "are", "experience"])
    candidates = [w for w, _ in counts.most_common(top_n * 2) if w not in stopwords and len(w) > 2]
    seen = set(); skills = []
    for c in candidates:
        if c not in seen:
            skills.append(c); seen.add(c)
        if len(skills) >= top_n:
            break
    present = [s for s in skills if s in resume_tokens]
    missing = [s for s in skills if s not in resume_tokens]
    return {"skills_candidate": skills, "present": present, "missing": missing}

# -----------------------
# FastAPI helpers (preserved) with meta-file addition
# -----------------------
class AnalysisRequest(BaseModel):
    job_description: str
    file_ids: List[str]


# --- Career finder request model (add to model.py) ---


class CareerRequest(BaseModel):
    job_description: str
    file_ids: Optional[List[str]] = None


def delete_file_after_delay(filepath: Path, delay: int):
    time.sleep(delay)
    try:
        os.remove(filepath)
    except OSError as e:
        print(f"Error deleting file {filepath}: {e}")
    meta_path = filepath.with_suffix(filepath.suffix + ".meta.json")
    if meta_path.exists():
        try:
            os.remove(meta_path)
        except OSError as e:
            print(f"Error deleting meta file {meta_path}: {e}")

async def save_and_schedule_deletion(
    resumes: List[UploadFile],
    background_tasks: BackgroundTasks,
    upload_dir: Path
):
    """
    Saves uploaded files under upload_dir as <uuid><ext> and writes a <uuid><ext>.meta.json
    containing the original filename and the cloud URL (if configured). Returns the list
    of saved file ids (strings).
    """
    file_ids = []
    for resume_file in resumes:
        unique_id = str(uuid.uuid4())
        extension = Path(resume_file.filename).suffix
        filepath = upload_dir / f"{unique_id}{extension}"
        # write file bytes
        with open(filepath, "wb") as buffer:
            buffer.write(await resume_file.read())
        # build cloud path (string) - might be empty in dev if CLOUD_BASE_URL not set
        cloud_path = make_cloud_path(f"{unique_id}{extension}")
        # write associated metadata file containing original filename and cloud path
        meta = {"original_filename": resume_file.filename, "cloud_path": cloud_path}
        meta_path = filepath.with_suffix(filepath.suffix + ".meta.json")
        try:
            with open(meta_path, "w", encoding="utf-8") as mf:
                json.dump(meta, mf)
        except Exception as e:
            print(f"Warning: failed to write meta for {filepath}: {e}")
        # schedule deletion
        background_tasks.add_task(delete_file_after_delay, filepath, 600)
        file_ids.append(f"{unique_id}{extension}")
    return file_ids

# -----------------------
# analyze_files: computes score + explainability + returns original filename + local/cloud paths
# -----------------------
def analyze_files(request: AnalysisRequest, upload_dir: Path):
    """
    For each file in request.file_ids:
      - extract text (pdf/docx supported)
      - compute overall score (cosine)
      - compute sentence-level top sentences
      - compute occlusion contributions (fast)
      - compute matches between resume sentences and JD sentences
      - compute skill keyword suggestions (missing skills)
    Returns list sorted by score desc with detailed diagnostics, each item includes:
      { file_id, original_filename, local_path, cloud_path, score, raw_score, ... }
    Additionally, saves a document for this analysis run into MongoDB (if connected).
    """
    jd_text = request.job_description or ""
    if not jd_text.strip():
        raise ValueError("job_description is empty in AnalysisRequest")

    jd_embedding = ml_model.encode(jd_text, convert_to_tensor=True)
    jd_sentences = split_sentences_simple(jd_text)

    results = []
    file_urls_map = {}  # for saving into mongo doc (file_id -> cloud_path)
    for file_id in request.file_ids:
        filepath = upload_dir / file_id
        if not filepath.exists():
            # skip missing file
            continue

        # Try to read original filename and cloud_path from meta file
        original_filename = None
        cloud_path_meta = ""
        meta_path = filepath.with_suffix(filepath.suffix + ".meta.json")
        if meta_path.exists():
            try:
                with open(meta_path, "r", encoding="utf-8") as mf:
                    meta = json.load(mf)
                original_filename = meta.get("original_filename")
                cloud_path_meta = meta.get("cloud_path", "")
            except Exception as e:
                print(f"Warning: failed to read meta for {filepath}: {e}")

        # absolute local path string
        try:
            local_path_str = str(filepath.resolve())
        except Exception:
            local_path_str = str(filepath)

        text = ""
        try:
            if filepath.suffix.lower() == ".pdf":
                with open(filepath, "rb") as f:
                    reader = PyPDF2.PdfReader(f)
                    parts = []
                    for page in reader.pages:
                        try:
                            txt = page.extract_text() or ""
                        except Exception:
                            txt = ""
                        parts.append(txt)
                    text = "\n".join(parts).strip()
            elif filepath.suffix.lower() == ".docx":
                doc = docx.Document(filepath)
                text = "\n".join([p.text for p in doc.paragraphs]).strip()
            else:
                with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                    text = f.read().strip()
        except Exception as e:
            print(f"Error reading {filepath}: {e}")
            continue

        if not text:
            continue

        # Overall score
        resume_embedding = ml_model.encode(text, convert_to_tensor=True)
        raw_score = float(util.cos_sim(jd_embedding, resume_embedding).item())
        overall_score = round(raw_score * 100, 2)

        # Sentence-level explanation (fast)
        sent_scores = sentence_level_scores(jd_text, text, ml_model, top_k=5)

        # Fast occlusion (top contributors)
        occlusion = occlusion_sentence_contrib_fast(jd_text, text, ml_model, top_k=5)

        # Resume -> JD matches (show top match per resume sentence)
        matches = match_resume_to_jd_sentences(jd_text, text, ml_model, top_k=1)

        # Skill keywords suggestions (top 10)
        skills = skill_keyword_suggestions(jd_text, text, top_n=10)

        # Suggested edits
        suggested_edits = []
        for miss in skills["missing"][:5]:
            suggested_edits.append(f"Consider including a short bullet mentioning '{miss}' (where applicable), e.g. 'Worked with {miss} on ...'")

        cloud_path = cloud_path_meta or make_cloud_path(file_id)
        file_urls_map[file_id] = cloud_path

        results.append({
            "file_id": file_id,
            "original_filename": original_filename or file_id,
            "local_path": local_path_str,
            "cloud_path": cloud_path,
            "score": overall_score,
            "raw_score": round(raw_score, 4),
            "top_resume_sentences": sent_scores.get("top_k", []),
            "sentence_scores": sent_scores.get("resume_sentences", []),
            "occlusion_top": occlusion,
            "resume_to_jd_matches": matches,
            "skill_suggestions": skills,
            "suggested_edits": suggested_edits
        })

    # Sort by score descending
    results_sorted = sorted(results, key=lambda x: x["score"], reverse=True)

    # Persist the analysis run to MongoDB (if available)
    if _mongo_available:
        try:
            analysis_doc = {
                "job_description": jd_text,
                "file_ids": request.file_ids,
                "results": results_sorted,
                "file_urls": file_urls_map,
                "created_at": datetime.utcnow(),
                "meta": {
                    "num_files": len(results_sorted),
                }
            }
            insert_result = mongo_col.insert_one(analysis_doc)
            analysis_doc["_id"] = str(insert_result.inserted_id)
            print(f"[mongo] analysis stored with _id={analysis_doc['_id']}")
        except Exception as e:
            print(f"[mongo] failed to insert analysis doc: {e}")
    else:
        print("[mongo] skipped persistence (mongo not available)")

    return results_sorted
