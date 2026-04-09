# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-10

### Phase 3: 智能学习闭环 (Week 1-6)

#### 反馈系统

**新增文件:**
- `src/models/feedback.js` — Feedback 数据模型，定义 FeedbackRecord 工厂函数与校验逻辑
- `src/services/feedback-scorer.js` — 反馈自动评分算法，基于执行状态、重试次数、置信度、输出完整性等维度计算
- `src/services/feedback-service.js` — 反馈回传与持久化服务，自动评分、用户评分、Waggle 回传
- `test/models/feedback.test.js` — Feedback 模型单元测试
- `test/services/feedback-scorer.test.js` — FeedbackScorer 评分算法单元测试
- `test/handlers/task-feedback.test.js` — 任务反馈 HTTP API 测试
- `test/integration/feedback-flow.test.js` — 反馈流程集成测试

**修改文件:**
- `src/handlers/task.js` — 新增 `POST /api/tasks/:id/feedback` 用户评分端点
- `src/services/executor.js` — 任务完成后自动触发 FeedbackService.autoScore()

**新增 API 端点:**
- `POST /api/tasks/:id/feedback` — 提交用户评分（userScore 1-5 + comment）

**新增数据模型:**
- `FeedbackRecord` — 反馈记录（不可变），字段: feedbackId, taskId, conversationId, agentId, capability, source, userScore, autoScore, finalScore, userComment, corrections, taskContext

#### 存储层

**新增文件:**
- `src/storage/interface.js` — 存储接口定义，包含 Feedback / PlanCase / CapabilityProfile / WorkSession 全部方法签名
- `src/storage/memory-store.js` — 内存存储实现，用于开发和测试
- `src/storage/sqlite-store.js` — SQLite 存储实现，用于生产环境
- `src/storage/index.js` — 存储工厂，根据 STORAGE_BACKEND 环境变量创建实例
- `test/storage/index.test.js` — 存储工厂与接口测试
- `test/storage/memory-store.test.js` — MemoryStore 单元测试
- `test/storage/sqlite-store.test.js` — SQLiteStore 单元测试

#### PlanMemory (规划记忆)

**新增文件:**
- `src/models/plan-case.js` — PlanCase 数据模型，记录成功规划案例，支持 djb2 哈希去重
- `src/services/plan-memory.js` — 规划案例记忆服务，few-shot 注入 LLM prompt、相似案例检索
- `test/models/plan-case.test.js` — PlanCase 模型单元测试
- `test/services/plan-memory.test.js` — PlanMemory 服务单元测试

**修改文件:**
- `src/core/planner.js` — Planner 集成 PlanMemory，规划前检索相似案例注入 prompt，规划后记录待确认案例

**新增数据模型:**
- `PlanCaseRecord` — 规划案例记录（不可变），字段: caseId, inputHash, inputText, plan, score, usedCount, status, createdAt, updatedAt

#### 能力画像

**新增文件:**
- `src/models/capability-profile.js` — CapabilityProfile 数据模型，EMA 更新算法、趋势计算
- `src/services/profile-updater.js` — Agent 能力画像更新服务，基于反馈自动更新 actualScore / successRate / avgDuration / trend
- `test/models/capability-profile.test.js` — CapabilityProfile 模型单元测试
- `test/services/profile-updater.test.js` — ProfileUpdater 服务单元测试

**修改文件:**
- `src/core/scheduler.js` — Scheduler v3.0 集成能力画像加权调度、熔断器过滤
- `src/index.js` — 初始化 ProfileUpdater，订阅 `profile.updated` 事件同步 Scheduler 缓存

**新增数据模型:**
- `CapabilityProfile` — 能力画像记录（不可变），字段: agentId, capability, declaredConfidence, actualScore, taskCount, successRate, avgDuration, specializations, recentTrend

#### 熔断器

**新增文件:**
- `src/services/circuit-breaker.js` — Agent 熔断器，状态机 closed → open → half_open，连续失败 5 次或 60s 窗口失败率 > 50% 触发，30s 冷却后试探恢复
- `test/services/circuit-breaker.test.js` — CircuitBreaker 单元测试

