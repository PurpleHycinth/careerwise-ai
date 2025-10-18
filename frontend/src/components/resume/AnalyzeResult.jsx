// src/components/resume/AnalyzeResult.jsx
import React, { useEffect, useState } from 'react'
import axios from 'axios'

/**
 * AnalyzeResult: improved visual layout
 * - Expects uploadedMeta = { job_description: string, file_ids: string[] }
 * - Posts to /analyze/ -> expects result.ranked_resumes array (see sample JSON)
 * - Displays PDF thumbnail (embed), score, top sentences and resume-to-JD matches/suggestions
 *
 * NOTE: Ensure your backend serves uploaded files at the URL pattern:
 *   <FILE_SERVE_BASE>/<filename>
 * e.g. http://127.0.0.1:8000/files/b6f15c46-....pdf
 *
 * If your file URLs are different, change fileServeBase below accordingly.
 */

export default function AnalyzeResult({ uploadedMeta }) {
  const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000'
  const ANALYZE_URL = `${API_BASE.replace(/\/$/, '')}/analyze/`
  // Where the uploaded files are served from. Adjust if your backend exposes a different path.
  const fileServeBase = `${API_BASE.replace(/\/$/, '')}/files` // e.g. http://127.0.0.1:8000/files/<filename>

  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    setResult(null)
    setError(null)
  }, [uploadedMeta])

  const handleAnalyze = async () => {
    if (!uploadedMeta || !Array.isArray(uploadedMeta.file_ids) || uploadedMeta.file_ids.length === 0) {
      return alert('Please upload job description and at least one resume first.')
    }

    setAnalyzing(true)
    setError(null)
    setResult(null)

    try {
      const payload = {
        job_description: uploadedMeta.job_description || '',
        file_ids: uploadedMeta.file_ids
      }

      const res = await axios.post(ANALYZE_URL, payload, { timeout: 120000 })
      setResult(res.data)
    } catch (err) {
      console.error(err)
      const msg = err?.response?.data?.message || err.message || 'Analysis failed'
      setError(msg)
    } finally {
      setAnalyzing(false)
    }
  }

  // small util to open PDF in new tab
  const pdfUrl = (filename) => {
    if (!filename) return null
    // if filename is full URL already, return it
    if (/^https?:\/\//.test(filename)) return filename
    return `${fileServeBase.replace(/\/$/, '')}/${encodeURIComponent(filename)}`
  }

  return (
    <div className="analyze-result card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Resume Analysis</h3>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            className="btn"
            onClick={() => {
              if (!uploadedMeta) return alert('No uploaded job/resumes found.')
              navigator.clipboard?.writeText(uploadedMeta.job_description || '')
              alert('Job description copied to clipboard.')
            }}
            type="button"
          >
            Copy JD
          </button>

          <button className="btn primary" onClick={handleAnalyze} disabled={analyzing} type="button">
            {analyzing ? 'Analyzing...' : 'Analyze'}
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

      {/* Results */}
      <div className="result">
        {result && Array.isArray(result.ranked_resumes) && result.ranked_resumes.length > 0 ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {result.ranked_resumes.map((r, idx) => (
              <div key={r.filename || idx} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: 12, borderRadius: 12, background: 'linear-gradient(180deg,#fff,#fbfdff)', boxShadow: '0 8px 20px rgba(16,24,40,0.04)' }}>
                {/* Left column: thumbnail */}
                <div style={{ width: 160, minWidth: 120, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #eef2f6' }}>
                    {/* Embedding PDF as thumbnail. Click opens full PDF in new tab */}
                    {pdfUrl(r.filename) ? (
                      <a href={pdfUrl(r.filename)} target="_blank" rel="noopener noreferrer" style={{ display: 'block', width: '100%', height: 190 }}>
                        <object
                          data={pdfUrl(r.filename)}
                          type="application/pdf"
                          width="100%"
                          height="190"
                          aria-label={`${r.filename} preview`}
                          style={{ display: 'block' }}
                        >
                          {/* fallback if object/embed not supported */}
                          <div style={{ padding: 12 }}>
                            <strong>{r.filename}</strong>
                            <div className="muted small">Preview not available — click to download</div>
                          </div>
                        </object>
                      </a>
                    ) : (
                      <div style={{ padding: 12 }}>
                        <strong>{r.filename}</strong>
                        <div className="muted small">File not found</div>
                      </div>
                    )}
                  </div>

                  {/* score summary below thumbnail */}
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ width: 56, height: 56, borderRadius: 999, background: '#fff', boxShadow: 'inset 0 -10px 20px rgba(37,99,235,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 16 }}>{Math.round((r.raw_score ?? r.score ?? 0) * 100) || Math.round(r.score ?? 0)}</div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>Score</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontWeight: 700 }}>{(r.score ?? (r.raw_score ? (r.raw_score * 100).toFixed(2) : '—'))}%</div>
                        <div className="muted small">Relevance to JD</div>
                      </div>
                    </div>

                    <div>
                      <a className="btn" href={pdfUrl(r.filename)} target="_blank" rel="noopener noreferrer">Open</a>
                    </div>
                  </div>
                </div>

                {/* Right column: details */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{r.filename}</div>
                      <div className="muted small" style={{ marginTop: 6 }}>{/* optional metadata */}{r.meta && r.meta.summary ? r.meta.summary : ''}</div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{Math.round((r.raw_score ?? 0) * 100)}%</div>
                      <div className="muted small">Match</div>
                    </div>
                  </div>

                  {/* Top sentences (chips) */}
                  {Array.isArray(r.top_resume_sentences) && r.top_resume_sentences.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>Top matched phrases</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {r.top_resume_sentences.slice(0, 8).map((s, i) => (
                          <div key={i} className="chip" style={{ padding: '6px 10px', borderRadius: 999, background: '#eef2ff', fontSize: 13 }}>{s.sent}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* resume_to_jd matches -> suggestions */}
                  {Array.isArray(r.resume_to_jd_matches) && r.resume_to_jd_matches.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>Why this matched</div>
                      <div style={{ display: 'grid', gap: 8 }}>
                        {r.resume_to_jd_matches.slice(0, 6).map((m, i) => {
                          // each m: { resume_idx, resume_sent, matches: [{ jd_idx, jd_sent, score }] }
                          const preview = m.matches && m.matches[0]
                          return (
                            <div key={i} style={{ padding: 10, borderRadius: 10, background: '#fff', border: '1px solid rgba(14, 165, 233, 0.06)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                <div style={{ fontWeight: 700 }}>{m.resume_sent}</div>
                                <div className="muted small">{preview ? `${Math.round(preview.score * 100)}% JD match` : ''}</div>
                              </div>
                              {preview && (
                                <div className="muted small" style={{ marginTop: 6 }}>{preview.jd_sent.length > 180 ? preview.jd_sent.slice(0, 180) + '…' : preview.jd_sent}</div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Optional: show short excerpts or sentence_scores */}
                  {Array.isArray(r.sentence_scores) && r.sentence_scores.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontWeight: 700 }}>Highlighted snippets</div>
                        <div className="muted small">{r.sentence_scores.length} sentences</div>
                      </div>
                      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {r.sentence_scores.slice(0, 6).map((ss, i) => (
                          <div key={i} style={{ padding: '8px 10px', borderRadius: 10, background: '#f8fafc', fontSize: 13 }}>{ss.sent}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : result ? (
          // result exists but no ranked_resumes array
          <div>
            <pre className="result-box">{JSON.stringify(result, null, 2)}</pre>
          </div>
        ) : (
          <div className="muted">No results yet. Upload resumes and click Analyze.</div>
        )}
      </div>
    </div>
  )
}
