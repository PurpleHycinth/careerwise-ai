# train.py — one-click fine-tuning runner with validation, metrics & plots
import os
import json
import math
import random
from pathlib import Path
from typing import List, Tuple, Optional, Dict
import numpy as np
import torch
from sentence_transformers import SentenceTransformer, InputExample, losses
from torch.utils.data import DataLoader
from tqdm import tqdm
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
from scipy.stats import spearmanr, pearsonr
import matplotlib.pyplot as plt

# ==== CONFIGURATION ====
TRAIN_FILE = Path("D:/MSc/SEM 1/Python/Project/data_create/generated_rank_dataset_v2/processed_rank_v2/train_pairs.jsonl")
VAL_FILE: Optional[Path] = None  # set to Path(...) if you have a separate val file
BASE_MODEL = "all-MiniLM-L6-v2"
OUTPUT_DIR = Path("./fine-tuned-all-MiniLM-L6-v2-8")
BATCH_SIZE = 8
EPOCHS = 8
LR = 2e-5
MAX_SEQ_LENGTH = 256
WARMUP_RATIO = 0.1
SAMPLE_RAW_LINES = 5
VAL_SPLIT = 0.1  # used only if VAL_FILE is None
SEED = 42
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
PLOT_DPI = 150
# ========================

random.seed(SEED)
np.random.seed(SEED)
torch.manual_seed(SEED)

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

def parse_line_to_pair(obj: dict) -> Tuple[Optional[str], Optional[str], Optional[float], Optional[str]]:
    """
    Return (left_text, right_text, score, group_key)
    group_key is used to compute ranking metrics by grouping (e.g. all resumes for the same JD)
    """
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
    label = float(max(0.0, min(1.0, label)))
    # group_key: if file has an explicit id use it, else fallback to constant tag
    group_key = obj.get("query_id") or obj.get("jd_id") or "jd|resume"
    return a, b, label, str(group_key)

def load_jsonl(path: Path):
    examples = []
    raw_objs = []
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
            a, b, label, group = parse_line_to_pair(obj)
            if a is None:
                continue
            raw_objs.append((a, b, float(label), group))
            examples.append(InputExample(texts=[a, b], label=float(label)))
    return examples, raw_objs, total_lines, bad_lines

def train_val_split(raw_objs: List[Tuple[str,str,float,str]], val_split=0.1):
    random.shuffle(raw_objs)
    n_val = max(1, int(len(raw_objs) * val_split))
    val = raw_objs[:n_val]
    train = raw_objs[n_val:]
    return train, val

def examples_from_raw(raw_list: List[Tuple[str,str,float,str]]):
    return [InputExample(texts=[a,b], label=label) for a,b,label,_ in raw_list]

def compute_embeddings_and_scores(model: SentenceTransformer, pairs: List[Tuple[str,str,float,str]], batch_size=64, device=DEVICE):
    """
    Returns dict with:
      - preds: numpy array of predicted cosine similarities
      - labels: numpy array of ground truth labels
      - group_keys: list of group ids (same order)
      - lefts/rights: lists
    """
    model.eval()
    left_texts = [a for a,_,_,_ in pairs]
    right_texts = [b for _,b,_,_ in pairs]
    labels = np.array([label for _,_,label,_ in pairs], dtype=float)
    group_keys = [g for _,_,_,g in pairs]

    with torch.no_grad():
        left_emb = model.encode(left_texts, convert_to_numpy=True, show_progress_bar=False, batch_size=batch_size)
        right_emb = model.encode(right_texts, convert_to_numpy=True, show_progress_bar=False, batch_size=batch_size)

    # cosine similarities
    # normalize
    le = left_emb / np.linalg.norm(left_emb, axis=1, keepdims=True)
    re = right_emb / np.linalg.norm(right_emb, axis=1, keepdims=True)
    sims = np.sum(le * re, axis=1)
    # clip to [-1,1]
    sims = np.clip(sims, -1.0, 1.0)
    # rescale to [0,1] to compare with labels if labels are in [0,1]
    sims_01 = (sims + 1.0) / 2.0
    return {
        "preds_raw": sims,
        "preds": sims_01,
        "labels": labels,
        "group_keys": group_keys,
        "lefts": left_texts,
        "rights": right_texts
    }

def compute_pairwise_metrics(preds: np.ndarray, labels: np.ndarray) -> Dict[str, float]:
    # Pearson and Spearman require >1 unique values — guard accordingly
    m = {}
    try:
        pearson_r, pearson_p = pearsonr(preds, labels)
    except Exception:
        pearson_r, pearson_p = float("nan"), float("nan")
    try:
        spearman_r, spearman_p = spearmanr(preds, labels)
    except Exception:
        spearman_r, spearman_p = float("nan"), float("nan")
    mse = mean_squared_error(labels, preds)
    mae = mean_absolute_error(labels, preds)
    r2 = r2_score(labels, preds)
    m.update({
        "pearson_r": float(pearson_r),
        "pearson_p": float(pearson_p) if not np.isnan(pearson_p) else float("nan"),
        "spearman_r": float(spearman_r),
        "spearman_p": float(spearman_p) if not np.isnan(spearman_p) else float("nan"),
        "mse": float(mse),
        "mae": float(mae),
        "r2": float(r2)
    })
    return m

