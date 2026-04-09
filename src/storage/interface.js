/**
 * Storage 接口定义
 *
 * 定义存储层需要实现的方法，所有存储后端都必须遵循此接口。
 * 当前仅包含 Feedback 相关操作，后续可扩展 Task、Agent 等实体的持久化。
 *
 * ## 接口方法
 *
 * ### 生命周期
 * - init(): Promise<void>       - 初始化存储（建表、建立连接等）
 * - close(): Promise<void>      - 关闭存储（释放资源）
 *
 * ### Feedback 操作
 * - insertFeedback(record): Promise<FeedbackRecord>
 *   插入一条反馈记录
 *
 * - getFeedbackById(feedbackId): Promise<FeedbackRecord | null>
 *   按 feedbackId 查询单条反馈
 *
 * - getFeedbacksByTaskId(taskId): Promise<FeedbackRecord[]>
 *   按 taskId 查询所有反馈
 *
 * - getFeedbacksByAgentId(agentId, options?): Promise<FeedbackRecord[]>
 *   按 agentId 查询反馈历史，支持 limit/offset 分页
 *
 * ### PlanCase 操作
 * - insertPlanCase(record): Promise<PlanCaseRecord>
 *   插入一条规划案例
 *
 * - getPlanCaseById(caseId): Promise<PlanCaseRecord | null>
 *   按 caseId 查询单条规划案例
 *
 * - searchSimilarCases(inputText, options?): Promise<PlanCaseRecord[]>
 *   按关键词搜索相似的已确认规划案例，支持 limit/minScore 过滤
 *
 * - updatePlanCase(caseId, updates): Promise<PlanCaseRecord | null>
 *   更新规划案例（score, status, usedCount 等字段）
 *
 * - getRecentCases(options?): Promise<PlanCaseRecord[]>
 *   获取最近的规划案例，按 createdAt DESC 排序
 *
 * ### CapabilityProfile 操作
 * - upsertProfile(profile): Promise<CapabilityProfile>
 *   插入或更新 Agent 能力画像
 *
 * - getProfile(agentId, capability): Promise<CapabilityProfile | null>
 *   按 agentId + capability 查询画像
 *
 * - getRecentScores(agentId, capability, limit): Promise<number[]>
 *   获取 Agent 在某能力下最近的评分列表
 *
 * ### WorkSession 操作
 * - insertSession(record): Promise<WorkSessionRecord>
 *   插入一条工作会话记录
 *
 * - getSession(sessionId): Promise<WorkSessionRecord | null>
 *   按 sessionId 查询工作会话
 *
 * - updateSession(sessionId, updates): Promise<WorkSessionRecord | null>
 *   更新工作会话（title, conversationIds, keyOutputs, sharedContext, status 等字段）
 *
 * - listSessions(options?): Promise<WorkSessionRecord[]>
 *   列出工作会话，支持 limit/offset/status 过滤
 *
 * ## 设计原则
 * 1. 所有方法返回 Promise（即使是同步实现），保持接口一致
 * 2. 数据写入后返回冻结的不可变对象（与 model 层风格一致）
 * 3. 查询不到数据时返回 null 或空数组，不抛异常
 * 4. 存储层只负责持久化，不包含业务逻辑
 */

export const STORAGE_METHODS = [
  'init',
  'close',
  'insertFeedback',
  'getFeedbackById',
  'getFeedbacksByTaskId',
  'getFeedbacksByAgentId',
  'insertPlanCase',
  'getPlanCaseById',
  'searchSimilarCases',
  'updatePlanCase',
  'getRecentCases',
  'upsertProfile',
  'getProfile',
  'getRecentScores',
  'insertSession',
  'getSession',
  'updateSession',
  'listSessions'
]

/**
 * 运行时校验存储实例是否实现了所有接口方法
 *
 * @param {Object} store - 存储实例
 * @throws {Error} 缺少方法时抛出异常
 */
export function assertImplements(store) {
  const missing = STORAGE_METHODS.filter(method => typeof store[method] !== 'function')
  if (missing.length > 0) {
    throw new Error(`Storage instance missing methods: ${missing.join(', ')}`)
  }
}
