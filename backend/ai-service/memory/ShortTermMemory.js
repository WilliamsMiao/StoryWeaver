/**
 * 短期记忆管理器
 * 维护最近10-15条玩家-AI交互，自动淘汰旧消息，保留重要对话
 */
import { v4 as uuidv4 } from 'uuid';
import database from '../../storage/database.js';

export class ShortTermMemory {
  constructor(storyId, options = {}) {
    this.storyId = storyId;
    this.maxSize = options.maxSize || 15; // 最大保留数量
    this.minSize = options.minSize || 10; // 最小保留数量
    this.interactions = []; // 内存中的交互列表
    this.importanceThreshold = options.importanceThreshold || 0.5; // 重要性阈值
  }
  
  /**
   * 添加交互记录
   * @param {string} playerInput - 玩家输入
   * @param {string} aiResponse - AI响应
   * @param {string} playerId - 玩家ID
   * @param {string} playerName - 玩家名称
   * @returns {Promise<Object>} 交互记录
   */
  async addInteraction(playerInput, aiResponse, playerId, playerName) {
    const interactionId = uuidv4();
    
    // 计算重要性分数
    const importance = this.calculateImportance(playerInput, aiResponse);
    
    const interaction = {
      id: interactionId,
      storyId: this.storyId,
      playerId,
      playerName,
      input: playerInput,
      response: aiResponse,
      importance,
      timestamp: new Date(),
      keywords: this.extractKeywords(playerInput + ' ' + aiResponse)
    };
    
    // 保存到数据库
    await database.createInteraction(
      interactionId,
      this.storyId,
      playerId,
      playerName,
      playerInput,
      aiResponse
    );
    
    // 添加到内存
    this.interactions.push(interaction);
    
    // 如果超过最大数量，进行压缩和淘汰
    if (this.interactions.length > this.maxSize) {
      await this.compressAndPrune();
    }
    
    return interaction;
  }
  
  /**
   * 计算交互的重要性分数
   * @param {string} input - 玩家输入
   * @param {string} response - AI响应
   * @returns {number} 重要性分数 0-1
   */
  calculateImportance(input, response) {
    let score = 0.5; // 基础分数
    
    // 关键词权重
    const importantKeywords = [
      '发现', '决定', '承诺', '秘密', '计划', '行动',
      '名字', '角色', '人物', '关系', '感情',
      '地点', '世界', '规则', '魔法', '设定'
    ];
    
    const text = (input + ' ' + response).toLowerCase();
    
    // 检查重要关键词
    importantKeywords.forEach(keyword => {
      if (text.includes(keyword)) {
        score += 0.1;
      }
    });
    
    // 长度权重（较长的交互可能更重要）
    const totalLength = input.length + response.length;
    if (totalLength > 500) score += 0.1;
    if (totalLength > 1000) score += 0.1;
    
    // 问题标记（包含问号的交互可能更重要）
    if (input.includes('?') || input.includes('？')) {
      score += 0.1;
    }
    
    return Math.min(1, score);
  }
  
  /**
   * 提取关键词
   * @param {string} text - 文本
   * @returns {Array<string>} 关键词列表
   */
  extractKeywords(text) {
    // 简单的关键词提取（可以后续优化为更智能的NLP方法）
    const words = text
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1);
    
    // 过滤常见词
    const stopWords = ['的', '了', '在', '是', '我', '你', '他', '她', '它', 'the', 'a', 'an', 'is', 'are'];
    const keywords = words.filter(w => !stopWords.includes(w.toLowerCase()));
    
