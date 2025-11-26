/**
 * 章节管理模块
 * 统一导出所有章节管理相关类
 */

import ChapterTrigger from './ChapterTrigger.js';
import ChapterTransition from './ChapterTransition.js';
import ChapterHistory from './ChapterHistory.js';
import RandomEventGenerator from './RandomEventGenerator.js';

export {
  ChapterTrigger,
  ChapterTransition,
  ChapterHistory,
  RandomEventGenerator
};

/**
 * 创建完整的章节管理系统
 * @param {string} storyId - 故事ID
 * @param {Object} options - 配置选项
 * @returns {Object} 章节管理系统实例
 */
export function createChapterManager(storyId, options = {}) {
  const trigger = new ChapterTrigger(options.trigger || {});
  const transition = new ChapterTransition(storyId, options.transition || {});
  const history = new ChapterHistory(storyId);
  const randomEvents = new RandomEventGenerator(options.randomEvents || {});
  
  return {
    trigger,
    transition,
    history,
    randomEvents,
    
    /**
     * 检查并执行章节过渡
     */
    async checkAndTransition(story, context = {}) {
      const shouldTrigger = trigger.shouldTriggerNewChapter(story, context);
      
      if (shouldTrigger.shouldTrigger) {
        const currentChapter = trigger.getCurrentChapter(story);
        if (currentChapter) {
          const result = await transition.transitionToNewChapter(
            currentChapter,
            story,
            context
          );
          
          // 重置触发器状态
          trigger.resetChapterState();
          
          return {
            triggered: true,
            reason: shouldTrigger.reason,
            ...result
          };
        }
      }
      
      return {
        triggered: false,
        reason: shouldTrigger.reason
      };
    },
    
    /**
     * 手动触发章节分割
     */
    async manualChapterSplit(story, context = {}) {
      const currentChapter = trigger.getCurrentChapter(story);
      if (!currentChapter) {
        throw new Error('没有当前章节');
      }
      
      const result = await transition.transitionToNewChapter(
        currentChapter,
        story,
        { ...context, manual: true }
      );
      
      trigger.resetChapterState();
      
      return result;
    }
  };
}

export default {
  ChapterTrigger,
  ChapterTransition,
  ChapterHistory,
  RandomEventGenerator,
  createChapterManager
};

