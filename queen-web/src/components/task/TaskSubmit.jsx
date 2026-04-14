import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../api/client'
import { useRitualStore } from '../../stores/ritual'
import {
  Send, Loader2, Sparkles,
  ChevronDown, ChevronUp,
  Wand2, XCircle, X
} from 'lucide-react'

const EXAMPLES = [
  '搜索最新的 AI 行业动态',
  '搜索竞品数据并生成分析报告',
  '并行执行：搜索新闻 + 数据分析',
  '翻译这段文字到英文',
  '调试代码中的内存泄漏问题'
]

export function TaskSubmit () {
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)
  const navigate = useNavigate()
  const triggerRitual = useRitualStore((s) => s.triggerRitual)

  const canSubmit = description.trim().length > 0 && !loading

  const handleSubmit = async () => {
    if (!canSubmit) return
    setLoading(true)
    setError(null)

    try {
      const data = await apiFetch('/task', {
        method: 'POST',
        body: JSON.stringify({ description: description.trim() })
      })
      // 触发蜂后降旨仪式
      triggerRitual({ variant: 'dispatch', message: '蜂后正在降下旨意...' })
      // 立即导航到任务详情页
      navigate(`/tasks/${data.task_id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleExampleClick = (text) => {
    setDescription(text)
    inputRef.current?.focus()
  }

  return (
    <div style={styles.wrapper}>
      {/* 输入区域 */}
      <div style={{
        ...styles.inputCard,
        borderColor: focused ? 'var(--color-primary)' : error ? 'var(--color-error)' : 'var(--color-border)',
        boxShadow: focused ? '0 0 0 3px var(--color-primary-dim)' : 'none'
      }}
      >
        <div style={styles.inputRow}>
          <div style={styles.iconWrap}>
            {loading
              ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              : <Sparkles size={18} />
            }
          </div>
          <textarea
            ref={inputRef}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder='描述你要完成的任务，Queen 会自动拆解并分配给合适的 Agent...'
            rows={1}
            style={styles.textarea}
          />
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              ...styles.submitBtn,
              opacity: canSubmit ? 1 : 0.4,
              cursor: canSubmit ? 'pointer' : 'not-allowed'
            }}
          >
            {loading
              ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              : <Send size={16} />
            }
          </button>
        </div>

        {/* 底部提示 */}
        <div style={styles.hints}>
          <span style={styles.hintText}>
            <kbd style={styles.kbd}>⌘</kbd>+<kbd style={styles.kbd}>Enter</kbd> 提交
          </span>
          {!expanded && !description && (
            <button style={styles.exampleToggle} onClick={() => setExpanded(!expanded)}>
              <Wand2 size={11} />
              <span>示例</span>
            </button>
          )}
        </div>
      </div>

      {/* 示例标签 */}
      {expanded && !description && (
        <div style={styles.examples}>
          {EXAMPLES.map((text) => (
            <button
              key={text}
              style={styles.exampleBtn}
              onClick={() => handleExampleClick(text)}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-primary)'
                e.currentTarget.style.color = 'var(--color-primary)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border)'
                e.currentTarget.style.color = 'var(--color-text-muted)'
              }}
            >
              {text}
            </button>
          ))}
        </div>
      )}

      {/* 错误 */}
      {error && (
        <div style={styles.errorCard}>
          <XCircle size={14} style={{ color: 'var(--color-error)', flexShrink: 0 }} />
          <span style={{ fontSize: 13 }}>{error}</span>
          <button style={styles.dismissBtn} onClick={() => setError(null)}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10
  },

  /* 输入卡片 */
  inputCard: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    padding: '12px 14px 8px',
    transition: 'border-color 0.2s, box-shadow 0.2s'
  },
  inputRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: 'var(--color-primary-dim)',
    color: 'var(--color-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2
  },
  textarea: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--color-text)',
    fontSize: 14,
    fontFamily: "'Space Grotesk', sans-serif",
    lineHeight: 1.5,
    resize: 'none',
    minHeight: 36,
    maxHeight: 120
  },
  submitBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    background: 'var(--color-primary)',
    color: '#000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'opacity 0.15s',
    marginTop: 2
  },
  hints: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingLeft: 42
  },
  hintText: {
    fontSize: 11,
    color: 'var(--color-text-muted)',
    display: 'flex',
    alignItems: 'center',
    gap: 2
  },
  kbd: {
    display: 'inline-block',
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
    padding: '1px 5px',
    borderRadius: 3,
    border: '1px solid var(--color-border)',
    background: 'var(--color-surface-hover)',
    lineHeight: 1.4
  },

  /* 示例 */
  exampleToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    color: 'var(--color-text-muted)',
    padding: '2px 8px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)',
    transition: 'all 0.15s'
  },
  examples: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    padding: '2px 0'
  },
  exampleBtn: {
    fontSize: 12,
    color: 'var(--color-text-muted)',
    padding: '4px 12px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-surface)',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap'
  },

  /* 错误 */
  errorCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'var(--color-error-dim)',
    border: '1px solid var(--color-error)33',
    borderRadius: 'var(--radius)',
    padding: '10px 14px',
    animation: 'fadeIn 0.2s ease-out'
  },
  dismissBtn: {
    display: 'flex',
    alignItems: 'center',
    color: 'var(--color-text-muted)',
    padding: 2,
    marginLeft: 'auto'
  }
}