    // 返回前10个关键词
    return keywords.slice(0, 10);
  }
  
  /**
   * 压缩和淘汰旧消息
   * 保留高重要性消息，压缩低重要性消息
   */
  async compressAndPrune() {
    if (this.interactions.length <= this.minSize) {
      return;
    }
    
    // 按重要性排序
    this.interactions.sort((a, b) => b.importance - a.importance);
    
    // 保留高重要性消息
    const important = this.interactions.slice(0, this.minSize);
    
    // 需要压缩的消息
    const toCompress = this.interactions.slice(this.minSize);
    
    // 压缩低重要性消息
    if (toCompress.length > 0) {
      const compressed = await this.compressInteractions(toCompress);
      
      // 如果压缩后仍然重要，保留压缩版本
      if (compressed && compressed.importance > this.importanceThreshold) {
        important.push(compressed);
      }
    }
    
    // 更新内存
    this.interactions = important.sort((a, b) => 
      new Date(a.timestamp) - new Date(b.timestamp)
    );
  }
  
  /**
   * 压缩多个交互为一个摘要
   * @param {Array} interactions - 要压缩的交互列表
   * @returns {Promise<Object>} 压缩后的交互
   */
  async compressInteractions(interactions) {
    // 简单的压缩：合并关键词和重要信息
    const allKeywords = new Set();
    const importantPhrases = [];
    
    interactions.forEach(interaction => {
      interaction.keywords.forEach(kw => allKeywords.add(kw));
      
      // 提取重要短语（包含关键词的句子）
      const sentences = (interaction.input + ' ' + interaction.response)
        .split(/[。！？]/)
        .filter(s => {
          const keywords = ['发现', '决定', '秘密', '关系', '设定'];
          return keywords.some(kw => s.includes(kw));
        });
      
      importantPhrases.push(...sentences.slice(0, 2));
    });
    
    return {
      id: `compressed_${Date.now()}`,
      storyId: this.storyId,
      playerId: 'system',
      playerName: '系统',
      input: `[压缩摘要] ${importantPhrases.slice(0, 3).join('；')}`,
      response: `[包含 ${interactions.length} 条交互的摘要]`,
      importance: interactions.reduce((sum, i) => sum + i.importance, 0) / interactions.length,
      timestamp: interactions[0].timestamp,
      keywords: Array.from(allKeywords).slice(0, 10),
      compressed: true,
      originalCount: interactions.length
    };
  }
  
  /**
   * 获取最近的交互（用于AI上下文）
   * @param {number} limit - 数量限制
   * @returns {Array} 交互列表
   */
  getRecentInteractions(limit = 10) {
    return this.interactions
      .slice(-limit)
      .map(i => ({
        playerName: i.playerName,
        input: i.input,
        response: i.response,
        timestamp: i.timestamp
      }));
  }
  
  /**
   * 从数据库加载交互历史
   */
  async loadFromDatabase() {
    const interactions = await database.getInteractions(this.storyId, this.maxSize * 2);
    
    this.interactions = interactions.map(i => ({
      id: i.id,
      storyId: i.story_id,
      playerId: i.player_id,
      playerName: i.player_name,
      input: i.input,
      response: i.response,
      importance: this.calculateImportance(i.input, i.response || ''),
      timestamp: new Date(i.created_at),
      keywords: this.extractKeywords(i.input + ' ' + (i.response || ''))
    }));
    
    // 按时间排序
    this.interactions.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    // 如果超过最大数量，进行压缩
    if (this.interactions.length > this.maxSize) {
      await this.compressAndPrune();
    }
  }
  
  /**
   * 清空短期记忆
   */
  clear() {
    this.interactions = [];
  }
  
  /**
   * 获取统计信息
   */
  getStats() {
    return {
      totalInteractions: this.interactions.length,
      averageImportance: this.interactions.length > 0
        ? this.interactions.reduce((sum, i) => sum + i.importance, 0) / this.interactions.length
        : 0,
      oldestTimestamp: this.interactions.length > 0
        ? this.interactions[0].timestamp
        : null,
      newestTimestamp: this.interactions.length > 0
        ? this.interactions[this.interactions.length - 1].timestamp
        : null
    };
  }
}

export default ShortTermMemory;

