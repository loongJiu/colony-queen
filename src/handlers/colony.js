/**
 * Colony 握手协议路由
 *
 * 四步握手：join → challenge → verify → welcome
 * 运维路由：heartbeat / update / leave
 */

import { generateNonce, verifyJoinSignature, verifySignedNonce } from '../utils/crypto.js'
import { UnauthorizedError, ValidationError } from '../utils/errors.js'
import { genSessionId } from '../utils/id.js'

/** @type {Map<string, { spec: Object, expiresAt: number }>} */
const pendingChallenges = new Map()

const NONCE_TTL_MS = 30_000

/**
 * 注册 Colony 路由到 Fastify 实例
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ hive: import('../core/hive.js').Hive, colonyToken: string }} options
 */
export default function colonyRoutes(app, options) {
  const { hive, colonyToken } = options

  // ── POST /colony/join ─────────────────────────

  app.post('/colony/join', async (request, reply) => {
    const { spec, timestamp, signature } = request.body ?? {}

    if (!spec || !timestamp || !signature) {
      throw new ValidationError('Missing required fields: spec, timestamp, signature')
    }

    if (!verifyJoinSignature(timestamp, signature, colonyToken)) {
      throw new UnauthorizedError('Invalid signature')
    }

    const nonce = generateNonce()
    const expiresAt = Date.now() + NONCE_TTL_MS

    pendingChallenges.set(nonce, { spec, expiresAt })

    request.log.debug({ nonce }, 'Challenge issued')

    reply.status(200).send({
      type: 'colony.challenge',
      nonce,
      expires_at: new Date(expiresAt).toISOString()
    })
  })

  // ── POST /colony/verify ───────────────────────

  app.post('/colony/verify', async (request, reply) => {
    const { nonce, signed_nonce } = request.body ?? {}

    if (!nonce || !signed_nonce) {
      throw new ValidationError('Missing required fields: nonce, signed_nonce')
    }

    // 查找 pending challenge
    const challenge = pendingChallenges.get(nonce)
    if (!challenge) {
      throw new UnauthorizedError('Unknown or expired nonce')
    }

    // 检查过期
    if (Date.now() > challenge.expiresAt) {
      pendingChallenges.delete(nonce)
      throw new UnauthorizedError('Nonce expired')
    }

    // 验证 HMAC
    if (!verifySignedNonce(nonce, signed_nonce, colonyToken)) {
      throw new UnauthorizedError('Invalid signed nonce')
    }

    // 注册到 Hive
    pendingChallenges.delete(nonce)
    const sessionToken = genSessionId()
    const record = hive.register(challenge.spec, sessionToken)

    request.log.info({ agentId: record.agentId, role: record.role }, 'Agent joined')

    reply.status(200).send({
      type: 'colony.welcome',
      agent_id: record.agentId,
      session_token: sessionToken,
      queen_id: 'queen_main',
      colony_version: '1.0',
      joined_at: new Date(record.joinedAt).toISOString()
    })
  })

  // ── POST /colony/heartbeat ────────────────────

  app.post('/colony/heartbeat', async (request, reply) => {
    const { session_token, status, load, active_tasks, queue_depth } = request.body ?? {}

    const agent = authenticateByToken(session_token)

    const updated = hive.updateHeartbeat(agent.agentId, {
      ...(status != null && { status }),
      ...(load != null && { load }),
      ...(active_tasks != null && { activeTasks: active_tasks }),
      ...(queue_depth != null && { queueDepth: queue_depth })
    })

    request.log.debug({ agentId: agent.agentId }, 'Heartbeat received')

    reply.status(200).send({
      type: 'colony.heartbeat_ack',
      agent_id: updated.agentId,
      received_at: new Date(updated.lastHeartbeat).toISOString()
    })
  })

  // ── POST /colony/update ───────────────────────

  app.post('/colony/update', async (request, reply) => {
    const { session_token, patch } = request.body ?? {}

    if (!patch) {
      throw new ValidationError('Missing required field: patch')
    }

    const agent = authenticateByToken(session_token)

    const updated = hive.updateSpec(agent.agentId, patch)

    request.log.info({ agentId: agent.agentId }, 'Agent spec updated')

    reply.status(200).send({
      type: 'colony.update_ack',
      agent_id: updated.agentId,
      updated_fields: Object.keys(patch)
    })
  })

  // ── POST /colony/leave ────────────────────────

  app.post('/colony/leave', async (request, reply) => {
    const { session_token } = request.body ?? {}

    const agent = authenticateByToken(session_token)

    hive.unregister(agent.agentId)

    request.log.info({ agentId: agent.agentId }, 'Agent left')

    reply.status(200).send({
      type: 'colony.goodbye',
      agent_id: agent.agentId
    })
  })

  // ── 内部工具 ──────────────────────────────────

  /**
   * 通过 session token 查找 Agent，失败抛 401
   * @param {string|undefined} sessionToken
   * @returns {import('../models/agent.js').AgentRecord}
   */
  function authenticateByToken(sessionToken) {
    if (!sessionToken) {
      throw new UnauthorizedError('Missing session_token')
    }
    const agent = hive.getBySessionToken(sessionToken)
    if (!agent) {
      throw new UnauthorizedError('Invalid session_token')
    }
    return agent
  }
}
