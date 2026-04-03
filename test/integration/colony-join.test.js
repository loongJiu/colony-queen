import { describe, it, expect, beforeEach } from 'vitest'
import Fastify from 'fastify'
import { createHash, createHmac } from 'node:crypto'
import { Hive } from '../../src/core/hive.js'
import { BeeError } from '../../src/utils/errors.js'
import colonyRoutes from '../../src/handlers/colony.js'

const TEST_TOKEN = 'test-colony-token-12345'

function makeSpec(overrides = {}) {
  return {
    spec_version: '1.0',
    identity: {
      id: 'worker_coder_01',
      role: 'worker',
      name: 'Coder',
      description: 'Code generation agent',
      ...overrides.identity
    },
    runtime: {
      endpoint: 'http://localhost:4001',
      protocol: 'http',
      ...(overrides.runtime ?? {})
    },
    capabilities: overrides.capabilities ?? ['code_generation', 'debugging'],
    model: overrides.model ?? { provider: 'openai', name: 'gpt-4' },
    tools: overrides.tools ?? [],
    skills: overrides.skills ?? [],
    constraints: overrides.constraints
  }
}

function signJoin(timestamp, token) {
  return createHash('sha256').update(timestamp + token).digest('hex')
}

function signNonce(nonce, token) {
  return createHmac('sha256', token).update(nonce).digest('hex')
}

/** 构建测试用 Fastify 实例 */
function buildApp() {
  const hive = new Hive()
  const app = Fastify({ logger: false })

  // 统一错误处理（与 index.js 一致）
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof BeeError) {
      reply.status(err.statusCode).send(err.toJSON(request.id))
      return
    }
    if (err.validation) {
      reply.status(400).send({
        error: { code: 'ERR_VALIDATION', message: err.message, requestId: request.id, retryable: false }
      })
      return
    }
    reply.status(500).send({
      error: { code: 'ERR_INTERNAL', message: 'Internal server error', requestId: request.id, retryable: false }
    })
  })

  app.decorate('hive', hive)
  app.register(colonyRoutes, { hive, colonyToken: TEST_TOKEN })

  return { app, hive }
}

