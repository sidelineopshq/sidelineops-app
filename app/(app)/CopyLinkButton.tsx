'use client'

import { useState } from 'react'

export default function CopyLinkButton({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const el = document.createElement('textarea')
      el.value = url
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={`w-full rounded-lg border px-4 py-2 text-xs font-semibold text-center transition-colors ${
        copied
          ? 'border-green-500/30 bg-green-500/10 text-green-400'
          : 'border-white/10 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white'
      }`}
    >
      {copied ? '✓ Copied!' : `Copy ${label} Link`}
    </button>
  )
}