def compute_ranking_metrics(preds: np.ndarray, labels: np.ndarray, groups: List[str], k_list=[1,3,5]) -> Dict[str, float]:
    """
    Compute MRR and NDCG@k across grouped queries.
    groups: list of group ids aligned with preds/labels
    """
    from math import log2
    per_group = {}
    for p, l, g in zip(preds, labels, groups):
        per_group.setdefault(g, []).append((p, float(l)))
    mrrs = []
    ndcgs = {k: [] for k in k_list}
    for g, items in per_group.items():
        # sort by predicted descending
        items_sorted = sorted(items, key=lambda x: x[0], reverse=True)
        # MRR: reciprocal rank of first relevant item (label>0.5)
        rr = 0.0
        for rank_idx, (_, lab) in enumerate(items_sorted, start=1):
            if lab > 0.5:  # treat >0.5 as relevant; adjust threshold if needed
                rr = 1.0 / rank_idx
                break
        mrrs.append(rr)
        # DCG
        for k in k_list:
            topk = items_sorted[:k]
            dcg = 0.0
            for i, (_, lab) in enumerate(topk):
                # use graded relevance = label (assumes label in [0,1])
                gain = (2**lab - 1)
                denom = log2(i+2)
                dcg += gain / denom
            # Ideal DCG
            ideal_sorted = sorted([lab for _,lab in items], reverse=True)[:k]
            idcg = 0.0
            for i, lab in enumerate(ideal_sorted):
                idcg += (2**lab - 1) / log2(i+2)
            ndcg = (dcg / idcg) if idcg > 0 else 0.0
            ndcgs[k].append(ndcg)
    metrics = {}
    metrics["MRR"] = float(np.mean(mrrs)) if len(mrrs)>0 else 0.0
    for k in k_list:
        metrics[f"NDCG@{k}"] = float(np.mean(ndcgs[k])) if len(ndcgs[k])>0 else 0.0
    return metrics

def plot_and_save(preds, labels, out_dir: Path, prefix="model"):
    out_dir.mkdir(parents=True, exist_ok=True)
    # scatter plot
    plt.figure(figsize=(6,4), dpi=PLOT_DPI)
    plt.scatter(labels, preds, alpha=0.4, s=8)
    plt.xlabel("Ground truth label")
    plt.ylabel("Predicted similarity (0..1)")
    plt.title(f"{prefix} — labels vs preds")
    plt.grid(True, linewidth=0.3)
    scatter_path = out_dir / f"{prefix}_scatter_labels_vs_preds.png"
    plt.tight_layout()
    plt.savefig(scatter_path)
    plt.close()

    # histogram of residuals
    residuals = preds - labels
    plt.figure(figsize=(6,4), dpi=PLOT_DPI)
    plt.hist(residuals, bins=60)
    plt.xlabel("Prediction - Label")
    plt.title(f"{prefix} — residuals histogram")
    plt.grid(True, linewidth=0.3)
    resid_path = out_dir / f"{prefix}_residuals_hist.png"
    plt.tight_layout()
    plt.savefig(resid_path)
    plt.close()

    return str(scatter_path), str(resid_path)

def evaluate_model(model: SentenceTransformer, pairs_raw, out_dir: Path, prefix="model"):
    eval_res = compute_embeddings_and_scores(model, pairs_raw, batch_size=128, device=DEVICE)
    preds = eval_res["preds"]
    labels = eval_res["labels"]
    groups = eval_res["group_keys"]

    pair_metrics = compute_pairwise_metrics(preds, labels)
    ranking_metrics = compute_ranking_metrics(preds, labels, groups, k_list=[1,3,5])
    scatter_path, resid_path = plot_and_save(preds, labels, out_dir, prefix)

    combined = {
        "pair_metrics": pair_metrics,
        "ranking_metrics": ranking_metrics,
        "plots": {"scatter": scatter_path, "residuals": resid_path},
        "n_examples": int(len(labels))
    }
    return combined