**修改文件:**
- `src/services/executor.js` — Executor 集成 CircuitBreaker，任务执行结果记录成功/失败
- `src/index.js` — 初始化 CircuitBreaker 实例，注入 Scheduler

#### WorkSession (工作会话)

**新增文件:**
- `src/models/work-session.js` — WorkSession 数据模型，支持跨任务上下文引用
- `src/services/session-service.js` — 工作会话服务，创建/归档/添加对话/共享上下文/引用解析
- `src/handlers/session.js` — 工作会话 HTTP 路由
- `test/models/work-session.test.js` — WorkSession 模型单元测试
- `test/services/session-service.test.js` — SessionService 服务单元测试
- `test/handlers/session.test.js` — 工作会话 HTTP API 测试
- `test/integration/session-flow.test.js` — 工作会话集成测试

**新增 API 端点:**
- `POST /session` — 创建工作会话
- `GET /session` — 列出工作会话
- `GET /session/:sessionId` — 获取会话详情
- `POST /session/:sessionId/context` — 添加共享上下文

**新增数据模型:**
- `WorkSessionRecord` — 工作会话记录（不可变），字段: sessionId, title, conversationIds, keyOutputs, sharedContext, status, createdAt, updatedAt

#### 统计与画像管理

**新增文件:**
- `src/handlers/stats.js` — 统计与画像管理路由
- `test/handlers/stats.test.js` — 统计 API 测试

**新增 API 端点:**
- `GET /admin/stats` — 系统统计（总任务数、成功率、平均得分、活跃会话数）
- `GET /admin/profiles` — 所有 Agent 能力画像列表（支持 ?agentId= 过滤）
- `GET /admin/profiles/:agentId` — 单个 Agent 能力画像详情

#### Web 可视化 (queen-web)

**新增文件:**
- `queen-web/src/pages/AgentProfile.jsx` — Agent 能力画像可视化页面（柱状图 + 趋势折线图）
- `queen-web/src/pages/Sessions.jsx` — 工作会话列表页面（可折叠展示关联任务）
- `queen-web/src/stores/profiles.js` — Zustand 状态管理: Agent 能力画像
- `queen-web/src/stores/sessions.js` — Zustand 状态管理: 工作会话

**修改文件:**
- `queen-web/src/App.jsx` — 新增 /agents/:id/profile 和 /sessions 路由
- `queen-web/src/components/layout/Sidebar.jsx` — 新增 Sessions 导航项
- `queen-web/src/pages/AgentDetail.jsx` — 新增 "View Profile" 入口
- `queen-web/src/pages/Overview.jsx` — 新增统计概览数据展示
- `queen-web/src/pages/TaskDetail.jsx` — 新增反馈评分展示与提交功能

#### 基础设施

**修改文件:**
- `src/index.js` — 完整组装 Phase 3 所有服务（Storage, PlanMemory, ProfileUpdater, CircuitBreaker, FeedbackService, SessionService, StatsRoutes），onReady 初始化存储和刷新画像缓存，onClose 关闭存储
- `src/config.js` — 新增 STORAGE_BACKEND, SQLITE_PATH 配置项
- `package.json` — 新增 better-sqlite3 依赖

### 前序阶段

#### Phase 1: 核心基础 (Week 1-2)

- Hive 注册表 — Agent 生命周期管理
- Waggle 消息总线 — 优先级队列 + 发布/订阅
- Scheduler 调度器 — 根据能力匹配 Agent
- Executor 任务执行器 — 执行生命周期和超时管理
- HeartbeatMonitor 心跳监控 — 自动标记超时 Agent
- SSE 实时推送 — 全量快照 + 增量更新

#### Phase 2: 智能规划 (Week 3-4)

- LLM Planner — GLM / Anthropic / OpenAI 多供应商支持，不可用时自动回退规则引擎
- RetryService 重试服务 — 最大重试次数 + 指数退避
- TaskRescheduler 任务重调度器 — Agent 离线时自动重新调度
- Web 管理前端 — React Flow 可视化拓扑，任务提交与详情

[1.0.0]: https://github.com/loongJiu/colony-queen/releases/tag/v1.0.0
