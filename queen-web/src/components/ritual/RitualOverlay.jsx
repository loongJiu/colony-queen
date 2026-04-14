/**
 * RitualOverlay — 超现实仪式叠加层
 *
 * 蜂后坐在王座上震动翅膀，发出光脉。
 * dispatch variant: 青色脉冲，"蜂后正在降下旨意..."
 * fortune variant: 琥珀色脉冲，"你向蜂群输送了信念"
 */
import { useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import './ritual.css'

const DURATION = { dispatch: 4500, fortune: 3000 }
const EXIT_DURATION = 500

// 粒子散射方向（12个方向）
const PARTICLES = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2
  return {
    px: `${Math.round(Math.cos(angle) * 70)}px`,
    py: `${Math.round(Math.sin(angle) * 70)}px`,
    delay: i * 40,
  }
})

export function RitualOverlay ({ active, variant = 'dispatch', message = '', onComplete }) {
  const [mounted, setMounted] = useState(false)
  const [exiting, setExiting] = useState(false)

  const color = variant === 'fortune' ? '#ff8800' : '#00e5ff'
  const totalMs = DURATION[variant] || DURATION.dispatch

  useEffect(() => {
    if (!active) {
      if (mounted) {
        setExiting(true)
        const t = setTimeout(() => {
          setMounted(false)
          setExiting(false)
        }, EXIT_DURATION)
        return () => clearTimeout(t)
      }
      return
    }

    setMounted(true)
    setExiting(false)

    const timer = setTimeout(() => {
      onComplete?.()
    }, totalMs)

    return () => clearTimeout(timer)
  }, [active, totalMs]) // eslint-disable-line react-hooks/exhaustive-deps

  // 不活跃且未挂载时不渲染
  if (!mounted && !active) return null

  const phase = exiting ? 'exit' : 'active'

  return createPortal(
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(5, 6, 8, 0.92)',
      animation: phase === 'exit'
        ? `ritualExit ${EXIT_DURATION}ms ease-out forwards`
        : 'ritualFadeIn 600ms ease-out forwards',
      '--ritual-color': color,
    }}>
      {/* 仪式容器 */}
      <div style={{
        position: 'relative',
        width: 320,
        height: 320,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>

        {/* ── 能量脉冲环（3层，交错） ── */}
        {[0, 1, 2].map((i) => (
          <div
            key={`ring-${i}`}
            style={{
              position: 'absolute',
              width: 60,
              height: 60,
              borderRadius: '50%',
              border: `2px solid ${color}`,
              animation: `energyPulseExpand 2s ease-out ${0.8 + i * 1.0}s both`,
              pointerEvents: 'none',
            }}
          />
        ))}

        {/* ── 径向光束（8条） ── */}
        <div style={{
          position: 'absolute',
          width: 200,
          height: 200,
          animation: 'radialBeamRotate 20s linear 1.2s infinite',
          opacity: 0,
          animationName: 'radialBeamRotate, ritualFadeIn',
          animationDuration: '20s, 0.6s',
          animationDelay: '0s, 1.2s',
          animationFillMode: 'both, both',
        }}>
          {Array.from({ length: 8 }, (_, i) => {
            const angle = (i / 8) * 360
            return (
              <div
                key={`beam-${i}`}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: 90,
                  height: 2,
                  transformOrigin: '0 0',
                  transform: `rotate(${angle}deg)`,
                  background: `linear-gradient(90deg, ${color}88, transparent)`,
                  animation: `radialBeamPulse ${1.5 + i * 0.1}s ease-in-out infinite`,
                }}
              />
            )
          })}
        </div>

        {/* ── 蜂后王座 ── */}
        <div style={{
          position: 'relative',
          animation: 'queenThroneReveal 800ms cubic-bezier(0.22, 1.2, 0.36, 1) 100ms both',
        }}>

          {/* 王座背板 */}
          <div style={{
            position: 'absolute',
            top: -70,
            left: -50,
            width: 100,
            height: 80,
            background: 'var(--color-surface, #0a0c10)',
            border: '1px solid var(--color-border, #1e2533)',
            borderRadius: '4px 4px 2px 2px',
            clipPath: 'polygon(10% 0%, 90% 0%, 100% 100%, 0% 100%)',
          }} />

          {/* 王座底座 */}
          <div style={{
            position: 'absolute',
            bottom: -16,
            left: -40,
            width: 80,
            height: 12,
            background: 'var(--color-surface, #0a0c10)',
            border: '1px solid var(--color-border, #1e2533)',
            borderRadius: 2,
            animation: 'throneEnergyGlow 2s ease-in-out infinite',
          }} />

          {/* 左翅膀（上） */}
          <div style={{
            position: 'absolute',
            top: -38,
            left: -52,
            width: 48,
            height: 22,
            borderRadius: '50% 50% 50% 20%',
            background: `radial-gradient(ellipse at 70% 50%, ${color}33, ${color}11, transparent)`,
            border: `1px solid ${color}22`,
            animation: 'wingVibrateLeft 0.08s linear infinite',
          }} />
          {/* 左翅膀（下） */}
          <div style={{
            position: 'absolute',
            top: -20,
            left: -44,
            width: 36,
            height: 18,
            borderRadius: '50% 50% 50% 20%',
            background: `radial-gradient(ellipse at 70% 50%, ${color}22, transparent)`,
            border: `1px solid ${color}15`,
            animation: 'wingVibrateLeft 0.1s linear infinite',
          }} />
          {/* 右翅膀（上） */}
          <div style={{
            position: 'absolute',
            top: -38,
            right: -52,
            width: 48,
            height: 22,
            borderRadius: '50% 50% 20% 50%',
            background: `radial-gradient(ellipse at 30% 50%, ${color}33, ${color}11, transparent)`,
            border: `1px solid ${color}22`,
            animation: 'wingVibrateRight 0.08s linear infinite',
          }} />
          {/* 右翅膀（下） */}
          <div style={{
            position: 'absolute',
            top: -20,
            right: -44,
            width: 36,
            height: 18,
            borderRadius: '50% 50% 20% 50%',
            background: `radial-gradient(ellipse at 30% 50%, ${color}22, transparent)`,
            border: `1px solid ${color}15`,
            animation: 'wingVibrateRight 0.1s linear infinite',
          }} />

          {/* 王冠（3个三角尖） */}
          <div style={{
            position: 'absolute',
            top: -62,
            left: -12,
            display: 'flex',
            gap: 6,
            animation: 'crownGlow 2s ease-in-out infinite',
          }}>
            {[-4, 0, 4].map((offset, i) => (
              <div
                key={`crown-${i}`}
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: '5px solid transparent',
                  borderRight: '5px solid transparent',
                  borderBottom: '10px solid #ffc107',
                  transform: `translateX(${offset}px)`,
                }}
              />
            ))}
          </div>

          {/* 头部 */}
          <div style={{
            position: 'absolute',
            top: -48,
            left: -7,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: 'linear-gradient(180deg, #ffc107, #e6a800)',
          }}>
            {/* 左眼 */}
            <div style={{
              position: 'absolute',
              top: 4,
              left: 3,
              width: 3,
              height: 3,
              borderRadius: '50%',
              background: '#050608',
            }} />
            {/* 右眼 */}
            <div style={{
              position: 'absolute',
              top: 4,
              right: 3,
              width: 3,
              height: 3,
              borderRadius: '50%',
              background: '#050608',
            }} />
          </div>

          {/* 身体（胸部） */}
          <div style={{
            width: 28,
            height: 20,
            borderRadius: '50%',
            background: 'linear-gradient(180deg, #ffc107, #ff8800)',
            position: 'relative',
          }} />

          {/* 腹部（带条纹） */}
          <div style={{
            position: 'absolute',
            top: 18,
            left: -10,
            width: 30,
            height: 28,
            borderRadius: '0 0 12px 12px',
            background: 'linear-gradient(180deg, #ffc107 0%, #e6a800 25%, #050608 25%, #050608 30%, #e6a800 30%, #e6a800 50%, #050608 50%, #050608 55%, #e6a800 55%, #e6a800 75%, #050608 75%, #050608 80%, #cc8800 80%)',
            animation: 'abdomenPulse 1.5s ease-in-out infinite',
          }} />
        </div>

        {/* ── 消息文字 ── */}
        {message && (
          <div style={{
            position: 'absolute',
            bottom: 20,
            left: 0,
            right: 0,
            textAlign: 'center',
            animation: `ritualTextReveal 600ms ease-out ${variant === 'fortune' ? 0.5 : 2.0}s both`,
          }}>
            <span style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 15,
              fontWeight: 600,
              color: color,
              textShadow: `0 0 12px ${color}66, 0 0 24px ${color}33`,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}>
              {message}
            </span>
          </div>
        )}

        {/* ── 粒子散射 ── */}
        {PARTICLES.map((p, i) => (
          <div
            key={`particle-${i}`}
            style={{
              position: 'absolute',
              width: 3,
              height: 3,
              borderRadius: '50%',
              background: color,
              '--px': p.px,
              '--py': p.py,
              animation: `particleScatter 1.5s ease-out ${variant === 'fortune' ? 0.8 : 2.5}s both`,
              animationDelay: `${(variant === 'fortune' ? 0.8 : 2.5) + p.delay}ms`,
              boxShadow: `0 0 4px ${color}88`,
            }}
          />
        ))}
      </div>
    </div>,
    document.body
  )
}
