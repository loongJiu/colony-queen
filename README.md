# Colony Queen

Colony 系统的"蜂后" — 多 Agent 编排中心。负责 Agent 注册管理、任务规划与调度、心跳监控和实时状态推送。

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    Colony Queen                         │
│                                                         │
│  ┌───────┐  ┌─────────┐  ┌──────────┐  ┌────────────┐ │
│  │ Hive  │  │ Waggle  │  │ Scheduler│  │  Planner   │ │
│  │注册表  │  │消息总线  │  │  调度器   │  │任务规划器   │ │
│  └───────┘  └─────────┘  └──────────┘  └────────────┘ │
│       ▲          ▲             ▲              ▲        │
│       │          │             │              │        │
│  ┌────┴──────────┴─────────────┴──────────────┴─────┐  │
│  │                   Executor                        │  │
│  │              任务执行器 + 重试服务                   │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌────────────────┐  ┌───────────────┐                 │
│  │ HeartbeatMonitor│  │  SSE Stream   │                 │
│  │   心跳监控       │  │  实时推送      │                 │
│  └────────────────┘  └───────────────┘                 │
└─────────────────────────────────────────────────────────┘
          ▲  HTTP/SSE           ▲  HTTP (REST)
          │                     │
    ┌─────┴─────┐        ┌─────┴─────┐
    │   Bee     │        │  Queen Web │
    │  Worker   │        │  管理前端    │
    └───────────┘        └───────────┘
```

**核心模块：**

| 模块 | 文件 | 职责 |
|------|------|------|
| Hive | `src/core/hive.js` | Agent 注册表，管理 Agent 生命周期和状态 |
| Waggle | `src/core/waggle.js` | 消息总线，优先级队列 + 发布/订阅 |
| Scheduler | `src/core/scheduler.js` | 调度器，根据能力匹配 Agent |
| Planner | `src/core/planner.js` | 任务规划器，LLM + 规则混合策略 |
| Executor | `src/services/executor.js` | 任务执行器，管理执行生命周期和超时 |
| HeartbeatMonitor | `src/services/heartbeat.js` | 心跳监控，自动标记超时 Agent |

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装

```bash
# 克隆仓库
git clone https://github.com/loongJiu/colony-queen.git
cd colony-queen

# 安装后端依赖
npm install

# 安装前端依赖
cd queen-web && npm install && cd ..

# 复制环境变量配置
cp .env.example .env
# 编辑 .env 填入实际的 API Key 等配置
```

### 启动

```bash
# 开发模式（后端，支持热重载）
npm run dev

# 生产模式
npm start

# 前端开发服务器（独立终端）
cd queen-web && npm run dev
```

后端默认运行在 `http://localhost:9009`，前端开发服务器运行在 `http://localhost:3000` 并自动代理 API 请求到后端。

### 健康检查

```bash
curl http://localhost:9009/health
# {"status":"ok","timestamp":1700000000000}
```

## 配置说明

所有配置通过环境变量管理，参考 `.env.example`：

### 服务配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `9009` | 服务端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `NODE_ENV` | `development` | 运行环境 |

### 安全

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `QUEEN_SECRET` | `change-me-in-production` | Queen API 密钥 |
| `COLONY_TOKEN` | `change-me-in-production` | Agent 注册令牌 |

### LLM Planner

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PLANNER_LLM_PROVIDER` | `glm` | LLM 提供商（glm/anthropic/openai） |
| `PLANNER_LLM_MODEL` | `glm-4` | 模型名称 |
| `PLANNER_LLM_API_KEY` | - | API 密钥 |
| `PLANNER_FALLBACK_ENABLED` | `true` | LLM 不可用时回退到规则引擎 |
| `LLM_GLM_BASE_URL` | - | GLM API 端点 |
| `LLM_ANTHROPIC_BASE_URL` | - | Anthropic API 端点 |
| `LLM_OPENAI_BASE_URL` | - | OpenAI API 端点 |

> 如果未配置 LLM API Key，Planner 自动回退到基于关键词的规则引擎。

## API 概览

### Agent 管理

```
POST   /api/colony/join          # Agent 注册（握手）
POST   /api/colony/heartbeat     # Agent 心跳上报
DELETE /api/colony/leave/:id      # Agent 主动离线
GET    /api/agents                # 获取 Agent 列表
GET    /api/agents/:id            # 获取 Agent 详情
```

### 任务管理

```
POST   /api/tasks                 # 创建任务
GET    /api/tasks                 # 获取任务列表
GET    /api/tasks/:id             # 获取任务详情
POST   /api/tasks/:id/cancel      # 取消任务
```

### 实时推送

```
GET    /api/stream                # SSE 实时事件流
```

事件类型：`snapshot`（全量快照）、`agent.updated`、`task.updated`、`task.log`

### 管理

```
GET    /api/admin/stats           # 系统统计信息
POST   /api/admin/agents/:id/kick # 踢出 Agent
```

## 测试

```bash
# 后端测试
npm test

# 后端测试（watch 模式）
npm run test:watch

# 前端测试
cd queen-web && npm test
```

测试覆盖率：后端 22 个测试文件，298 个测试用例，测试/源码比约 1.45:1。

## Demo 脚本

项目提供了三个演示脚本用于验证核心功能：

```bash
# 模拟 Agent 注册和心跳
node demo.mjs

# SSE 流式推送演示
node demo-stream.mjs

# 任务执行演示
node demo-tasks.mjs
```

## 技术栈

**后端：** Fastify 5 + Zod + EventTarget 事件总线

**前端：** React 19 + React Router 7 + ReactFlow 11 + Zustand 5 + Vite 6

**LLM：** 支持 GLM（Anthropic 兼容）/ Anthropic / OpenAI

## License

[AGPL-3.0](LICENSE)
