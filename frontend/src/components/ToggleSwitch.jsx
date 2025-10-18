// src/components/ToggleSwitch.jsx
import React from 'react'

export default function ToggleSwitch({ mode, setMode }) {
  return (
    <div className="switch-row">
      <div
        className="mode-switch"
        role="tablist"
        aria-label="Switch between Resume and Career"
      >
        <button
          type="button"
          className={`option ${mode === 'resume' ? 'active' : ''}`}
          onClick={() => setMode('resume')}
          aria-pressed={mode === 'resume'}
          role="tab"
          aria-selected={mode === 'resume'}
        >
          Resume
        </button>

        <button
          type="button"
          className={`option ${mode === 'career' ? 'active' : ''}`}
          onClick={() => setMode('career')}
          aria-pressed={mode === 'career'}
          role="tab"
          aria-selected={mode === 'career'}
        >
          Career
        </button>

        <div className={`switch-knob ${mode === 'career' ? 'right' : 'left'}`} aria-hidden />
      </div>
    </div>
  )
}
