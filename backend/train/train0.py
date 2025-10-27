# train.py — one-click fine-tuning runner for jd/resume dataset
import os
import json
import math
from pathlib import Path
from typing import List, Tuple
import torch
from sentence_transformers import SentenceTransformer, InputExample, losses
from torch.utils.data import DataLoader
from tqdm import tqdm

# ==== CONFIGURATION ====
TRAIN_FILE = Path("D:/MSc/SEM 1/Python/Project/data_create/generated_rank_dataset_v2/processed_rank_v2/train_pairs.jsonl")
BASE_MODEL = "all-MiniLM-L6-v2"
OUTPUT_DIR = Path("./fine-tuned-all-MiniLM-L6-v2-12")
BATCH_SIZE = 8
EPOCHS = 12
LR = 2e-5
MAX_SEQ_LENGTH = 256
WARMUP_RATIO = 0.1
SAMPLE_RAW_LINES = 5
# ========================

device = "cuda" if torch.cuda.is_available() else "cpu"

def print_file_head(path: Path, n=SAMPLE_RAW_LINES):
    print(f"\n---- Showing first {n} lines of {path} ----")
    try:
        with open(path, "r", encoding="utf-8") as f:
            for i, line in enumerate(f):
                if i >= n:
                    break
                print(f"{i+1}: {line.strip()}")
    except Exception as e:
        print(f"Error reading file: {e}")
    print("---- end preview ----\n")

def parse_line_to_pair(obj: dict) -> Tuple[str, str, float, str]:
    left_keys = ["jd", "job_description", "text_a", "text1", "query"]
    right_keys = ["resume", "candidate_text", "text_b", "text2"]
    label_keys = ["label", "score", "similarity", "sim"]

    a = next((obj[k].strip() for k in left_keys if k in obj and isinstance(obj[k], str) and obj[k].strip()), None)
    b = next((obj[k].strip() for k in right_keys if k in obj and isinstance(obj[k], str) and obj[k].strip()), None)
    if a is None or b is None:
        return None, None, None, None

    label = None
    for lk in label_keys:
        if lk in obj:
            try:
                label = float(obj[lk])
            except:
                label = None
            break
    if label is None:
        label = 1.0
    label = max(0.0, min(1.0, label))
    return a, b, label, "jd|resume"

def load_jsonl(path: Path):
    examples = []
    total_lines = 0
    bad_lines = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            total_lines += 1
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as e:
                if len(bad_lines) < 5:
                    bad_lines.append((total_lines, str(e)))
                continue
            a, b, label, _ = parse_line_to_pair(obj)
            if a is None:
                continue
            examples.append(InputExample(texts=[a, b], label=label))
    return examples, total_lines, bad_lines

def main():
    print(f"Device detected: {device}")
    print_file_head(TRAIN_FILE)

    train_examples, total_lines, bad_lines = load_jsonl(TRAIN_FILE)
    print(f"Total lines: {total_lines}")
    print(f"Valid training pairs: {len(train_examples)}")

    if bad_lines:
        print("Some JSON decode errors (up to 5 shown):")
        for ln, err in bad_lines:
            print(f"  line {ln}: {err}")

    if len(train_examples) == 0:
        print("❌ No valid training examples found. Check field names or file encoding.")
        return

    model = SentenceTransformer(BASE_MODEL, device=device)
    model.max_seq_length = MAX_SEQ_LENGTH

    dataloader = DataLoader(train_examples, shuffle=True, batch_size=BATCH_SIZE)
    train_loss = losses.CosineSimilarityLoss(model)

    total_steps = math.ceil(len(dataloader)) * EPOCHS
    warmup_steps = int(WARMUP_RATIO * total_steps)
    print(f"\nTraining config: epochs={EPOCHS}, batch_size={BATCH_SIZE}, steps={total_steps}, warmup={warmup_steps}")
    print("Training started...\n")

    model.fit(
        train_objectives=[(dataloader, train_loss)],
        epochs=EPOCHS,
        warmup_steps=warmup_steps,
        optimizer_params={'lr': LR},
        output_path=str(OUTPUT_DIR),
        show_progress_bar=True
    )

    print(f"\n✅ Training complete. Model saved to {OUTPUT_DIR.resolve()}")

if __name__ == "__main__":
    main()
