# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Colony-queen is the orchestration hub ("Queen Bee") of the Colony multi-agent system. It is a backend HTTP service built with Fastify v5 that registers Worker agents, plans tasks (keyword or LLM), dispatches work via HTTP, collects results, and feeds performance data back into scheduling decisions via capability profiles and plan memory.

## Commands

- `npm run dev` — Start dev server with `node --watch` (auto-reload)
- `npm start` — Start production server
- `npm test` — Run tests once with Vitest
- `npm run test:watch` — Run tests in watch mode
- `npx vitest run test/path/to.test.js` — Run a single test file

Demo scripts (模拟 Agent + 端到端测试):
- `node demo.mjs` — 注册 4 个模拟 Agent + 持续心跳（含 mock task server）
- `node demo.mjs --chaos` — Agent 随机状态/负载变化
- `node demo.mjs --task` — 注册 Agent + 提交测试任务
- `node demo.mjs --leave` — 周期性让 Agent 优雅离线再回来
- `node demo.mjs --update` — 周期性更新 Agent spec（测试 /colony/update）
- `node demo.mjs --clean` — 清理所有 Agent 后退出
- 以上参数可组合使用，如 `node demo.mjs --task --chaos`

Task 测试 (需要先启动 demo.mjs):
- `node demo-tasks.mjs` — 运行所有任务测试
- `node demo-tasks.mjs --single` — 单步任务测试
- `node demo-tasks.mjs --serial` — 串行多步任务测试
- `node demo-tasks.mjs --parallel` — 并行任务测试
- `node demo-tasks.mjs --cancel` — 任务取消测试
- `node demo-tasks.mjs --precheck` — 预检失败测试（无匹配 capability）
- `node demo-tasks.mjs --force` — 强制移除 Agent 测试
- `node demo-tasks.mjs --health` — Admin health 检查
- `node demo-tasks.mjs --list` — 列出所有任务

SSE 实时流测试:
- `node demo-stream.mjs` — 持续监听所有 SSE 事件
- `node demo-stream.mjs --filter task.updated` — 只显示 task 事件
- `node demo-stream.mjs --count 10` — 收到 10 个事件后退出
- `node demo-stream.mjs --snapshot` — 只打印初始快照然后退出

Frontend (queen-web):
- `cd queen-web && npm run dev` — Start Vite dev server on port 3000 (proxies /admin → :9009)
- `cd queen-web && npm run build` — Production build

No build step — plain JavaScript (ESM) executed directly by Node >= 18.

## Architecture

**ESM project** (`"type": "module"` in package.json). All `.js` files use ES module syntax.

### Request Lifecycle

```
Client POST /task
  → Planner.analyzePlan (keyword rule engine or LLM, with few-shot from PlanMemory)
  → Executor.run(task)
      → Scheduler.selectAgent(capability) [uses profile cache + circuit breaker]
      → HTTP POST {agent.endpoint}/bee/task
      → Collect StepResult, retry if needed
      → Aggregator.merge(results) + optional LLM synthesis
      → FeedbackService.autoScore → ProfileUpdater + PlanMemory update
      → EventBus emit → SSE push to frontend
```

### Route Registration

Each route group is a default-exported function in `src/handlers/` that receives `(fastify, options)` and registers routes directly. The main index creates all core/service instances, decorates them onto the app, then passes them as `options` via `app.register()`.

| Handler | Routes | Key deps |
|---|---|---|
| `handlers/colony.js` | `/colony/join`, `/colony/verify`, `/colony/heartbeat`, `/colony/update`, `/colony/leave` | hive, waggle, colonyToken, eventBus |
| `handlers/task.js` | `/task` (POST), `/task/:taskId` (GET/DELETE), `/task/:taskId/feedback` (GET/POST) | planner, executor, hive, eventBus, feedbackService, sessionService |
| `handlers/session.js` | `/session` (POST/GET), `/session/:sessionId` (GET), `/session/:sessionId/context` (POST) | sessionService |
| `handlers/admin.js` | `/admin/agents`, `/admin/tasks`, `/admin/health`, `/admin/agents/:id` (DELETE) | hive, executor, heartbeat, eventBus, waggle |
| `handlers/stats.js` | `/admin/stats`, `/admin/profiles`, `/admin/profiles/:agentId` | hive, executor, store, sessionService |
| `handlers/stream.js` | `/admin/stream` (SSE) | hive, executor, eventBus |

Colony routes use HMAC-based session tokens. Other routes have no auth in current MVP.

### Core Modules (`src/core/`)

