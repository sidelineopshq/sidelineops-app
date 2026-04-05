'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[global-error]', error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#020817', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center',
          color: '#fff',
        }}>
          <img
            src="/sidelineops-logo-cropped.png"
            alt="SidelineOps"
            style={{ height: '32px', width: 'auto', opacity: 0.7, marginBottom: '32px' }}
          />
          <p style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</p>
          <h1 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>Something went wrong</h1>
          <p style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '32px', maxWidth: '280px' }}>
            A critical error occurred. Please try refreshing the page.
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={reset}
              style={{
                borderRadius: '12px',
                background: '#0284c7',
                border: 'none',
                color: '#fff',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try Again
            </button>
            <a
              href="/"
              style={{
                borderRadius: '12px',
                background: '#1e293b',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#cbd5e1',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Go Home
            </a>
          </div>
        </div>
      </body>
    </html>
  )
}
