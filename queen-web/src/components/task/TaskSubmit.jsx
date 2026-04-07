import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../api/client'
import { useTaskStore } from '../../stores/tasks'
import {
  Send, Loader2, Sparkles, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, ArrowRight, Wand2, X
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
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  const canSubmit = description.trim().length > 0 && !loading

  const handleSubmit = async () => {
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const data = await apiFetch('/task', {
        method: 'POST',
        body: JSON.stringify({ description: description.trim() })
      })
      setResult(data)
      setDescription('')
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

  // 提交成功后 3 秒自动折叠结果
  useEffect(() => {
    if (result) {
      const timer = setTimeout(() => setExpanded(false), 8000)
      return () => clearTimeout(timer)
    }
  }, [result])

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

      {/* 提交结果 */}
      {result && (
        <div style={styles.resultCard}>
          <div style={styles.resultHeader}>
            <div style={styles.resultTitle}>
              <CheckCircle2 size={15} style={{ color: 'var(--color-success)' }} />
              <span style={{ fontWeight: 600 }}>任务已创建</span>
            </div>
            <div style={styles.resultActions}>
              <button
                style={styles.resultLink}
                onClick={() => navigate(`/tasks/${result.task_id}`)}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-primary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)' }}
              >
                查看详情 <ArrowRight size={12} />
              </button>
              <button style={styles.dismissBtn} onClick={() => { setResult(null); setExpanded(false) }}>
                <X size={14} />
              </button>
            </div>
          </div>

          <div style={styles.resultMeta}>
            <span style={styles.resultId}>{result.task_id}</span>
            <span style={{
              ...styles.strategyBadge,
              color: result.strategy === 'single' ? 'var(--color-info)' : result.strategy === 'parallel' ? 'var(--color-success)' : 'var(--color-warning)'
            }}
            >
              {result.strategy}
            </span>
          </div>

          {(result.steps?.length > 0) && (
            <div style={styles.stepsList}>
              {result.steps.map((step, i) => (
                <div key={i} style={styles.stepItem}>
                  <span style={styles.stepIndex}>{step.step_index + 1}</span>
                  <span style={styles.stepCap}>{step.capability}</span>
                  <span style={styles.stepDesc}>{step.description}</span>
                </div>
              ))}
            </div>
          )}
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
    fontFamily: "'DM Sans', sans-serif",
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
    fontFamily: "'IBM Plex Mono', monospace",
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

  /* 结果卡片 */
  resultCard: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-success)33',
    borderRadius: 'var(--radius)',
    padding: '12px 14px',
    animation: 'fadeIn 0.25s ease-out'
  },
  resultHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  resultTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14
  },
  resultActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  resultLink: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    fontWeight: 500,
    transition: 'color 0.15s'
  },
  dismissBtn: {
    display: 'flex',
    alignItems: 'center',
    color: 'var(--color-text-muted)',
    padding: 2
  },
  resultMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginTop: 8
  },
  resultId: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--color-primary)',
    maxWidth: 200,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  strategyBadge: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    padding: '2px 8px',
    borderRadius: 4,
    background: 'var(--color-surface-hover)'
  },
  stepsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginTop: 10,
    paddingLeft: 2
  },
  stepItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12
  },
  stepIndex: {
    width: 20,
    height: 20,
    borderRadius: 4,
    background: 'var(--color-surface-hover)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 600,
    fontFamily: "'IBM Plex Mono', monospace",
    color: 'var(--color-text-muted)',
    flexShrink: 0
  },
  stepCap: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--color-primary)',
    whiteSpace: 'nowrap'
  },
  stepDesc: {
    color: 'var(--color-text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
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
  }
}