- **Hive** (`hive.js`) — In-memory agent registry with multi-index lookups (by ID, capability, status, session token). All records are frozen-immutable; mutations create new objects.
- **Scheduler** (`scheduler.js`) — Capability-based weighted agent selection. 3-stage pipeline: capability filter → health filter → circuit-breaker filter. Uses softmax sampling over profile weights when profiles exist, load-balance fallback otherwise. Supports affinity scheduling for serial tasks.
- **Planner** (`planner.js`) — Two planning modes: **keyword** (rule engine scanning task descriptions against capability names) and **LLM** (sends agent capability catalog + few-shot historical cases). `precheck()` does fast feasibility check without LLM.
- **Waggle** (`waggle.js`) — Per-agent priority message queues (priority 1-5, TTL-based expiry). Immediate delivery if subscriber exists, otherwise queues. Used for dispatching feedback to agents.
- **Aggregator** (`aggregator.js`) — Pure function that merges step results into final output based on strategy (serial=last result, parallel=all results array, single=first result).

### Services (`src/services/`)

- **Executor** (`executor.js`) — Central task execution engine. Dispatches by strategy (single/serial/parallel). For serial tasks, implements checkpoint resume (preserves completed steps). Uses AbortController for timeout/cancellation. Integrates with RetryService, CircuitBreaker, FeedbackService, LLMClient.
- **Heartbeat** (`heartbeat.js`) — Periodic scan that marks agents offline when heartbeat exceeds `HEARTBEAT_TIMEOUT_MS`.
- **LLMClient** (`llm-client.js`) — Multi-provider client (GLM via Anthropic-compatible endpoint, native Anthropic, OpenAI). Single method: `complete(prompt, options)`.
- **Retry** (`retry.js`) — Exponential backoff wrapper. Retries on `error.retryable` or error codes `ERR_TIMEOUT`/`ERR_UNAVAILABLE`.
- **FeedbackService** (`feedback-service.js`) — Auto-scores on task completion (0-1 scale via FeedbackScorer). User feedback blends as `auto * 0.3 + user * 0.7`. Triggers ProfileUpdater and PlanMemory.
- **CircuitBreaker** (`circuit-breaker.js`) — Per-agent state machine (closed→open→half_open). Opens on 5 consecutive failures or >50% failure rate in 60s window.
- **Rescheduler** (`rescheduler.js`) — Subscribes to `agent.offline` events, re-executes affected tasks using checkpoint resume.
- **FeedbackScorer** (`feedback-scorer.js`) — Starts at 1.0, deducts for failure, retries, low confidence, partial output.
- **PlanMemory** (`plan-memory.js`) — Records LLM plans as cases. Score ≥ 0.6 → confirmed, else discarded. Confirmed cases serve as few-shot examples for future LLM planning.
- **ProfileUpdater** (`profile-updater.js`) — Updates capability profiles using EMA (alpha=0.1) smoothing after each task.
- **SessionService** (`session-service.js`) — Manages work session lifecycle with cross-task context references.

### Storage Layer (`src/storage/`)

- `interface.js` — Defines `STORAGE_METHODS` array (24 methods) and `assertImplements()` runtime check.
- `index.js` — Factory: `createStorage({backend, path})` returns MemoryStore or SQLiteStore.
- `memory-store.js` — In-memory Maps with secondary indexes. All methods return Promises.
- `sqlite-store.js` — `better-sqlite3` with WAL mode. Tables: feedbacks, plan_cases, capability_profiles, profile_score_history, work_sessions.

Backend selected via `STORAGE_BACKEND` env var (`memory` default, `sqlite`).

### Models (`src/models/`)

All models follow: exported `create*Record(params)` factory → validates inputs → returns `Object.freeze()`-immutable record. ID generation via `src/utils/id.js` pattern: `{prefix}_{timestamp}_{random4chars}`.

### Event Bus (`src/utils/event-bus.js`)

Extends Node.js `EventEmitter` with dual-emit: fires both a wildcard `'event'` channel (for SSE streaming) and a named channel (for targeted subscriptions like Rescheduler).

### Frontend (`queen-web/`)

React 19 SPA: Vite + Zustand + React Router + ReactFlow + Recharts. API layer in `src/api/`, Zustand stores in `src/stores/`, pages in `src/pages/` (Overview, Agents, Tasks, Sessions, etc.).

## Conventions

- Config from environment variables, validated via Zod in `src/config.js`. Add new config there with a default value.
- Use `BeeError` subclasses from `src/utils/errors.js` for all API errors — the global handler in `index.js` dispatches on them.
- Use `gen{Type}Id()` from `src/utils/id.js` for new entity IDs.
- Models: `create{Type}Record()` factory → `Object.freeze()` result. Never mutate records in place.
- Storage: add new methods to `interface.js` `STORAGE_METHODS` array, implement in both `memory-store.js` and `sqlite-store.js`.
- Logging: Fastify's built-in Pino logger (`request.log` / `app.log`). `debug` in dev, `info` in prod.
- Tests: Vitest with `describe/it/expect`. Helper factories at top of test files. Unit tests instantiate core classes directly; integration tests cover full flows.

## Dependencies

`fastify` ^5, `@anthropic-ai/sdk`, `better-sqlite3`, `dotenv` ^17, `zod` ^4. Dev: `vitest` ^3. No TypeScript, no linter, no formatter.
