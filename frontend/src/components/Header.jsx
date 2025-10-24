// src/components/Header.jsx
import React from 'react'

export default function Header({ onTryClick }) {
  return (
    <header className="topbar">
      <div className="brand">Careerwise AI</div>
      {/* <nav>
        <button className="try-btn" onClick={onTryClick}>Try</button>
      </nav> */}
    </header>
  )
}
