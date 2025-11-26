/**
 * 章节总结引擎
 * 触发条件监测：字数 > 2000 或 关键事件发生
 * 调用AI生成章节总结，提取核心剧情
 */
import AIService from '../AIService.js';
import database from '../../storage/database.js';

export class ChapterSummarizer {
  constructor(storyId, options = {}) {
    this.storyId = storyId;
    this.wordThreshold = options.wordThreshold || 2000; // 字数阈值
    this.keyEventKeywords = options.keyEventKeywords || [
      '发现', '决定', '承诺', '秘密', '背叛', '死亡',
      '爱情', '战斗', '胜利', '失败', '转折', '真相'
    ];
    this.summaries = []; // 缓存的摘要
  }
  
  /**
   * 检查是否应该触发章节总结
   * @param {Object} chapter - 章节对象
   * @returns {boolean} 是否应该总结
   */
  shouldTriggerSummary(chapter) {
    // 检查字数
    if (chapter.wordCount >= this.wordThreshold) {
      return true;
    }
    
    // 检查关键事件
    const content = chapter.content || '';
    const hasKeyEvent = this.keyEventKeywords.some(keyword => 
      content.includes(keyword)
    );
    
    if (hasKeyEvent) {
      return true;
    }
    
    // 检查章节数量（每5章总结一次）
    if (chapter.number > 0 && chapter.number % 5 === 0) {
      return true;
    }
    
    return false;
  }
  
  /**
   * 触发章节总结
   * @param {Object} chapter - 章节对象
   * @returns {Promise<Object>} 总结结果
   */
  async triggerChapterSummary(chapter) {
    if (!this.shouldTriggerSummary(chapter)) {
      return null;
    }
    
    try {
      // 调用AI生成章节总结
      const summary = await AIService.summarizeChapter(chapter.content);
      
      // 提取核心剧情点
      const keyPoints = await this.extractKeyPoints(chapter.content);
      
      // 更新数据库
      await database.updateChapterSummary(chapter.id, summary);
      
      const summaryData = {
        chapterId: chapter.id,
        chapterNumber: chapter.number,
        summary,
        keyPoints,
        wordCount: chapter.wordCount,
        createdAt: new Date()
      };
      
      // 缓存摘要
      this.summaries.push(summaryData);
      
      // 只保留最近20个摘要
      if (this.summaries.length > 20) {
        this.summaries = this.summaries.slice(-20);
      }
      
      return summaryData;
    } catch (error) {
      console.error('生成章节总结失败:', error);
      // 如果AI总结失败，使用简单摘要
      return this.generateSimpleSummary(chapter);
    }
  }
  
  /**
   * 提取核心剧情点
   * @param {string} content - 章节内容
   * @returns {Promise<Array<string>>} 关键点列表
   */
  async extractKeyPoints(content) {
    // 使用简单的规则提取关键点
    const keyPoints = [];
    const sentences = content.split(/[。！？]/).filter(s => s.trim().length > 10);
    
    // 查找包含关键事件的句子
    sentences.forEach(sentence => {
      const hasKeyEvent = this.keyEventKeywords.some(keyword => 
        sentence.includes(keyword)
      );
      
      if (hasKeyEvent) {
        keyPoints.push(sentence.trim());
      }
    });
    
    // 限制数量
    return keyPoints.slice(0, 5);
  }
  
  /**
   * 生成简单摘要（AI失败时的备用方案）
   * @param {Object} chapter - 章节对象
   * @returns {Object} 简单摘要
   */
  generateSimpleSummary(chapter) {
    const content = chapter.content || '';
    const sentences = content.split(/[。！？]/).filter(s => s.trim().length > 10);
    
    // 取前3句和后2句
    const summary = [
      ...sentences.slice(0, 3),
      '...',
      ...sentences.slice(-2)
    ].join('。');
    
    return {
      chapterId: chapter.id,
      chapterNumber: chapter.number,
      summary: summary.substring(0, 200) + '...',
      keyPoints: this.extractKeyPoints(content),
      wordCount: chapter.wordCount,
      createdAt: new Date(),
      simple: true
    };
  }
  
  /**
   * 批量总结章节
   * @param {Array} chapters - 章节列表
   * @returns {Promise<Array>} 总结列表
   */
  async summarizeChapters(chapters) {
    const summaries = [];
    
    for (const chapter of chapters) {
      // 如果章节还没有摘要，生成摘要
      if (!chapter.summary) {
        const summary = await this.triggerChapterSummary(chapter);
        if (summary) {
          summaries.push(summary);
        }
      } else {
        // 如果已有摘要，直接使用
        summaries.push({
          chapterId: chapter.id,
          chapterNumber: chapter.number,
          summary: chapter.summary,
          wordCount: chapter.wordCount
        });
      }
    }
    
    return summaries;
  }
  
  /**
   * 获取章节摘要（用于长期记忆）
   * @param {number} limit - 数量限制
   * @returns {Array} 摘要列表
   */
  getChapterSummaries(limit = 10) {
    return this.summaries
      .slice(-limit)
      .map(s => ({
        chapterNumber: s.chapterNumber,
        summary: s.summary,
        keyPoints: s.keyPoints || []
      }));
  }
  
  /**
   * 从数据库加载已有摘要
   */
  async loadFromDatabase() {
    const chapters = await database.getChapters(this.storyId);
    
    this.summaries = chapters
      .filter(ch => ch.summary)
      .map(ch => ({
        chapterId: ch.id,
        chapterNumber: ch.chapter_number,
        summary: ch.summary,
        wordCount: ch.content.length,
        createdAt: new Date(ch.created_at)
      }));
  }
}

export default ChapterSummarizer;

