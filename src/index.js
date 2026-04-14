import Fastify from 'fastify'
import config from './config.js'
import { BeeError } from './utils/errors.js'
import { EventBus } from './utils/event-bus.js'
import { Hive } from './core/hive.js'
import { Waggle } from './core/waggle.js'
import { Scheduler } from './core/scheduler.js'
import { Planner } from './core/planner.js'
import { LLMClient } from './services/llm-client.js'
import { Executor } from './services/executor.js'
import { HeartbeatMonitor } from './services/heartbeat.js'
import { RetryService } from './services/retry.js'
import { TaskRescheduler } from './services/rescheduler.js'
import { createStorage } from './storage/index.js'
import { FeedbackService } from './services/feedback-service.js'
import { PlanMemory } from './services/plan-memory.js'
import { ProfileUpdater } from './services/profile-updater.js'
import { CircuitBreaker } from './services/circuit-breaker.js'
import { SessionService } from './services/session-service.js'
import colonyRoutes from './handlers/colony.js'
import taskRoutes from './handlers/task.js'
import sessionRoutes from './handlers/session.js'
import adminRoutes from './handlers/admin.js'
import statsRoutes from './handlers/stats.js'
import streamRoutes from './handlers/stream.js'

const app = Fastify({
  logger: {
    level: config.NODE_ENV === 'production' ? 'info' : 'debug'
  }
})

// 初始化 EventBus 事件总线
const eventBus = new EventBus()
app.decorate('eventBus', eventBus)

// 初始化 Hive 注册表
const hive = new Hive()
app.decorate('hive', hive)

// 初始化 Waggle 消息总线
const waggle = new Waggle({ maxSize: config.WAGGLE_QUEUE_MAX_SIZE, logger: app.log })
app.decorate('waggle', waggle)

// 初始化 CircuitBreaker 熔断器
const circuitBreaker = new CircuitBreaker()

// 初始化 Scheduler 调度器
const scheduler = new Scheduler({ hive, circuitBreaker })
app.decorate('scheduler', scheduler)

// 初始化存储层
const store = createStorage({
  backend: config.STORAGE_BACKEND,
  ...(config.STORAGE_BACKEND === 'sqlite' && { path: config.SQLITE_PATH })
})

// 初始化 PlanMemory 规划记忆
const planMemory = new PlanMemory({ store, logger: app.log })

// 初始化 ProfileUpdater 能力画像更新器
const profileUpdater = new ProfileUpdater({ store })

// 初始化 LLMClient
const llmClient = new LLMClient({
  provider: config.PLANNER_LLM_PROVIDER,
  model: config.PLANNER_LLM_MODEL,
  apiKey: config.PLANNER_LLM_API_KEY,
  timeout: config.PLANNER_LLM_TIMEOUT_MS,
  logger: app.log,
  glmBaseUrl: config.LLM_GLM_BASE_URL,
  anthropicBaseUrl: config.LLM_ANTHROPIC_BASE_URL,
  openaiBaseUrl: config.LLM_OPENAI_BASE_URL
})

// 初始化 Planner 任务规划器
const planner = new Planner({
  hive,
  llmClient,
  fallbackEnabled: config.PLANNER_FALLBACK_ENABLED,
  planMemory,
  logger: app.log
})
app.decorate('planner', planner)

// 初始化 RetryService 重试服务
const retryService = new RetryService()
app.decorate('retryService', retryService)

// 初始化 FeedbackService 反馈服务
const feedbackService = new FeedbackService({
  eventBus,
  waggle,
  hive,
  store,
  planMemory,
  profileUpdater,
  logger: app.log
})
app.decorate('feedbackService', feedbackService)

// 初始化 SessionService 工作会话服务
const sessionService = new SessionService({
  store,
  logger: app.log
})
app.decorate('sessionService', sessionService)

// 初始化 Executor 任务执行器
const executor = new Executor({
  scheduler,
  retryService,
  logger: app.log,
  defaultTimeoutMs: config.TASK_DEFAULT_TIMEOUT_S * 1000,
  maxRetry: config.SCHEDULER_MAX_RETRY,
  eventBus,
  llmClient,
  feedbackService,
  circuitBreaker
})
app.decorate('executor', executor)

