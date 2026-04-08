<div align="center">

# Colony Queen

**多 Agent 编排中心 — 蜂群系统的"蜂后"**

Agent 注册管理 · 任务规划与调度 · 心跳监控 · 实时状态推送

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Node.js >= 18](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)
[![GitHub issues](https://img.shields.io/github/issues/loongJiu/colony-queen.svg)](https://github.com/loongJiu/colony-queen/issues)

[English](#) · [中文文档](#)

</div>

---

## 特性

- **Agent 生命周期管理** — 注册、心跳监控、超时自动标记、踢出
- **智能任务规划** — LLM 驱动（GLM / Anthropic / OpenAI），不可用时自动回退规则引擎
- **能力调度** — 根据任务需求匹配最优 Agent，优先级队列
- **实时状态推送** — SSE 事件流，全量快照 + 增量更新
- **管理前端** — 基于 React Flow 的可视化拓扑，实时展示 Agent 与任务状态
- **高测试覆盖** — 后端 298 个测试用例，测试/源码比 1.45:1

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

- **Node.js** >= 18
- **npm** >= 9

### 安装

```bash
git clone https://github.com/loongJiu/colony-queen.git
cd colony-queen

# 安装后端依赖
npm install

# 安装前端依赖
cd queen-web && npm install && cd ..

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入 API Key 等配置
```

### 启动

```bash
# 开发模式（后端，支持热重载）
npm run dev

# 前端开发服务器（独立终端）
cd queen-web && npm run dev
```

后端默认运行在 `http://localhost:9009`，前端运行在 `http://localhost:3000` 并自动代理 API 请求到后端。

### 验证

```bash
curl http://localhost:9009/health
# {"status":"ok","timestamp":1700000000000}
```

## 配置说明

所有配置通过环境变量管理，参考 `.env.example`：

### 服务

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
| `PLANNER_LLM_PROVIDER` | `glm` | LLM 提供商（glm / anthropic / openai） |
| `PLANNER_LLM_MODEL` | `glm-4` | 模型名称 |
| `PLANNER_LLM_API_KEY` | — | API 密钥 |
| `PLANNER_FALLBACK_ENABLED` | `true` | LLM 不可用时回退到规则引擎 |
| `LLM_GLM_BASE_URL` | — | GLM API 端点 |
| `LLM_ANTHROPIC_BASE_URL` | — | Anthropic API 端点 |
| `LLM_OPENAI_BASE_URL` | — | OpenAI API 端点 |

> 未配置 LLM API Key 时，Planner 自动回退到基于关键词的规则引擎。

## API 概览

### Agent 管理

```
POST   /api/colony/join          # Agent 注册（握手）
POST   /api/colony/heartbeat     # Agent 心跳上报
DELETE /api/colony/leave/:id      # Agent 主动离线
GET    /api/agents                # Agent 列表
GET    /api/agents/:id            # Agent 详情
```

### 任务管理

```
POST   /api/tasks                 # 创建任务
GET    /api/tasks                 # 任务列表
GET    /api/tasks/:id             # 任务详情
POST   /api/tasks/:id/cancel      # 取消任务
```

### 实时推送

```
GET    /api/stream                # SSE 实时事件流
```

事件类型：`snapshot` · `agent.updated` · `task.updated` · `task.log`

### 管理

```
GET    /api/admin/stats           # 系统统计
POST   /api/admin/agents/:id/kick # 踢出 Agent
```

## Demo 脚本

```bash
node demo.mjs          # 模拟 Agent 注册和心跳
node demo-stream.mjs   # SSE 流式推送演示
node demo-tasks.mjs    # 任务执行演示
```

## 测试

```bash
npm test               # 后端测试
npm run test:watch     # watch 模式
cd queen-web && npm test  # 前端测试
```

## 技术栈

| 层 | 技术 |
|---|------|
| 后端 | Fastify 5 · Zod · EventTarget |
| 前端 | React 19 · React Router 7 · ReactFlow 11 · Zustand 5 · Vite 6 |
| LLM | Anthropic / OpenAI

## 贡献

欢迎提交 Issue 和 Pull Request。

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## License

[AGPL-3.0](LICENSE) &copy; Zhang Xu
