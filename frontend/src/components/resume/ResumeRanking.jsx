// src/components/resume/ResumeRanking.jsx
import React, { useState } from 'react'
import ResumeUpload from './ResumeUpload'
import AnalyzeResult from './AnalyzeResult'

export default function ResumeRanking() {
  const [uploadedMeta, setUploadedMeta] = useState(null)

  return (
    <div className="panel resume-panel">
      <h2>Resume Ranking</h2>
      <p className="muted">Step 1: Upload job description and up to 7 resumes (PDF / DOCX). Step 2: Analyze to rank them.</p>

      <ResumeUpload onUploadComplete={(meta) => setUploadedMeta(meta)} />

      <AnalyzeResult uploadedMeta={uploadedMeta} />
    </div>
  )
}
