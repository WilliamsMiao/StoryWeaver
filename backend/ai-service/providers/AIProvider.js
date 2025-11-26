/**
 * AI提供商基类
 * 定义所有AI提供商必须实现的标准接口
 */
export class AIProvider {
  constructor(config = {}) {
    this.config = config;
    this.name = 'BaseProvider';
  }
  
  /**
   * 生成故事响应
   * @param {Object} context - 故事上下文
   * @param {string} context.background - 故事背景
   * @param {Array} context.shortTermMemories - 短期记忆（最近交互）
   * @param {Array} context.chapterMemories - 章节记忆（章节摘要）
   * @param {Array} context.longTermMemories - 长期记忆（关键事件、角色关系）
   * @param {Array} context.players - 玩家列表及其最近互动
   * @param {Array} context.recentChapters - 最近章节内容
   * @param {string} playerInput - 玩家输入
   * @returns {Promise<Object>} { content: string, model: string, tokens: number }
   */
  async generateStoryResponse(context, playerInput) {
    throw new Error('generateStoryResponse must be implemented by subclass');
  }
  
  /**
   * 总结章节内容
   * @param {string} chapterContent - 章节内容
   * @returns {Promise<string>} 章节摘要
   */
  async summarizeChapter(chapterContent) {
    throw new Error('summarizeChapter must be implemented by subclass');
  }
  
  /**
   * 生成故事结局
   * @param {Object} storyContext - 完整故事上下文
   * @returns {Promise<string>} 故事结局内容
   */
  async generateEnding(storyContext) {
    throw new Error('generateEnding must be implemented by subclass');
  }
  
  /**
   * 构建提示词（由子类实现具体逻辑）
   * @param {Object} context - 上下文
   * @param {string} playerInput - 玩家输入
   * @param {string} taskType - 任务类型 (story, summary, ending)
   * @returns {Array} 消息数组 [{ role: string, content: string }]
   */
  buildPrompt(context, playerInput, taskType = 'story') {
    throw new Error('buildPrompt must be implemented by subclass');
  }
  
  /**
   * 处理上下文窗口限制
   * @param {Array} messages - 消息数组
   * @param {number} maxTokens - 最大token数
   * @returns {Array} 处理后的消息数组
   */
  truncateContext(messages, maxTokens = 8000) {
    // 默认实现：简单截断，子类可以覆盖
    return messages;
  }

  /**
   * 检查提供商可用性
   * @returns {Promise<{available: boolean, reason?: string}>}
   */
  async checkAvailability() {
    return { available: true };
  }
}

