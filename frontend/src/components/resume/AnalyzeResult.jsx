// src/components/resume/AnalyzeResult.jsx
import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";

/**
 * AnalyzeResult
 * Props:
 *   - uploadedMeta: { job_description: string, file_ids: string[] }
 *
 * Backend result shape supported:
 *  - { ranked_resumes: [...] }
 *  - { results: [...] }
 *  - or an array itself
 *
 * Each resume item expected to contain at least:
 *  - file_id or filename
 *  - local_path (optional)
 *  - cloud_path (optional)
 *  - score or raw_score
 *  - suggested_edits or skill_suggestions
 *  - top_resume_sentences / resume_to_jd_matches / sentence_scores
 */

export default function AnalyzeResult({ uploadedMeta }) {
  const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";
  const ANALYZE_URL = `${API_BASE.replace(/\/$/, "")}/analyze/`;
  const FILE_SERVE_BASE = `${API_BASE.replace(/\/$/, "")}/files`;

  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    // clear previous results when uploadedMeta changes
    setResult(null);
    setError(null);
    setFilter("");
  }, [uploadedMeta]);

  // normalize result list to an array of items
  const resumes = useMemo(() => {
    if (!result) return [];
    if (Array.isArray(result)) return result;
    if (Array.isArray(result.ranked_resumes)) return result.ranked_resumes;
    if (Array.isArray(result.results)) return result.results;
    // fallback: object with single result
    return [];
  }, [result]);

  // filter by filename or original_filename or file_id
  const filteredResumes = useMemo(() => {
    if (!filter) return resumes;
    const q = filter.trim().toLowerCase();
    return resumes.filter((r) => {
      const name = (r.filename || r.file_id || r.original_filename || "").toString().toLowerCase();
      const local = (r.local_path || "").toString().toLowerCase();
      const cloud = (r.cloud_path || "").toString().toLowerCase();
      return name.includes(q) || local.includes(q) || cloud.includes(q);
    });
  }, [resumes, filter]);

  const buildFileUrl = (item) => {
    // prefer cloud_path, then local_path (if served), then file serve base + file_id/filename
    if (!item) return null;
    const cand = item.cloud_path || item.local_path || item.filename || item.file_id || "";
    if (!cand) return null;
    // if already a full URL, return as-is
    if (/^https?:\/\//i.test(cand)) return cand;
    // else, try cloud_path when cloud base is provided
    if (item.cloud_path && !/^https?:\/\//i.test(item.cloud_path)) {
      // if cloud_path is relative, try FILE_SERVE_BASE fallback
      return `${FILE_SERVE_BASE}/${encodeURIComponent(item.cloud_path)}`;
    }
    // if local path contains separators, it might not be directly serveable; fallback to files endpoint with filename/file_id
    const id = item.filename || item.file_id || PathFromLocal(cand);
    return `${FILE_SERVE_BASE}/${encodeURIComponent(id)}`;
  };

  // helper: extract filename from a local path
  const PathFromLocal = (localPath) => {
    if (!localPath) return "";
    const parts = localPath.replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] || localPath;
  };

  // click-to-copy helper
  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text || "");
      // quick feedback
      // eslint-disable-next-line no-alert
      alert("Path copied to clipboard");
    } catch (e) {
      // fallback
      // eslint-disable-next-line no-alert
      alert("Failed to copy to clipboard");
    }
  };

  const handleAnalyze = async () => {
    if (!uploadedMeta || !Array.isArray(uploadedMeta.file_ids) || uploadedMeta.file_ids.length === 0) {
      // eslint-disable-next-line no-alert
      return alert("Please upload job description and at least one resume first.");
    }
    setAnalyzing(true);
    setError(null);
    setResult(null);
    try {
      const payload = {
        job_description: uploadedMeta.job_description || "",
        file_ids: uploadedMeta.file_ids,
      };
      const res = await axios.post(ANALYZE_URL, payload, { timeout: 120000 });
      setResult(res.data);
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.message || err.message || "Analysis failed";
      setError(msg);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="analyze-result card" style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Resume Analysis</h3>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            className="btn"
            onClick={() => {
              if (!uploadedMeta) return alert("No uploaded job/resumes found.");
              navigator.clipboard?.writeText(uploadedMeta.job_description || "");
              // eslint-disable-next-line no-alert
              alert("Job description copied to clipboard.");
            }}
            type="button"
          >
            Copy JD
          </button>

          <button className="btn primary" onClick={handleAnalyze} disabled={analyzing} type="button">
            {analyzing ? "Analyzing..." : "Analyze"}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div className="muted" style={{ marginBottom: 8 }}>
          This will send the uploaded file IDs and job description to <code>/analyze/</code> endpoint.
        </div>

        {error && (
          <div className="error" style={{ marginBottom: 8 }}>
            {error}
          </div>
        )}

        {analyzing && (
          <div style={{ marginBottom: 8 }} className="muted">
            Processing... please wait.
          </div>
        )}
      </div>

      {/* search/filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          placeholder="Search by filename or path..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #e6edf3" }}
        />
        <div style={{ minWidth: 140, display: "flex", gap: 8 }}>
          <button
            className="btn"
            onClick={() => {
              setFilter("");
            }}
            type="button"
          >
            Clear
          </button>
          <button
            className="btn"
            onClick={() => {
              if (!result) return;
              // copy first file url if exists
              const first = resumes[0];
              const u = buildFileUrl(first);
              if (u) copyToClipboard(u);
            }}
            type="button"
          >
            Copy first file URL
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="result">
        {resumes && resumes.length > 0 ? (
          filteredResumes.length > 0 ? (
            <div style={{ display: "grid", gap: 12 }}>
              {filteredResumes.map((r, idx) => {
                // normalize common fields
                const filename = r.filename || r.file_id || r.original_filename || PathFromLocal(r.local_path || "");
                const fileUrl = buildFileUrl(r);
                // score normalization: prefer score (0-100) then raw_score (0-1)
                let scoreDisplay = "—";
                if (typeof r.score === "number") scoreDisplay = `${r.score}%`;
                else if (typeof r.raw_score === "number") scoreDisplay = `${Math.round(r.raw_score * 100)}%`;
                else if (typeof r.match === "number") scoreDisplay = `${Math.round(r.match * 100)}%`;

                const suggestions = r.suggested_edits || (r.skill_suggestions && r.skill_suggestions.missing) || [];

                return (
                  <div
                    key={filename + idx}
                    style={{
                      display: "flex",
                      gap: 14,
                      alignItems: "flex-start",
                      padding: 12,
                      borderRadius: 12,
                      background: "linear-gradient(180deg,#fff,#fbfdff)",
                      boxShadow: "0 8px 20px rgba(16,24,40,0.04)",
                    }}
                  >
                    {/* Left: preview + actions */}
                    <div style={{ width: 180, minWidth: 140, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #eef2f6", height: 190 }}>
                        {fileUrl ? (
                          // embed if pdf else show file icon/filename
                          /\.pdf$/i.test(filename) ? (
                            <a href={fileUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", width: "100%", height: "190px" }}>
                              <object data={fileUrl} type="application/pdf" width="100%" height="190">
                                <div style={{ padding: 12 }}>
                                  <strong>{filename}</strong>
                                  <div className="muted small">Preview not available — click to open</div>
                                </div>
                              </object>
                            </a>
                          ) : (
                            <a href={fileUrl} target="_blank" rel="noopener noreferrer" style={{ display: "flex", height: "190px", alignItems: "center", justifyContent: "center", textDecoration: "none", color: "inherit" }}>
                              <div style={{ textAlign: "center", padding: 12 }}>
                                <div style={{ fontWeight: 700 }}>{filename}</div>
                                <div className="muted small">Open file</div>
                              </div>
                            </a>
                          )
                        ) : (
                          <div style={{ padding: 12 }}>
                            <strong>{filename}</strong>
                            <div className="muted small">No file URL</div>
                          </div>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <div style={{ width: 56, height: 56, borderRadius: 999, background: "#fff", boxShadow: "inset 0 -10px 20px rgba(37,99,235,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>
                            <div style={{ textAlign: "center" }}>
                              <div style={{ fontSize: 16 }}>{parseInt((r.raw_score ?? r.score ?? 0) * (r.raw_score ? 100 : 1), 10) || 0}</div>
                              <div style={{ fontSize: 11, color: "#6b7280" }}>Score</div>
                            </div>
                          </div>

                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <div style={{ fontWeight: 700 }}>{scoreDisplay}</div>
                            <div className="muted small">Relevance to JD</div>
                          </div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {fileUrl && (
                            <a className="btn" href={fileUrl} target="_blank" rel="noopener noreferrer">
                              Open
                            </a>
                          )}
                          <button
                            className="btn"
                            onClick={() => {
                              // show both cloud/local paths if available
                              const cp = r.cloud_path || "";
                              const lp = r.local_path || "";
                              const toCopy = cp || lp || filename;
                              copyToClipboard(toCopy);
                            }}
                            type="button"
                          >
                            Copy Path
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Right: details */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 16 }}>{r.original_filename ? `${r.original_filename}` : ""}</div>
                          <div className="muted small" style={{ marginTop: 6 }}>
                            Id: {filename}
                          </div>
                        </div>

                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>{scoreDisplay}</div>
                          <div className="muted small">Match</div>
                        </div>
                      </div>

                      {/* show paths */}
                      <div style={{ marginTop: 8 }}>
                        {r.cloud_path && (
                          <div style={{ fontSize: 12, marginBottom: 4 }}>
                            <strong>Cloud:</strong>{" "}
                            <a href={r.cloud_path} target="_blank" rel="noopener noreferrer">
                              {r.cloud_path}
                            </a>
                          </div>
                        )}
                        {r.local_path && (
                          <div style={{ fontSize: 12, color: "#6b7280" }}>
                            <strong>Local:</strong> {r.local_path}
                          </div>
                        )}
                      </div>

                      {/* Top sentences */}
                      {Array.isArray(r.top_resume_sentences) && r.top_resume_sentences.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontWeight: 700, marginBottom: 6 }}>Top matched phrases</div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {r.top_resume_sentences.slice(0, 8).map((s, i) => (
                              <div key={i} className="chip" style={{ padding: "6px 10px", borderRadius: 999, background: "#eef2ff", fontSize: 13 }}>
                                {s.sent}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* matches
                      {Array.isArray(r.resume_to_jd_matches) && r.resume_to_jd_matches.length > 0 && (
                        <div style={{ marginTop: 12 }}>
                          <div style={{ fontWeight: 700, marginBottom: 6 }}>Why this matched</div>
                          <div style={{ display: "grid", gap: 8 }}>
                            {r.resume_to_jd_matches.slice(0, 6).map((m, i) => {
                              const preview = m.matches && m.matches[0];
                              return (
                                <div key={i} style={{ padding: 10, borderRadius: 10, background: "#fff", border: "1px solid rgba(14, 165, 233, 0.06)" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                    <div style={{ fontWeight: 700 }}>{m.resume_sent}</div>
                                    <div className="muted small">{preview ? `${Math.round(preview.score * 100)}% JD match` : ""}</div>
                                  </div>
                                  {preview && (
                                    <div className="muted small" style={{ marginTop: 6 }}>
                                      {preview.jd_sent.length > 180 ? preview.jd_sent.slice(0, 180) + "…" : preview.jd_sent}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )} */}

                      {/* suggestions */}
                      {Array.isArray(suggestions) && suggestions.length > 0 && (
                        <div style={{ marginTop: 12 }}>
                          <div style={{ fontWeight: 700, marginBottom: 6 }}>Suggestions</div>
                          <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {suggestions.slice(0, 6).map((sug, i) => (
                              <li key={i} style={{ marginBottom: 6 }}>
                                {sug}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="muted">No files match that search.</div>
          )
        ) : result ? (
          <div>
            <pre className="result-box">{JSON.stringify(result, null, 2)}</pre>
          </div>
        ) : (
          <div className="muted">No results yet. Upload resumes and click Analyze.</div>
        )}
      </div>
    </div>
  );
}
