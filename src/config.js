import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  PORT: z.coerce.number().default(9009),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  QUEEN_SECRET: z.string().default('change-me-in-production'),
  COLONY_TOKEN: z.string().default('change-me-in-production'),

  SCHEDULER_MAX_RETRY: z.coerce.number().default(3),
  SCHEDULER_RETRY_BASE_DELAY_MS: z.coerce.number().default(1000),
  SCHEDULER_RETRY_MAX_DELAY_MS: z.coerce.number().default(30000),

  HEARTBEAT_CHECK_INTERVAL_MS: z.coerce.number().default(10000),
  HEARTBEAT_TIMEOUT_MS: z.coerce.number().default(30000),

  TASK_DEFAULT_TIMEOUT_S: z.coerce.number().default(30),
  TASK_QUEUE_MAX_SIZE: z.coerce.number().default(1000),

  WAGGLE_DEFAULT_TTL_MS: z.coerce.number().default(30000),
  WAGGLE_QUEUE_MAX_SIZE: z.coerce.number().default(1000),

  PLANNER_LLM_PROVIDER: z.enum(['glm', 'anthropic', 'openai']).default('glm'),
  PLANNER_LLM_MODEL: z.string().default('glm-4'),
  PLANNER_LLM_API_KEY: z.string().default(''),
  PLANNER_LLM_TIMEOUT_MS: z.coerce.number().default(15000),
  PLANNER_FALLBACK_ENABLED: z.coerce.boolean().default(true)
})

/** @type {z.infer<typeof schema>} */
const config = schema.parse(process.env)

export default config
