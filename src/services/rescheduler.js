/**
 * TaskRescheduler — 任务重调度器
 *
 * 订阅 agent.offline 事件，当 Agent 下线时自动重新分配其执行中的任务。
 * 确保任务在 Agent 故障时能够自动转移到健康的 Agent 上继续执行。
 */

import config from '../config.js'

export class TaskRescheduler {
  /** @type {import('../core/waggle.js').Waggle} */
  #waggle

  /** @type {import('./executor.js').Executor} */
  #executor

  /** @type {import('../core/scheduler.js').Scheduler} */
  #scheduler

  /** @type {Object} */
  #logger

  /** @type {boolean} */
  #started = false

  /** @type {Function|null} 取消订阅的函数 */
  #unsubscribe = null

  /**
   * @param {Object} options
   * @param {import('../core/waggle.js').Waggle} options.waggle
   * @param {import('./executor.js').Executor} options.executor
   * @param {import('../core/scheduler.js').Scheduler} options.scheduler
   * @param {Object} options.logger
   */
  constructor({ waggle, executor, scheduler, logger }) {
    this.#waggle = waggle
    this.#executor = executor
    this.#scheduler = scheduler
    this.#logger = logger
  }

  /**
   * 启动监听
   * 订阅 Waggle 的 agent.offline 事件
   */
  start() {
    if (this.#started) {
      this.#logger.warn('TaskRescheduler already started')
      return
    }

    // 订阅 agent.offline 事件
    this.#unsubscribe = this.#waggle.subscribe('agent.offline', async (event) => {
      await this.#handleAgentOffline(event)
    })

    this.#started = true
    this.#logger.info('TaskRescheduler started')
  }

  /**
   * 停止监听
   */
  stop() {
    if (!this.#started) {
      return
    }

    if (this.#unsubscribe) {
      this.#unsubscribe()
      this.#unsubscribe = null
    }

    this.#started = false
    this.#logger.info('TaskRescheduler stopped')
  }

  /**
   * 处理 Agent 下线事件
   *
   * @param {Object} event - { type: 'agent.offline', agentId, timestamp }
   */
  async #handleAgentOffline(event) {
    const { agentId } = event

    this.#logger.info({ agentId }, 'Agent offline, checking for affected tasks')

    // 获取该 Agent 执行中的任务
    const affectedTasks = this.#executor.getTasksByAgent(agentId)

    if (affectedTasks.length === 0) {
      this.#logger.debug({ agentId }, 'No affected tasks found')
      return
    }

    this.#logger.info({ agentId, taskCount: affectedTasks.length }, 'Rescheduling affected tasks')

    // 重新执行每个任务
    for (const task of affectedTasks) {
      await this.#rescheduleTask(task)
    }
  }

  /**
   * 重新执行任务
   *
   * 策略：将任务状态重置为 pending，然后调用 executor.run() 重新执行。
   * 对于串行任务，重新执行失败的步骤；对于并行任务，重新执行所有失败的分片。
   *
   * @param {import('../models/task.js').TaskRecord} task
   */
  async #rescheduleTask(task) {
    this.#logger.info({ taskId: task.taskId, strategy: task.strategy }, 'Rescheduling task')

    try {
      // 重置任务状态为 pending，保留原有步骤定义
      const resetTask = Object.freeze({
        ...task,
        status: 'pending',
        results: [],
        startedAt: undefined,
        finishedAt: undefined
      })

      // 重新执行任务
      const result = await this.#executor.run(resetTask)

      this.#logger.info({
        taskId: task.taskId,
        newStatus: result.status,
        resultsCount: result.results.length
      }, 'Task rescheduled successfully')

    } catch (err) {
      this.#logger.error({ taskId: task.taskId, err }, 'Failed to reschedule task')
    }
  }
}
