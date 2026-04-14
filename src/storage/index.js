/**
 * Storage 工厂函数
 *
 * 根据配置创建对应的存储后端实例。
 * 支持 memory 和 sqlite 两种后端。
 */

import { MemoryStore } from './memory-store.js'
import { SQLiteStore } from './sqlite-store.js'

/**
 * 创建存储实例
 *
 * @param {Object} options
 * @param {'memory'|'sqlite'} options.backend - 存储后端类型
 * @param {string} [options.path] - SQLite 数据库文件路径（sqlite 后端必填）
 * @returns {import('./memory-store.js').MemoryStore | import('./sqlite-store.js').SQLiteStore}
 */
export function createStorage({ backend = 'memory', path } = {}) {
  switch (backend) {
    case 'memory':
      return new MemoryStore()
    case 'sqlite':
      if (!path) {
        throw new Error('SQLite storage requires a "path" option')
      }
      return new SQLiteStore({ path })
    default:
      throw new Error(`Unknown storage backend: "${backend}". Supported: memory, sqlite`)
  }
}
