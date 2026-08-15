"use client"

import { useEffect } from "react"

interface KeyboardShortcutsProps {
  onUndo: () => void;
  onRedo: () => void;
}

export function KeyboardShortcuts({ onUndo, onRedo }: KeyboardShortcutsProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const cmdKey = isMac ? e.metaKey : e.ctrlKey

      if (cmdKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          onRedo()
        } else {
          onUndo()
        }
      } else if (cmdKey && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        onRedo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onUndo, onRedo])

  return null
}
