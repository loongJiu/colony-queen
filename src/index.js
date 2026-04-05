import Fastify from 'fastify'
import config from './config.js'
import { BeeError } from './utils/errors.js'
import { Hive } from './core/hive.js'
import { Waggle } from './core/waggle.js'
import { Scheduler } from './core/scheduler.js'
import colonyRoutes from './handlers/colony.js'

const app = Fastify({
  logger: {
    level: config.NODE_ENV === 'production' ? 'info' : 'debug'
  }
})

// 初始化 Hive 注册表
const hive = new Hive()
app.decorate('hive', hive)

// 初始化 Waggle 消息总线
const waggle = new Waggle({ maxSize: config.WAGGLE_QUEUE_MAX_SIZE })
app.decorate('waggle', waggle)

// 初始化 Scheduler 调度器
const scheduler = new Scheduler({ hive })
app.decorate('scheduler', scheduler)

// 统一错误处理
app.setErrorHandler((err, request, reply) => {
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
app.register(colonyRoutes, { hive, waggle, colonyToken: config.COLONY_TOKEN })

// Start server
try {
  await app.listen({ port: config.PORT, host: config.HOST })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

export default app
