// src/components/career/CareerFinder.jsx
import React, { useState } from 'react'
import { motion } from 'framer-motion'

export default function CareerFinder() {
  const [lookingFor, setLookingFor] = useState('jobs')
  const [ambitions, setAmbitions] = useState('')
  const [location, setLocation] = useState('')
  const [preferences, setPreferences] = useState('')
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState(null)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setSuggestions(null)
    setError(null)
    try {
      const payload = { lookingFor, ambitions, location, preferences }
      const res = await fetch('/api/career-finder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error('Failed to fetch suggestions')
      const data = await res.json()
      setSuggestions(data)
    } catch (e) {
      console.error(e)
      setError('Unable to fetch suggestions. Try again later.')
    } finally {
      setLoading(false)
    }
  }

  // Friendly fallback renderer for suggestions if backend returns generic arrays
  const renderSuggestions = () => {
    if (!suggestions) return null

    // Expecting suggestions to be structured like:
    // { jobs: [...], courses: [...], universities: [...] } or a flat array
    if (Array.isArray(suggestions)) {
      return suggestions.map((s, i) => (
        <SuggestionCard key={i} item={s} type={lookingFor} />
      ))
    }

    // object mapping
    const buckets = []
    if (lookingFor === 'jobs' && suggestions.jobs) buckets.push({ title: 'Jobs', items: suggestions.jobs })
    if (lookingFor === 'online-courses' && suggestions.courses) buckets.push({ title: 'Courses', items: suggestions.courses })
    if (lookingFor === 'universities' && suggestions.universities) buckets.push({ title: 'Universities', items: suggestions.universities })

    // fallback: show any arrays present
    if (buckets.length === 0) {
      Object.entries(suggestions).forEach(([k, v]) => {
        if (Array.isArray(v) && v.length) buckets.push({ title: k, items: v })
      })
    }

    if (buckets.length === 0) {
      // show raw JSON
      return (
        <div className="muted small">No structured suggestions found — raw response:</div>
      )
    }

    return buckets.map((b, idx) => (
      <div key={idx} className="suggestion-bucket">
        <h4 className="bucket-title">{b.title}</h4>
        <div className="cards-grid">
          {b.items.map((it, i) => <SuggestionCard key={i} item={it} type={b.title.toLowerCase()} />)}
        </div>
      </div>
    ))
  }

  return (
    <div className="panel career-panel card">
      <div className="panel-head">
        <h2>Career Path Finder</h2>
        <p className="muted">Tell us what you're looking for and a short paragraph about your ambitions.</p>
      </div>

      <form className="career-form" onSubmit={handleSubmit}>
        <div className="row">
          <label className="label">Looking for</label>
          <div className="segmented">
            <button type="button" className={`seg-btn ${lookingFor === 'jobs' ? 'active' : ''}`} onClick={() => setLookingFor('jobs')}>Jobs</button>
            <button type="button" className={`seg-btn ${lookingFor === 'online-courses' ? 'active' : ''}`} onClick={() => setLookingFor('online-courses')}>Online Courses</button>
            <button type="button" className={`seg-btn ${lookingFor === 'universities' ? 'active' : ''}`} onClick={() => setLookingFor('universities')}>Universities</button>
          </div>
        </div>

        <div className="row">
          <label className="label">Location (optional)</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g., Remote, India, USA" />
        </div>

        <div className="row">
          <label className="label">Preferences / Constraints (optional)</label>
          <input value={preferences} onChange={(e) => setPreferences(e.target.value)} placeholder="e.g., budget, duration, full-time/part-time" />
        </div>

        <div className="row">
          <label className="label">Ambitions (short paragraph)</label>
          <textarea value={ambitions} onChange={(e) => setAmbitions(e.target.value)} rows={5} placeholder="Describe your ambitions or the roles you'd love..." />
        </div>

        <div className="actions">
          <button className="btn primary" type="submit" disabled={loading}>
            {loading ? <LoaderInline /> : 'Find Path'}
          </button>
          <div style={{ flex: 1 }} />
          <div className="muted small">Tip: be specific in ambitions for better suggestions.</div>
        </div>
      </form>

      <div className="result" style={{ marginTop: 18 }}>
        {error && <div className="error">{error}</div>}

        {loading && !suggestions && (
          <div className="muted">Searching for suggestions...</div>
        )}

        {suggestions ? (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
            {renderSuggestions()}

            {/* if suggestions is a raw object show it too for debugging */}
            {typeof suggestions === 'object' && !Array.isArray(suggestions) && (
              <details style={{ marginTop: 12 }}>
                <summary className="muted small">Raw response (toggle)</summary>
                <pre className="result-box" style={{ marginTop: 8 }}>{JSON.stringify(suggestions, null, 2)}</pre>
              </details>
            )}
          </motion.div>
        ) : (
          <div className="muted">No suggestions yet. Fill the form and click Find Path to get recommendations.</div>
        )}
      </div>
    </div>
  )
}

/* Small inline loader component */
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

/* Suggestion card - flexible renderer that accepts object or string */
function SuggestionCard({ item = {}, type = '' }) {
  // item may be string or object (title, desc, link, metadata)
  const title = typeof item === 'string' ? item : item.title || item.name || item.role || 'Untitled'
  const desc = typeof item === 'string' ? '' : item.description || item.summary || item.snippet || ''
  const meta = typeof item === 'string' ? null : item.meta || item.tags || []
  const link = typeof item === 'string' ? null : item.link || item.url || null

  return (
    <motion.a
      className="suggestion-card"
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      href={link || '#'}
      target={link ? '_blank' : undefined}
      rel={link ? 'noopener noreferrer' : undefined}
    >
      <div className="sc-head">
        <div className="sc-title">{title}</div>
        <div className="sc-type">{type.replace('-', ' ')}</div>
      </div>
      {desc && <div className="sc-desc">{desc}</div>}
      {Array.isArray(meta) && meta.length > 0 && (
        <div className="sc-tags">
          {meta.slice(0,5).map((t,i) => <span key={i} className="tag">{t}</span>)}
        </div>
      )}
    </motion.a>
  )
}
