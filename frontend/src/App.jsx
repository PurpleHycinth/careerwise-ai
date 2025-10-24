// src/App.jsx
import React, { useState, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Header from './components/Header'
import ResumeRanking from './components/resume/ResumeRanking'
import CareerFinder from './components/career/CareerFinder'
import ToggleSwitch from './components/ToggleSwitch'

export default function App() {
  const [mode, setMode] = useState('resume') // 'resume' or 'career'
  const componentsRef = useRef(null)

  const scrollToComponents = () =>
    componentsRef.current?.scrollIntoView({ behavior: 'smooth' })

  return (
    <div className="app-root">
      <Header onTryClick={scrollToComponents} />

      <main>
        <section className="hero">
          <div className="hero-content">
            <motion.h1
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              Careerwise AI
            </motion.h1>

            <motion.p
              className="lead"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              Lightweight web app with <strong>Resume Ranking</strong> and <strong>Career Path Finder</strong>.
              Upload JD + up to 7 resumes (upload & analyze are separate steps). Or explore career suggestions.
            </motion.p>

            <motion.div
              className="hero-actions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <button className="try-btn" onClick={scrollToComponents}>
                Try the Tools
              </button>
            </motion.div>
          </div>

          <div className="hero-visual">
            <img src="./checker.png" alt="check" style={{"maxHeight":"400px",maxWidth:"500px"}}/>
          </div>
        </section>

        <section className="components" ref={componentsRef}>
          {/* Centered two-option switch (Resume / Career) */}
          <div className="switch-row centered" style={{ marginBottom: 18 }}>
<ToggleSwitch mode={mode} setMode={setMode} />

          </div>

          <AnimatePresence mode="wait">
            {mode === 'resume' ? (
              <motion.div
                key="resume"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <ResumeRanking />
              </motion.div>
            ) : (
              <motion.div
                key="career"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <CareerFinder />
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>

      <footer className="footer">
        © {new Date().getFullYear()} Careerwise AI — Built by CompileSqaud
      </footer>
    </div>
  )
}
