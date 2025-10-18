// src/components/resume/PDFThumbnail.jsx
import React, { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf'

// Use a public worker from CDN (ok for dev). If you prefer bundling worker, adapt accordingly.
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js'

/**
 * Props:
 * - fileUrl (string) : full URL to PDF file (must be CORS-accessible)
 * - width (number) : desired thumbnail width in px (defaults 160)
 */
export default function PDFThumbnail({ fileUrl, width = 160 }) {
  const canvasRef = useRef(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!fileUrl) return
    let cancelled = false
    const render = async () => {
      setError(null)
      setLoading(true)
      try {
        // Fetch PDF as blob (axios ensures we can get blob responseType)
        const res = await axios.get(fileUrl, { responseType: 'arraybuffer' })
        if (cancelled) return
        const pdfData = res.data

        // Load PDF document
        const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise
        if (cancelled) return

        // Get first page
        const page = await pdf.getPage(1)
        if (cancelled) return

        const viewport = page.getViewport({ scale: 1 })
        const targetWidth = width
        const scale = targetWidth / viewport.width
        const scaledViewport = page.getViewport({ scale })

        const canvas = canvasRef.current
        if (!canvas) return
        const context = canvas.getContext('2d')
        canvas.width = Math.floor(scaledViewport.width)
        canvas.height = Math.floor(scaledViewport.height)

        // clear canvas
        context.clearRect(0, 0, canvas.width, canvas.height)

        // render
        const renderContext = {
          canvasContext: context,
          viewport: scaledViewport
        }
        const renderTask = page.render(renderContext)
        await renderTask.promise
        if (cancelled) return
      } catch (err) {
        console.error('PDF thumbnail error', err)
        setError('Preview not available')
      } finally {
        setLoading(false)
      }
    }

    render()

    return () => { cancelled = true }
  }, [fileUrl, width])

  if (!fileUrl) return <div className="pdf-thumb empty">No file</div>

  return (
    <div style={{ width, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width, height: 'auto', borderRadius: 8, overflow: 'hidden', border: '1px solid #eaeef6' }}>
        {loading && (
          <div style={{ padding: 14, textAlign: 'center', color: '#6b7280' }}>Loading preview…</div>
        )}
        {!loading && !error && (
          <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: 'auto' }} />
        )}
        {!loading && error && (
          // fallback: clickable link to open the PDF
          <div style={{ padding: 12, textAlign: 'center' }}>
            <a href={fileUrl} target="_blank" rel="noopener noreferrer">Open PDF</a>
            <div className="muted small">{error}</div>
          </div>
        )}
      </div>
    </div>
  )
}
