// src/components/career/CareerFinder.jsx
import React, { useState, useRef } from "react"
import { motion } from "framer-motion"

/**
 * CareerFinder
 * - Requires user to input a career goal and upload a resume (PDF/DOCX).
 * - Sends multipart/form-data to /career/upload_and_analyze/
 * - Renders parsed resume, advice (courses/jobs/universities), and external jobs.
 */

export default function CareerFinder() {
  const [file, setFile] = useState(null)
  const [goal, setGoal] = useState("") // required by backend
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

  const onFileChange = (e) => {
    setError(null)
    setResult(null)
    const f = e.target.files?.[0] || null
    if (!f) {
      setFile(null)
      return
    }
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]
    if (!allowed.includes(f.type) && !f.name.toLowerCase().endsWith(".docx") && !f.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF or DOCX files are allowed.")
      setFile(null)
      return
    }
    if (f.size > MAX_BYTES) {
      setError("File too large. Maximum allowed size is 10 MB.")
      setFile(null)
      return
    }
    setFile(f)
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    setError(null)
    setResult(null)

    if (!file) {
      setError("Please select a resume file first.")
      return
    }
    if (!goal.trim()) {
      setError("Please enter your career goal — it's required.")
      return
    }

    setLoading(true)
    setProgress(5)

    try {
      const fd = new FormData()
      fd.append("resume", file)
      fd.append("goal", goal) // required by backend

      const xhr = new XMLHttpRequest()
      xhr.open("POST", `${import.meta.env.VITE_API_BASE}/career/upload_and_analyze/`)

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          const pct = Math.round((ev.loaded / ev.total) * 85)
          setProgress(Math.min(85, pct))
        }
      }

      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText)
              setResult(normalizeResponse(data))
              setProgress(100)
            } catch (err) {
              setError("Server returned invalid JSON.")
            }
          } else {
            const txt = xhr.responseText || xhr.statusText || `HTTP ${xhr.status}`
            setError(`Upload failed: ${txt}`)
          }
          setLoading(false)
          setTimeout(() => setProgress(0), 500)
        }
      }

      xhr.send(fd)
    } catch (err) {
      console.error(err)
      setError(err.message || "Upload failed")
      setLoading(false)
      setProgress(0)
    }
  }

  const normalizeResponse = (resp) => {
    if (!resp) return null
    return {
      filename: resp.filename || null,
      parsed: resp.parsed || null,
      advice: resp.advice || { course_suggestions: [], job_suggestions: [], university_suggestions: [] },
      external_jobs: resp.external_jobs || []
    }
  }

  const downloadJson = () => {
    if (!result) return
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = (result.filename ? result.filename.replace(/\.(pdf|docx)$/i, "") : "career_result") + "_parsed.json"
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="panel career-panel card">
      <div className="panel-head">
        <h2>Career Path Finder</h2>
        <p className="muted">Upload your resume and describe your career goal. We'll analyze your resume and suggest courses, roles, and job listings.</p>
      </div>

      <form className="career-form" onSubmit={handleUpload}>
        <div className="row">
          <label className="label">Your Career Goal *</label>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Example: I want to become a Data Scientist focusing on NLP and production ML systems."
            rows={3}
            required
          />
        </div>

        <div className="row">
          <label className="label">Upload Resume *</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf, .docx, application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={onFileChange}
            disabled={loading}
          />
          <div className="muted small" style={{ marginTop: 6 }}>
            Max size: 10 MB | Accepted: PDF, DOCX
          </div>
        </div>

        <div className="actions" style={{ marginTop: 12 }}>
          <button className="btn primary" type="submit" disabled={!file || loading}>
            {loading ? <LoaderInline /> : "Analyze Resume"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setFile(null)
              setGoal("")
              setResult(null)
              setError(null)
              setProgress(0)
              if (fileInputRef.current) fileInputRef.current.value = ""
            }}
            disabled={loading}
            style={{ marginLeft: 8 }}
          >
            Reset
          </button>

          <div style={{ flex: 1 }} />
          {progress > 0 && (
            <div style={{ width: 180, textAlign: "right", fontSize: 12 }}>
              <div className="muted small">Progress: {progress}%</div>
            </div>
          )}
        </div>
      </form>

      {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}

      {result && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} style={{ marginTop: 16 }}>
          <ParsedResumeCard parsed={result.parsed} filename={result.filename} />
          <AdviceSection advice={result.advice} />
          <JobList jobs={result.external_jobs} />
          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={downloadJson}>Download JSON</button>
          </div>
        </motion.div>
      )}
    </div>
  )
}