describe('Colony 握手协议集成测试', () => {
  /** @type {ReturnType<typeof buildApp>} */
  let ctx

  beforeEach(() => {
    ctx = buildApp()
  })

  async function doFullHandshake(specOverrides = {}) {
    const spec = makeSpec(specOverrides)
    const timestamp = new Date().toISOString()

    // Step 1: join
    const joinRes = await ctx.app.inject({
      method: 'POST',
      url: '/colony/join',
      payload: {
        type: 'colony.join',
        spec,
        timestamp,
        signature: signJoin(timestamp, TEST_TOKEN)
      }
    })

    expect(joinRes.statusCode).toBe(200)
    const challenge = joinRes.json()
    expect(challenge.type).toBe('colony.challenge')
    expect(challenge.nonce).toBeTruthy()
    expect(challenge.expires_at).toBeTruthy()

    // Step 3: verify
    const verifyRes = await ctx.app.inject({
      method: 'POST',
      url: '/colony/verify',
      payload: {
        type: 'colony.verify',
        agent_id: spec.identity.id,
        nonce: challenge.nonce,
        signed_nonce: signNonce(challenge.nonce, TEST_TOKEN)
      }
    })

    expect(verifyRes.statusCode).toBe(200)
    const welcome = verifyRes.json()
    expect(welcome.type).toBe('colony.welcome')
    expect(welcome.session_token).toBeTruthy()
    expect(welcome.agent_id).toBeTruthy()

    return { spec, welcome, challenge }
  }

  describe('完整握手流程', () => {
    it('join → challenge → verify → welcome 全流程成功', async () => {
      const { welcome } = await doFullHandshake()

      expect(welcome.colony_version).toBe('1.0')
      expect(welcome.queen_id).toBe('queen_main')
      expect(welcome.joined_at).toBeTruthy()

      // 验证 Agent 已在 Hive 中
      const agent = ctx.hive.getBySessionToken(welcome.session_token)
      expect(agent).toBeTruthy()
      expect(agent.role).toBe('worker')
      expect(agent.capabilities).toEqual(['code_generation', 'debugging'])
    })
  })

  describe('POST /colony/join', () => {
    it('拒绝无效签名', async () => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/colony/join',
        payload: {
          type: 'colony.join',
          spec: makeSpec(),
          timestamp: new Date().toISOString(),
          signature: 'invalid-signature'
        }
      })

      expect(res.statusCode).toBe(401)
      expect(res.json().error.code).toBe('ERR_UNAUTHORIZED')
    })

    it('拒绝缺少字段', async () => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/colony/join',
        payload: { type: 'colony.join' }
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe('POST /colony/verify', () => {
    it('拒绝未知 nonce', async () => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/colony/verify',
        payload: {
          nonce: 'unknown-nonce',
          signed_nonce: 'whatever'
        }
      })

      expect(res.statusCode).toBe(401)
    })

    it('拒绝无效 HMAC', async () => {
      const spec = makeSpec()
      const timestamp = new Date().toISOString()

      const joinRes = await ctx.app.inject({
        method: 'POST',
        url: '/colony/join',
        payload: {
          spec,
          timestamp,
          signature: signJoin(timestamp, TEST_TOKEN)
        }
      })
      const { nonce } = joinRes.json()

      const res = await ctx.app.inject({
        method: 'POST',
        url: '/colony/verify',
        payload: {
          nonce,
          signed_nonce: 'invalid-hmac'
        }
      })

      expect(res.statusCode).toBe(401)
    })
  })

  describe('POST /colony/heartbeat', () => {
    it('通过 session_token 更新心跳', async () => {
      const { welcome } = await doFullHandshake()

      const res = await ctx.app.inject({
        method: 'POST',
        url: '/colony/heartbeat',
        payload: {
          session_token: welcome.session_token,
          status: 'busy',
          load: 0.5,
          active_tasks: 2
        }
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.type).toBe('colony.heartbeat_ack')
      expect(body.agent_id).toBe(welcome.agent_id)
    })

    it('拒绝无效 session_token', async () => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/colony/heartbeat',
        payload: { session_token: 'invalid-token' }
      })

      expect(res.statusCode).toBe(401)
    })
  })

  describe('POST /colony/update', () => {
    it('更新 capabilities', async () => {
      const { welcome } = await doFullHandshake()

      const res = await ctx.app.inject({
        method: 'POST',
        url: '/colony/update',
        payload: {
          session_token: welcome.session_token,
          patch: {
            capabilities: ['code_generation', 'sql_query']
          }
        }
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().updated_fields).toContain('capabilities')

      // 验证 Hive 中已更新
      const agent = ctx.hive.get(welcome.agent_id)
      expect(agent.capabilities).toEqual(['code_generation', 'sql_query'])
    })

    it('更新 constraints（merge）', async () => {
      const { welcome } = await doFullHandshake()

      const res = await ctx.app.inject({
        method: 'POST',
        url: '/colony/update',
        payload: {
          session_token: welcome.session_token,
          patch: {
            constraints: { max_concurrent: 5 }
          }
        }
      })

      expect(res.statusCode).toBe(200)

      const agent = ctx.hive.get(welcome.agent_id)
      expect(agent.constraints.max_concurrent).toBe(5)
      expect(agent.constraints.timeout_default).toBe(30) // 保持默认
    })
  })

  describe('POST /colony/leave', () => {
    it('成功注销 Agent', async () => {
      const { welcome } = await doFullHandshake()

      const res = await ctx.app.inject({
        method: 'POST',
        url: '/colony/leave',
        payload: { session_token: welcome.session_token }
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().type).toBe('colony.goodbye')

      // 验证已从 Hive 移除
      expect(ctx.hive.get(welcome.agent_id)).toBeUndefined()
      expect(ctx.hive.getBySessionToken(welcome.session_token)).toBeUndefined()
    })

    it('注销后心跳应失败', async () => {
      const { welcome } = await doFullHandshake()

      await ctx.app.inject({
        method: 'POST',
        url: '/colony/leave',
        payload: { session_token: welcome.session_token }
      })

      const res = await ctx.app.inject({
        method: 'POST',
        url: '/colony/heartbeat',
        payload: { session_token: welcome.session_token }
      })

      expect(res.statusCode).toBe(401)
    })
  })
})
