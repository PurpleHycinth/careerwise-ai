// frontend/src/App.jsx
import React, { useState } from 'react'
import Header from './components/Header'
import ToggleSwitch from './components/ToggleSwitch'
import ResumeRanking from './components/resume/ResumeRanking'
import CareerFinder from './components/career/CareerFinder'
import './App.css'

export default function App() {
  const [mode, setMode] = useState('resume')

  return (
    <div className="app">
      <Header />
      <main className="main-content">
        <ToggleSwitch mode={mode} setMode={setMode} />
        {mode === 'resume' ? <ResumeRanking /> : <CareerFinder />}
      </main>
    </div>
  )
}