def main():
    print(f"Device detected: {DEVICE}")
    print_file_head(TRAIN_FILE)

    all_examples, raw_objs, total_lines, bad_lines = load_jsonl(TRAIN_FILE)
    print(f"Total lines in file: {total_lines}")
    print(f"Total usable pairs parsed: {len(raw_objs)}")
    if bad_lines:
        print("Some JSON decode errors (up to 5 shown):")
        for ln, err in bad_lines:
            print(f"  line {ln}: {err}")

    if len(raw_objs) == 0:
        print("❌ No valid training examples found. Check field names or file encoding.")
        return

    # Prepare train/val
    if VAL_FILE and VAL_FILE.exists():
        _, val_raw_objs, _, _ = load_jsonl(VAL_FILE)
        train_raw_objs = raw_objs
        val_raw_objs = val_raw_objs
    else:
        train_raw_objs, val_raw_objs = train_val_split(raw_objs, VAL_SPLIT)
    print(f"Train pairs: {len(train_raw_objs)}, Val pairs: {len(val_raw_objs)}")

    train_examples = examples_from_raw(train_raw_objs)
    dataloader = DataLoader(train_examples, shuffle=True, batch_size=BATCH_SIZE)

    # Instantiate base model and evaluate on validation before fine-tuning
    base_model = SentenceTransformer(BASE_MODEL, device=DEVICE)
    base_model.max_seq_length = MAX_SEQ_LENGTH

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    metrics_out = {}

    print("\n=== Evaluating base model on validation set ===")
    base_eval = evaluate_model(base_model, val_raw_objs, OUTPUT_DIR, prefix="base_model")
    metrics_out["base_eval"] = base_eval
    print(json.dumps(base_eval["pair_metrics"], indent=2))
    print("Ranking metrics:", base_eval["ranking_metrics"])

    # Prepare training
    model = SentenceTransformer(BASE_MODEL, device=DEVICE)
    model.max_seq_length = MAX_SEQ_LENGTH
    train_loss = losses.CosineSimilarityLoss(model)
    total_steps = math.ceil(len(dataloader)) * EPOCHS
    warmup_steps = int(WARMUP_RATIO * total_steps)
    print(f"\nTraining config: epochs={EPOCHS}, batch_size={BATCH_SIZE}, steps={total_steps}, warmup={warmup_steps}")
    print("Training started...\n")

    # train
    model.fit(
        train_objectives=[(dataloader, train_loss)],
        epochs=EPOCHS,
        warmup_steps=warmup_steps,
        optimizer_params={'lr': LR},
        output_path=str(OUTPUT_DIR),
        show_progress_bar=True
    )

    print(f"\n✅ Training complete. Model saved to {OUTPUT_DIR.resolve()}")

    # Load fine-tuned model from output path (safe)
    ft_model = SentenceTransformer(str(OUTPUT_DIR), device=DEVICE)
    ft_model.max_seq_length = MAX_SEQ_LENGTH

    print("\n=== Evaluating fine-tuned model on validation set ===")
    ft_eval = evaluate_model(ft_model, val_raw_objs, OUTPUT_DIR, prefix="fine_tuned")
    metrics_out["fine_tuned_eval"] = ft_eval
    print(json.dumps(ft_eval["pair_metrics"], indent=2))
    print("Ranking metrics:", ft_eval["ranking_metrics"])

    # Save metrics summary
    metrics_json_path = OUTPUT_DIR / "evaluation_metrics_summary.json"
    with open(metrics_json_path, "w", encoding="utf-8") as f:
        json.dump(metrics_out, f, indent=2)
    print(f"\nSaved metrics & plots to: {OUTPUT_DIR.resolve()}")
    print(f"Metrics summary JSON: {metrics_json_path}")

    # Side-by-side comparison plot of a few numeric metrics
    try:
        labels = ["pearson_r", "spearman_r", "mse", "mae", "r2", "MRR", "NDCG@1"]
        base_pm = base_eval["pair_metrics"]
        ft_pm = ft_eval["pair_metrics"]
        base_rm = base_eval["ranking_metrics"]
        ft_rm = ft_eval["ranking_metrics"]

        comp_vals_base = [
            base_pm.get("pearson_r", 0.0),
            base_pm.get("spearman_r", 0.0),
            -base_pm.get("mse", 0.0),   # invert MSE/MAE so higher is better for plotting
            -base_pm.get("mae", 0.0),
            base_pm.get("r2", 0.0),
            base_rm.get("MRR", 0.0),
            base_rm.get("NDCG@1", 0.0)
        ]
        comp_vals_ft = [
            ft_pm.get("pearson_r", 0.0),
            ft_pm.get("spearman_r", 0.0),
            -ft_pm.get("mse", 0.0),
            -ft_pm.get("mae", 0.0),
            ft_pm.get("r2", 0.0),
            ft_rm.get("MRR", 0.0),
            ft_rm.get("NDCG@1", 0.0)
        ]

        x = np.arange(len(labels))
        width = 0.35
        plt.figure(figsize=(9,4), dpi=PLOT_DPI)
        plt.bar(x - width/2, comp_vals_base, width, label='base')
        plt.bar(x + width/2, comp_vals_ft, width, label='fine-tuned')
        plt.xticks(x, labels, rotation=30, ha='right')
        plt.title("Comparison (note: lower-is-better metrics like MSE are inverted for plotting)")
        plt.legend()
        plt.tight_layout()
        comp_path = OUTPUT_DIR / "comparison_metrics_bar.png"
        plt.savefig(comp_path)
        plt.close()
        print(f"Saved comparison plot: {comp_path}")
    except Exception as e:
        print("Could not create comparison plot:", e)

if __name__ == "__main__":
    main()