// 统一错误处理
app.setErrorHandler((err, request, reply) => {
  // SSE 连接断开时 err 可能为空，静默忽略
  if (!err) return

  if (err instanceof BeeError) {
    reply.status(err.statusCode).send(err.toJSON(request.id))
    return
  }

  // Fastify 内置验证错误
  if (err.validation) {
    reply.status(400).send({
      error: {
        code: 'ERR_VALIDATION',
        message: err.message,
        requestId: request.id,
        retryable: false
      }
    })
    return
  }

  // SSE 断开导致的连接错误，静默忽略
  if (err.code === 'ERR_HTTP_HEADERS_SENT' || err.code === 'ECONNRESET') {
    return
  }

  request.log.error({ err }, 'Unhandled error')
  reply.status(500).send({
    error: {
      code: 'ERR_INTERNAL',
      message: 'Internal server error',
      requestId: request.id,
      retryable: false
    }
  })
})

// Health check
app.get('/health', async () => {
  return { status: 'ok', timestamp: Date.now() }
})

// 注册路由
app.register(colonyRoutes, { hive, waggle, colonyToken: config.COLONY_TOKEN, eventBus })
app.register(taskRoutes, { planner, executor, hive, eventBus, feedbackService, sessionService })
app.register(sessionRoutes, { sessionService })

// 启动心跳监控
const heartbeatMonitor = new HeartbeatMonitor({
  hive,
  waggle,
  intervalMs: config.HEARTBEAT_CHECK_INTERVAL_MS,
  timeoutMs: config.HEARTBEAT_TIMEOUT_MS,
  eventBus
})

// 注册管理路由（需要 heartbeatMonitor）
app.register(adminRoutes, { hive, executor, heartbeat: heartbeatMonitor, eventBus, waggle })

// 注册统计与画像管理路由
app.register(statsRoutes, { hive, executor, store, sessionService })

// 注册 SSE 流式推送路由
app.register(streamRoutes, { hive, executor, eventBus })

// 初始化 TaskRescheduler 任务重调度器
const rescheduler = new TaskRescheduler({
  waggle,
  executor,
  scheduler,
  logger: app.log
})
app.decorate('rescheduler', rescheduler)

// 应用生命周期钩子
app.addHook('onReady', async () => {
  // 初始化存储层
  await store.init()
  app.log.info({ backend: config.STORAGE_BACKEND }, 'Storage initialized')

  // 刷新 Scheduler 画像缓存
  await scheduler.refreshProfiles()
  app.log.info('Scheduler profiles refreshed')

  // 订阅画像更新事件，同步 Scheduler 缓存
  eventBus.on('profile.updated', (profile) => {
    scheduler.updateProfileCache(profile)
  })

  // 启动心跳监控（移到 onReady，确保 store 已初始化）
  heartbeatMonitor.start()
  app.log.info('HeartbeatMonitor started')

  // 启动任务重调度器
  rescheduler.start()
  app.log.info('TaskRescheduler started')
})

app.addHook('onClose', async () => {
  // 停止任务重调度器
  rescheduler.stop()
  app.log.info('TaskRescheduler stopped')
  // 停止心跳监控
  heartbeatMonitor.stop()
  app.log.info('HeartbeatMonitor stopped')
  // 关闭存储层
  await store.close()
  app.log.info('Storage closed')
})

// 全局未处理异常
process.on('unhandledRejection', (reason) => {
  app.log.error({ err: reason }, 'Unhandled rejection')
})

let isShuttingDown = false

process.on('uncaughtException', (err) => {
  app.log.fatal({ err }, 'Uncaught exception — shutting down')
  if (isShuttingDown) return
  isShuttingDown = true
  app.close().then(() => process.exit(1)).catch(() => process.exit(1))
})

// 优雅关机
function gracefulShutdown(signal) {
  if (isShuttingDown) return
  isShuttingDown = true
  app.log.info({ signal }, 'Received shutdown signal, closing server...')

  // 5 秒超时强制退出
  const forceTimer = setTimeout(() => {
    app.log.error('Graceful shutdown timed out, forcing exit')
    process.exit(1)
  }, 5000)

  app.close().then(() => {
    clearTimeout(forceTimer)
    app.log.info('Server closed gracefully')
    process.exit(0)
  }).catch((err) => {
    clearTimeout(forceTimer)
    app.log.error({ err }, 'Error during graceful shutdown')
    process.exit(1)
  })
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// Start server
try {
  await app.listen({ port: config.PORT, host: config.HOST })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

export default app
