/**
 * SessionCreateDialog — 创建工作会话对话框
 */
import { useState, useRef, useEffect } from 'react'
import { X, FolderPlus, Loader2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { apiFetch } from '../../api/client'

export function SessionCreateDialog({ open, onClose, onCreated }) {
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setTitle('')
      setError(null)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return

    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch('/session', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim() }),
      })
      onCreated?.(data)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        animation: 'fadeIn 0.2s var(--ease-out)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 24,
          width: '100%',
          maxWidth: 420,
          boxShadow: 'var(--shadow-lg)',
          animation: 'fadeInScale 0.25s var(--ease-spring)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FolderPlus size={18} style={{ color: 'var(--color-primary)' }} />
            <span style={{
              fontSize: 16,
              fontWeight: 700,
              fontFamily: "'Syne', sans-serif",
              letterSpacing: '-0.02em',
            }}>
              New Session
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              display: 'flex',
              padding: 4,
              borderRadius: 6,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <X size={16} style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <label style={{
            display: 'block',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--color-text-secondary)',
            marginBottom: 6,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            fontFamily: "'IBM Plex Mono', monospace",
          }}>
            Session Title
          </label>
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. 竞品分析项目"
            style={{
              width: '100%',
              padding: '10px 14px',
              fontSize: 14,
              fontFamily: "'DM Sans', sans-serif",
              color: 'var(--color-text)',
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => { e.target.style.borderColor = 'var(--color-primary)' }}
            onBlur={(e) => { e.target.style.borderColor = 'var(--color-border)' }}
          />

          {error && (
            <div style={{
              marginTop: 10,
              fontSize: 12,
              color: 'var(--color-error)',
              padding: '8px 12px',
              background: 'var(--color-error-dim)',
              borderRadius: 'var(--radius-sm)',
            }}>
              {error}
            </div>
          )}

          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 20,
          }}>
            <Button variant="ghost" size="sm" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              loading={loading}
              disabled={!title.trim()}
            >
              Create
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
