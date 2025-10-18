// src/components/resume/ResumeUpload.jsx
import React, { useCallback, useRef, useState } from 'react'
import axios from 'axios'

/**
 * ResumeUpload (axios version)
 * - posts to `${API_BASE}/upload/` as form-data:
 *    - job_description (text)
 *    - resumes (multiple files)
 * - expects backend response containing file IDs in one of: file_ids, fileIds, files, uploaded
 * - calls onUploadComplete({ job_description, file_ids })
 */

const MAX_FILES = 7
const MAX_FILE_MB = 15
const ACCEPTED_EXT = ['pdf', 'doc', 'docx']

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const sizes = ['B', 'KB', 'MB', 'GB']
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`
}

export default function ResumeUpload({ onUploadComplete }) {
  const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000' // <- change if needed
  const uploadUrl = `${API_BASE.replace(/\/$/, '')}/upload/` // ensure single trailing slash

  const [jdText, setJdText] = useState('')
  const [files, setFiles] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)
  const sourceRef = useRef(null) // axios cancel token

  const addFiles = useCallback((incoming) => {
    const arr = Array.from(incoming || [])
    if (!arr.length) return
    const allowedSpace = MAX_FILES - files.length
    if (allowedSpace <= 0) {
      setError(`Max ${MAX_FILES} files allowed.`)
      return
    }
    const filtered = arr
      .map((f) => ({ file: f, ext: (f.name.split('.').pop() || '').toLowerCase() }))
      .filter(({ ext }) => ACCEPTED_EXT.includes(ext))
      .slice(0, allowedSpace)
      .map(({ file }) => file)
    if (!filtered.length) {
      setError(`Accepted file types: ${ACCEPTED_EXT.join(', ')}`)
      return
    }
    setFiles((prev) => [...prev, ...filtered])
    setError(null)
  }, [files.length])

  const onFilesChange = (e) => addFiles(e.target.files)

  // drag/drop handlers
  const onDragOver = (e) => { e.preventDefault(); setDragOver(true) }
  const onDragLeave = (e) => { e.preventDefault(); setDragOver(false) }
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }

  const removeFile = (index) => setFiles((prev) => prev.filter((_, i) => i !== index))
  const clearFiles = () => setFiles([])

  const validate = () => {
    if (!jdText.trim()) { setError('Please paste the Job Description text.'); return false }
    if (!files.length) { setError('Please add at least one resume file.'); return false }
    for (const f of files) {
      if (f.size / (1024 * 1024) > MAX_FILE_MB) {
        setError(`${f.name} exceeds ${MAX_FILE_MB} MB limit.`)
        return false
      }
    }
    setError(null)
    return true
  }

  const cancelUpload = () => {
    if (sourceRef.current) {
      sourceRef.current.cancel('Upload canceled by user')
      sourceRef.current = null
    }
    setUploading(false)
    setProgress(0)
  }

  const handleUpload = async () => {
    if (uploading) return
    if (!validate()) return

    const form = new FormData()
    form.append('job_description', jdText)
    files.forEach((f) => form.append('resumes', f))

    setUploading(true)
    setProgress(2)
    setError(null)

    // axios cancel token
    const CancelToken = axios.CancelToken
    const source = CancelToken.source()
    sourceRef.current = source

    try {
      const res = await axios.post(uploadUrl, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (event) => {
          if (!event.lengthComputable) return
          const pct = Math.round((event.loaded * 100) / event.total)
          setProgress(Math.max(2, Math.min(99, pct)))
        },
        cancelToken: source.token,
        timeout: 120000 // 2 min
      })

      // parse response robustly
      const data = res.data || {}
      const file_ids = data.file_ids || data.fileIds || data.files || data.uploaded || []

      // success callback
      onUploadComplete?.({ job_description: jdText, file_ids })
      setProgress(100)
      setTimeout(() => setProgress(0), 600)
    } catch (err) {
      if (axios.isCancel(err)) {
        setError('Upload canceled')
      } else if (err.response) {
        // server responded with status outside 2xx
        const msg = err.response.data?.message || err.response.statusText || `Upload failed: ${err.response.status}`
        setError(msg)
      } else {
        setError(err.message || 'Upload failed')
      }
      setProgress(0)
    } finally {
      setUploading(false)
      sourceRef.current = null
    }
  }

  return (
    <div className="resume-upload card" style={{ position: 'relative' }}>
      <label className="label">Job Description (paste text)</label>
      <textarea className="jd-input" value={jdText} onChange={(e) => setJdText(e.target.value)} rows={6} placeholder="Paste the job description here..." />

      <label className="label" style={{ marginTop: 12 }}>Upload Resumes (PDF / DOCX) — max {MAX_FILES}</label>

      <div
        className={`dropzone ${dragOver ? 'drag-over' : ''}`}
        onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
        onClick={() => fileInputRef.current?.click()}
        role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') fileInputRef.current?.click() }}
      >
        <input ref={fileInputRef} className="hidden-file" type="file" accept={ACCEPTED_EXT.map(x => `.${x}`).join(',')} multiple onChange={onFilesChange} />
        <div className="drop-inner" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" className="drop-icon" aria-hidden>
            <path d="M12 3v9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M8 7l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M20 21H4a2 2 0 0 1-2-2V13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div>
            <div className="drop-title" style={{ fontWeight: 700 }}>Drag & drop resumes here, or click to browse</div>
            <div className="drop-sub muted">Accepted: {ACCEPTED_EXT.join(', ')} — up to {MAX_FILES} files</div>
          </div>
        </div>
      </div>

      <div className="file-list" style={{ marginTop: 12 }}>
        {files.length === 0 ? <div className="muted small">No files selected</div> : files.map((f, i) => (
          <div key={i} className="file-item" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:8, borderRadius:10, background:'#fafafa', marginBottom:8 }}>
            <div style={{ display:'flex', gap:12, alignItems:'center', minWidth:0 }}>
              <div className="file-icon" style={{ width:44, height:44, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', background:'#eef2ff', color:'#2563eb', fontWeight:800 }}>
                {f.name.split('.').pop().toUpperCase()}
              </div>
              <div style={{ minWidth:0 }}>
                <div className="fn" style={{ fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:420 }}>{f.name}</div>
                <div className="fs muted" style={{ fontSize:13 }}>{formatBytes(f.size)}</div>
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="icon-btn" onClick={() => removeFile(i)} title="Remove file" type="button" aria-label={`Remove ${f.name}`} style={{ background:'transparent', border:'none', cursor:'pointer' }}>✕</button>
            </div>
          </div>
        ))}
      </div>

      <div className="actions" style={{ display:'flex', gap:12, marginTop:14, alignItems:'center' }}>
        <button className="btn primary" onClick={handleUpload} disabled={uploading} type="button">{uploading ? `Uploading ${progress}%` : 'Upload'}</button>
        <button className="btn" type="button" onClick={clearFiles} disabled={uploading}>Clear</button>
        <div style={{ flex:1 }} />
        <div className="note muted small">Tip: paste a clear JD — the model ranks resumes by relevance.</div>
      </div>

      <div className="upload-progress-wrap" style={{ height:8, marginTop:12, borderRadius:8, background:'#f3f4f6', overflow:'hidden' }}>
        <div className="upload-progress" style={{ height:'100%', width:`${progress}%`, background:'linear-gradient(90deg,#2563eb,#7c3aed)', transition:'width 160ms linear' }} />
      </div>

      {error && <div className="error" style={{ marginTop:12, color:'#b91c1c', background:'#fff1f2', padding:10, borderRadius:8 }}>{error}</div>}
    </div>
  )
}
