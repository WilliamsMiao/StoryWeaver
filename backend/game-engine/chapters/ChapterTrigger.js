/**
 * 章节触发器
 * 检查各种条件，决定是否应该开始新章节
 */
export class ChapterTrigger {
  constructor(options = {}) {
    // 触发条件配置
    this.triggers = {
      wordCount: options.wordCount || 2500,           // 字数阈值
      timeElapsed: options.timeElapsed || 30,         // 分钟阈值
      keyEvents: options.keyEvents || 3,               // 关键事件数量
      playerInactivity: options.playerInactivity || 10, // 玩家不活跃分钟数
      messageCount: options.messageCount || 15,        // 消息数量阈值
      enableAutoTrigger: options.enableAutoTrigger !== false // 是否启用自动触发
    };
    
    // 跟踪当前章节状态
    this.currentChapterStartTime = null;
    this.currentChapterWordCount = 0;
    this.currentChapterKeyEvents = 0;
    this.lastPlayerActivity = null;
    this.currentChapterMessages = 0;
  }
  
  /**
   * 检查是否应该触发新章节
   * @param {Object} story - 游戏故事对象
   * @param {Object} context - 上下文信息
   * @returns {Object} { shouldTrigger: boolean, reason: string, priority: number }
   */
  shouldTriggerNewChapter(story, context = {}) {
    if (!this.triggers.enableAutoTrigger) {
      return { shouldTrigger: false, reason: '自动触发已禁用', priority: 0 };
    }
    
    const currentChapter = this.getCurrentChapter(story);
    if (!currentChapter) {
      return { shouldTrigger: false, reason: '没有当前章节', priority: 0 };
    }
    
    // 更新当前章节状态
    this.updateChapterState(story, currentChapter, context);
    
    const checks = [
      this.checkWordCount(currentChapter),
      this.checkTimeElapsed(),
      this.checkKeyEvents(currentChapter),
      this.checkPlayerInactivity(),
      this.checkMessageCount()
    ];
    
    // 找到优先级最高的触发原因
    const triggered = checks.filter(c => c.shouldTrigger);
    
    if (triggered.length > 0) {
      // 按优先级排序，返回最高优先级的
      triggered.sort((a, b) => b.priority - a.priority);
      return triggered[0];
    }
    
    return { shouldTrigger: false, reason: '未满足触发条件', priority: 0 };
  }
  
  /**
   * 检查字数阈值
   */
  checkWordCount(chapter) {
    const wordCount = chapter.wordCount || this.currentChapterWordCount;
    const shouldTrigger = wordCount >= this.triggers.wordCount;
    
    return {
      shouldTrigger,
      reason: shouldTrigger ? `字数达到阈值 (${wordCount}/${this.triggers.wordCount})` : '',
      priority: shouldTrigger ? 5 : 0
    };
  }
  
  /**
   * 检查时间阈值
   */
  checkTimeElapsed() {
    if (!this.currentChapterStartTime) {
      return { shouldTrigger: false, reason: '', priority: 0 };
    }
    
    const elapsed = (Date.now() - this.currentChapterStartTime) / (1000 * 60); // 分钟
    const shouldTrigger = elapsed >= this.triggers.timeElapsed;
    
    return {
      shouldTrigger,
      reason: shouldTrigger ? `时间达到阈值 (${Math.floor(elapsed)}/${this.triggers.timeElapsed}分钟)` : '',
      priority: shouldTrigger ? 3 : 0
    };
  }
  
  /**
   * 检查关键事件数量
   */
  checkKeyEvents(chapter) {
    const keyEvents = chapter.keyEvents?.length || this.currentChapterKeyEvents;
    const shouldTrigger = keyEvents >= this.triggers.keyEvents;
    
    return {
      shouldTrigger,
      reason: shouldTrigger ? `关键事件达到阈值 (${keyEvents}/${this.triggers.keyEvents})` : '',
      priority: shouldTrigger ? 4 : 0
    };
  }
  
  /**
   * 检查玩家不活跃时间
   */
  checkPlayerInactivity() {
    if (!this.lastPlayerActivity) {
      return { shouldTrigger: false, reason: '', priority: 0 };
    }
    
    const inactivity = (Date.now() - this.lastPlayerActivity) / (1000 * 60); // 分钟
    const shouldTrigger = inactivity >= this.triggers.playerInactivity;
    
    return {
      shouldTrigger,
      reason: shouldTrigger ? `玩家不活跃时间达到阈值 (${Math.floor(inactivity)}/${this.triggers.playerInactivity}分钟)` : '',
      priority: shouldTrigger ? 2 : 0
    };
  }
  
  /**
   * 检查消息数量
   */
  checkMessageCount() {
    const shouldTrigger = this.currentChapterMessages >= this.triggers.messageCount;
    
    return {
      shouldTrigger,
      reason: shouldTrigger ? `消息数量达到阈值 (${this.currentChapterMessages}/${this.triggers.messageCount})` : '',
      priority: shouldTrigger ? 3 : 0
    };
  }
  
  /**
   * 获取当前章节
   */
  getCurrentChapter(story) {
    if (!story || !story.chapters || story.chapters.length === 0) {
      return null;
    }
    
    // 找到未完成的章节
    const activeChapter = story.chapters.find(ch => 
      ch.status === 'active' || ch.status === 'draft' || !ch.endTime
    );
    
    return activeChapter || story.chapters[story.chapters.length - 1];
  }
  
  /**
   * 更新章节状态
   */
  updateChapterState(story, chapter, context) {
    // 更新字数
    if (chapter.content) {
      this.currentChapterWordCount = chapter.content.length;
    }
    
    // 更新关键事件数
    if (chapter.keyEvents) {
      this.currentChapterKeyEvents = chapter.keyEvents.length;
    }
    
    // 更新开始时间
    if (chapter.startTime && !this.currentChapterStartTime) {
      this.currentChapterStartTime = new Date(chapter.startTime).getTime();
    }
    
    // 更新消息数
    if (chapter.messages) {
      this.currentChapterMessages = chapter.messages.length;
    }
    
    // 更新玩家活动时间
    if (context.lastPlayerActivity) {
      this.lastPlayerActivity = new Date(context.lastPlayerActivity).getTime();
    } else if (context.playerMessage) {
      this.lastPlayerActivity = Date.now();
    }
  }
  
  /**
   * 重置章节状态（新章节开始时调用）
   */
  resetChapterState() {
    this.currentChapterStartTime = Date.now();
    this.currentChapterWordCount = 0;
    this.currentChapterKeyEvents = 0;
    this.currentChapterMessages = 0;
    this.lastPlayerActivity = Date.now();
  }
  
  /**
   * 记录玩家活动
   */
  recordPlayerActivity() {
    this.lastPlayerActivity = Date.now();
    this.currentChapterMessages++;
  }
  
  /**
   * 记录关键事件
   */
  recordKeyEvent() {
    this.currentChapterKeyEvents++;
  }
  
  /**
   * 更新配置
   */
  updateTriggers(newTriggers) {
    this.triggers = { ...this.triggers, ...newTriggers };
  }
  
  /**
   * 获取当前状态
   */
  getState() {
    return {
      wordCount: this.currentChapterWordCount,
      timeElapsed: this.currentChapterStartTime 
        ? (Date.now() - this.currentChapterStartTime) / (1000 * 60)
        : 0,
      keyEvents: this.currentChapterKeyEvents,
      messages: this.currentChapterMessages,
      playerInactivity: this.lastPlayerActivity
        ? (Date.now() - this.lastPlayerActivity) / (1000 * 60)
        : 0
    };
  }
}

export default ChapterTrigger;