/* ---------- small UI components and renderers ---------- */

function LoaderInline() {
  return (
    <span className="loader-inline" aria-hidden>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="2" opacity="0.18" />
        <path d="M22 12a10 10 0 0 0-10-10" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  )
}

/* ---------- helper: try parse JSON-like strings ---------- */
function parseMaybeJSON(value) {
  if (!value) return null
  if (typeof value === 'object') return value
  const s = String(value).trim()
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
    try {
      return JSON.parse(s)
    } catch (e) {
      try {
        const fixed = s.replace(/'/g, '"')
        return JSON.parse(fixed)
      } catch (e2) {
        return value
      }
    }
  }
  return value
}

/* ---------- ParsedResumeCard ---------- */
function ParsedResumeCard({ parsed, filename }) {
  if (!parsed) {
    return <div className="result-box muted">No parsed data returned.</div>
  }

  const name = parsed.name || parsed.full_name || parsed.title || "Unnamed"
  const totalExp = parsed.total_experience || parsed.experience_years || parsed.experience || "N/A"
  const skills = Array.isArray(parsed.skills) ? parsed.skills : (typeof parsed.skills === 'string' ? parsed.skills.split(/[,;]+/).map(s=>s.trim()) : [])
  const education = Array.isArray(parsed.education) ? parsed.education : (parsed.education ? [parsed.education] : [])
  const experience = Array.isArray(parsed.experience) ? parsed.experience : (parsed.experience ? [parsed.experience] : [])

  return (
    <div className="result-box parsed-card">
      <div className="parsed-card-head">
        <div className="parsed-name">{name}</div>
        <div className="parsed-meta">
          <span className="badge">Experience: {totalExp}</span>
          {filename && <span className="filename muted">{filename}</span>}
        </div>
      </div>

      {skills.length > 0 && (
        <div className="parsed-section">
          <div className="parsed-section-title">Top skills</div>
          <div className="chips">
            {skills.slice(0, 12).map((s, i) => <span key={i} className="chip">{s}</span>)}
          </div>
        </div>
      )}

      {education.length > 0 && (
        <div className="parsed-section">
          <div className="parsed-section-title">Education</div>
          <ul>
            {education.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {experience.length > 0 && (
        <div className="parsed-section">
          <div className="parsed-section-title">Experience (highlights)</div>
          <ul>
            {experience.slice(0, 6).map((ex, i) => <li key={i}>{ex}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

/* ---------- AdviceSection & renderers ---------- */
function AdviceSection({ advice = {} }) {
  const parseList = (arr) => {
    if (!Array.isArray(arr)) return []
    return arr.map(it => parseMaybeJSON(it))
  }

  const courses = parseList(advice.course_suggestions || advice.courses || [])
  const jobs = parseList(advice.job_suggestions || advice.jobs || [])
  const unis = parseList(advice.university_suggestions || advice.universities || [])

  return (
    <div style={{ marginTop: 12 }}>
      <h4>Career Advice</h4>
      <div className="advice-grid">
        <Card title="Courses" items={courses} renderItem={renderCourse} />
        <Card title="Jobs" items={jobs} renderItem={renderJobSuggestion} />
        <Card title="Universities" items={unis} renderItem={renderUniversity} />
      </div>
    </div>
  )
}

function renderCourse(item) {
  if (!item) return null
  if (typeof item === 'string') return <div>{item}</div>
  const name = item.course_name || item.title || item.name || JSON.stringify(item)
  const platform = item.platform ? <div className="muted small">{item.platform}</div> : null
  const why = item.why_recommended || item.description || null
  const dur = item.estimated_duration ? <span className="muted small"> • {item.estimated_duration}</span> : null
  return (
    <div className="advice-item">
      <div className="advice-item-title">{name}{dur}</div>
      {platform}
      {why && <div className="muted small" style={{ marginTop: 6 }}>{why}</div>}
    </div>
  )
}

function renderJobSuggestion(item) {
  if (!item) return null
  if (typeof item === 'string') return <div>{item}</div>
  const title = item.job_title || item.title || item.role || JSON.stringify(item)
  const companyType = item.company_type ? <div className="muted small">{item.company_type}</div> : null
  const skills = Array.isArray(item.required_skills) ? item.required_skills : (item.required_skills ? [item.required_skills] : [])
  const why = item.why_suitable || item.reason || null
  return (
    <div className="advice-item">
      <div className="advice-item-title">{title}</div>
      {companyType}
      {skills.length > 0 && <div style={{ marginTop: 6 }}>{skills.slice(0,6).map((s,i)=> <span key={i} className="chip tiny">{s}</span>)}</div>}
      {why && <div className="muted small" style={{ marginTop: 6 }}>{why}</div>}
    </div>
  )
}

function renderUniversity(item) {
  if (!item) return null
  if (typeof item === 'string') return <div>{item}</div>
  const name = item.name || item.university || item.title || JSON.stringify(item)
  const why = item.reason || item.justification || item.notes
  return (
    <div className="advice-item">
      <div className="advice-item-title">{name}</div>
      {why && <div className="muted small" style={{ marginTop: 6 }}>{why}</div>}
    </div>
  )
}

/* ---------- Card component ---------- */
function Card({ title, items = [], emptyMsg = "No items.", renderItem }) {
  return (
    <div className="card small-card advice-card">
      <div className="card-head">
        <strong>{title}</strong>
        <span className="muted small">{items.length}</span>
      </div>
      <div className="card-body">
        {items.length === 0 ? (
          <div className="muted small">No {title.toLowerCase()} suggestions.</div>
        ) : items.slice(0, 8).map((it, i) => (
          <div key={i} className="advice-row">
            {renderItem ? renderItem(it) : (typeof it === 'string' ? <div>{it}</div> : <pre>{JSON.stringify(it, null, 2)}</pre>)}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- JobList & JobCard ---------- */
function JobList({ jobs = [] }) {
  const normalized = Array.isArray(jobs) ? jobs.map(j => parseMaybeJSON(j)) : []
  if (!normalized.length) {
    return (
      <div style={{ marginTop: 12 }}>
        <h4>External Jobs</h4>
        <div className="muted small">No external jobs found.</div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 12 }}>
      <h4>External Jobs</h4>
      <div className="jobs-grid">
        {normalized.map((j, i) => <JobCard key={i} job={j} />)}
      </div>
    </div>
  )
}

function JobCard({ job = {} }) {
  const j = parseMaybeJSON(job)
  const title = j.title || j.job_title || j.name || "Untitled"
  const company = j.company || j.employer || j.company_name || ""
  const location = j.location || j.city || ""
  const url = j.url || j.link || null
  const snippet = j.snippet || j.summary || j.description || j.resume_match_snippet || null

  return (
    <a className="job-card" href={url || "#"} target={url ? "_blank" : undefined} rel={url ? "noopener noreferrer" : undefined}>
      <div className="job-top">
        <div className="job-title">{title}</div>
        <div className="muted small">{company}{location ? ` • ${location}` : ""}</div>
      </div>
      {snippet && <div className="job-snippet">{snippet}</div>}
      {url && <div className="job-actions"><button className="btn small">View</button></div>}
    </a>
  )
}
