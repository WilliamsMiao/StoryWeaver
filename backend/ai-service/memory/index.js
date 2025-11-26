/**
 * 智能记忆管理系统
 * 统一导出所有记忆管理模块
 */

import ShortTermMemory from './ShortTermMemory.js';
import ChapterSummarizer from './ChapterSummarizer.js';
import LongTermMemory from './LongTermMemory.js';
import MemoryRetrieval from './MemoryRetrieval.js';
import MemoryManager from './MemoryManager.js';

export {
  ShortTermMemory,
  ChapterSummarizer,
  LongTermMemory,
  MemoryRetrieval,
  MemoryManager
};

/**
 * 创建完整的记忆管理系统实例
 * @param {string} storyId - 故事ID
 * @param {Object} options - 配置选项
 * @returns {MemoryRetrieval} 记忆召回系统实例
 */
export function createMemorySystem(storyId, options = {}) {
  return new MemoryRetrieval(storyId, options);
}

export default {
  ShortTermMemory,
  ChapterSummarizer,
  LongTermMemory,
  MemoryRetrieval,
  MemoryManager,
  createMemorySystem
};

