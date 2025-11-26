/**
 * 记忆召回系统
 * 基于相关性召回历史记忆，智能选择注入AI提示词的记忆内容
 * 处理token限制，优化上下文使用
 */
import ShortTermMemory from './ShortTermMemory.js';
import ChapterSummarizer from './ChapterSummarizer.js';
import LongTermMemory from './LongTermMemory.js';

export class MemoryRetrieval {
  constructor(storyId, options = {}) {
    this.storyId = storyId;
    this.maxTokens = options.maxTokens || 4000; // 最大token数（用于上下文）
    this.estimatedCharsPerToken = options.charsPerToken || 3; // 中文字符与token的估算比例
    this.shortTermMemory = new ShortTermMemory(storyId);
    this.chapterSummarizer = new ChapterSummarizer(storyId);
    this.longTermMemory = new LongTermMemory(storyId);
  }
  
  /**
   * 获取相关记忆
   * @param {string} currentTopic - 当前话题
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 记忆上下文
   */
  async getRelevantMemories(currentTopic, options = {}) {
    const {
      shortTermLimit = 10,
      chapterLimit = 5,
      longTermLimit = 15,
      maxContextLength = this.maxTokens * this.estimatedCharsPerToken
    } = options;
    
    // 加载所有记忆
    await this.loadAllMemories();
    
    // 获取短期记忆
    const shortTerm = this.shortTermMemory.getRecentInteractions(shortTermLimit);
    
    // 获取章节摘要
    const chapterSummaries = this.chapterSummarizer.getChapterSummaries(chapterLimit);
    
    // 获取长期记忆
    const longTerm = this.longTermMemory.getLongTermMemories(longTermLimit);
    
    // 基于相关性筛选和排序
    const relevantMemories = {
      shortTerm: this.rankByRelevance(shortTerm, currentTopic),
      chapters: this.rankByRelevance(chapterSummaries, currentTopic),
      keyEvents: this.rankByRelevance(longTerm.keyEvents, currentTopic),
      characterRelations: this.filterRelevantRelations(longTerm.characterRelations, currentTopic),
      themes: longTerm.storyThemes,
      worldSettings: longTerm.worldSettings
    };
    
    // 压缩记忆以适应token限制
    const compressed = await this.compressMemory({
      memories: relevantMemories,
      currentTopic,
      maxLength: maxContextLength
    });
    
    return compressed;
  }
  
  /**
   * 基于相关性排序
   * @param {Array} items - 项目列表
   * @param {string} topic - 当前话题
   * @returns {Array} 排序后的列表
   */
  rankByRelevance(items, topic) {
    if (!topic || !items || items.length === 0) {
      return items;
    }
    
    const topicKeywords = this.extractKeywords(topic);
    
    return items
      .map(item => {
        const content = item.content || item.summary || item.event || JSON.stringify(item);
        const keywords = this.extractKeywords(content);
        const relevance = this.calculateRelevanceScore(topicKeywords, keywords);
        return { ...item, relevance };
      })
      .sort((a, b) => b.relevance - a.relevance);
  }
  
  /**
   * 过滤相关角色关系
   * @param {Array} relations - 关系列表
   * @param {string} topic - 当前话题
   * @returns {Array} 过滤后的关系
   */
  filterRelevantRelations(relations, topic) {
    if (!topic || !relations || relations.length === 0) {
      return relations.slice(0, 5); // 返回前5个
    }
    
    const topicKeywords = this.extractKeywords(topic);
    
    return relations
      .map(rel => {
        const content = `${rel.character1} ${rel.character2} ${rel.reason || ''}`;
        const keywords = this.extractKeywords(content);
        const relevance = this.calculateRelevanceScore(topicKeywords, keywords);
        return { ...rel, relevance };
      })
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 5);
  }
  
  /**
   * 提取关键词
   * @param {string} text - 文本
   * @returns {Set<string>} 关键词集合
   */
  extractKeywords(text) {
    const words = text
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1);
    
    const stopWords = new Set(['的', '了', '在', '是', '我', '你', '他', '她', '它', 'the', 'a', 'an', 'is', 'are']);
    return new Set(words.filter(w => !stopWords.has(w.toLowerCase())));
  }
  
  /**
   * 计算相关性分数
   * @param {Set<string>} topicKeywords - 话题关键词
   * @param {Set<string>} itemKeywords - 项目关键词
   * @returns {number} 相关性分数 0-1
   */
  calculateRelevanceScore(topicKeywords, itemKeywords) {
    if (topicKeywords.size === 0 || itemKeywords.size === 0) {
      return 0.5; // 默认中等相关性
    }
    
    const intersection = new Set([...topicKeywords].filter(x => itemKeywords.has(x)));
    const union = new Set([...topicKeywords, ...itemKeywords]);
    
    // Jaccard相似度
    const jaccard = intersection.size / union.size;
    
    // 关键词匹配度
    const matchRatio = intersection.size / topicKeywords.size;
    
    // 综合分数
    return (jaccard * 0.6 + matchRatio * 0.4);
  }
  
  /**
   * 压缩记忆以适应token限制
   * @param {Object} context - 当前上下文
   * @returns {Promise<Object>} 压缩后的记忆
   */
  async compressMemory(context) {
    const { memories, currentTopic, maxLength } = context;
    
    // 构建完整上下文字符串
    let fullContext = this.buildContextString(memories);
    
    // 如果超过限制，进行压缩
    if (fullContext.length > maxLength) {
      // 优先保留高相关性内容
      const compressed = {
        shortTerm: this.compressShortTerm(memories.shortTerm, maxLength * 0.3),
        chapters: this.compressChapters(memories.chapters, maxLength * 0.3),
        keyEvents: this.compressEvents(memories.keyEvents, maxLength * 0.2),
        characterRelations: memories.characterRelations.slice(0, 3),
        themes: memories.themes.slice(0, 3),
        worldSettings: memories.worldSettings.slice(0, 3)
      };
      
      return compressed;
    }
    
    return memories;
  }
  
  /**
   * 构建上下文字符串
   * @param {Object} memories - 记忆对象
   * @returns {string} 上下文字符串
   */
  buildContextString(memories) {
    const parts = [];
    
    // 短期记忆
    if (memories.shortTerm && memories.shortTerm.length > 0) {
      parts.push('## 最近交互\n');
      memories.shortTerm.forEach(m => {
        parts.push(`${m.playerName}: ${m.input}\nAI: ${m.response}\n`);
      });
    }
    
    // 章节摘要
    if (memories.chapters && memories.chapters.length > 0) {
      parts.push('## 章节摘要\n');
      memories.chapters.forEach(ch => {
        parts.push(`第${ch.chapterNumber}章: ${ch.summary}\n`);
      });
    }
    
    // 关键事件
    if (memories.keyEvents && memories.keyEvents.length > 0) {
      parts.push('## 关键事件\n');
      memories.keyEvents.forEach(e => {
        parts.push(`- ${e.event || e.content}\n`);
      });
    }
    
    // 角色关系
    if (memories.characterRelations && memories.characterRelations.length > 0) {
      parts.push('## 角色关系\n');
      memories.characterRelations.forEach(r => {
        parts.push(`${r.character1} ↔ ${r.character2}: ${r.relation}\n`);
      });
    }
    
    return parts.join('');
  }
  
  /**
   * 压缩短期记忆
   * @param {Array} shortTerm - 短期记忆列表
   * @param {number} maxLength - 最大长度
   * @returns {Array} 压缩后的列表
   */
  compressShortTerm(shortTerm, maxLength) {
    if (!shortTerm || shortTerm.length === 0) return [];
    
    // 按相关性排序，取前N个
    const sorted = shortTerm.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
    
    let totalLength = 0;
    const compressed = [];
    
    for (const item of sorted) {
      const itemLength = (item.input?.length || 0) + (item.response?.length || 0);
      if (totalLength + itemLength <= maxLength) {
        compressed.push(item);
        totalLength += itemLength;
      } else {
        break;
      }
    }
    
    return compressed;
  }
  
  /**
   * 压缩章节摘要
   * @param {Array} chapters - 章节列表
   * @param {number} maxLength - 最大长度
   * @returns {Array} 压缩后的列表
   */
  compressChapters(chapters, maxLength) {
    if (!chapters || chapters.length === 0) return [];
    
    const sorted = chapters.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
    
    let totalLength = 0;
    const compressed = [];
    
    for (const ch of sorted) {
      const itemLength = (ch.summary?.length || 0);
      if (totalLength + itemLength <= maxLength) {
        compressed.push(ch);
        totalLength += itemLength;
      } else {
        // 如果摘要太长，截断
        if (ch.summary && ch.summary.length > 100) {
          compressed.push({
            ...ch,
            summary: ch.summary.substring(0, 100) + '...'
          });
        }
        break;
      }
    }
    
    return compressed;
  }
  
  /**
   * 压缩关键事件
   * @param {Array} events - 事件列表
   * @param {number} maxLength - 最大长度
   * @returns {Array} 压缩后的列表
   */
  compressEvents(events, maxLength) {
    if (!events || events.length === 0) return [];
    
    // 按重要性排序
    const sorted = events.sort((a, b) => {
      const importanceDiff = (b.importance || 0) - (a.importance || 0);
      if (importanceDiff !== 0) return importanceDiff;
      return (b.relevance || 0) - (a.relevance || 0);
    });
    
    let totalLength = 0;
    const compressed = [];
    
    for (const event of sorted) {
      const itemLength = (event.event || event.content || '').length;
      if (totalLength + itemLength <= maxLength) {
        compressed.push(event);
        totalLength += itemLength;
      } else {
        break;
      }
    }
    
    return compressed;
  }
  
  /**
   * 加载所有记忆
   */
  async loadAllMemories() {
    await Promise.all([
      this.shortTermMemory.loadFromDatabase(),
      this.chapterSummarizer.loadFromDatabase(),
      this.longTermMemory.loadFromDatabase()
    ]);
  }
  
  /**
   * 添加交互（委托给短期记忆）
   */
  async addInteraction(playerInput, aiResponse, playerId, playerName) {
    return await this.shortTermMemory.addInteraction(
      playerInput,
      aiResponse,
      playerId,
      playerName
    );
  }
  
  /**
   * 触发章节总结（委托给章节总结器）
   */
  async triggerChapterSummary(chapter) {
    return await this.chapterSummarizer.triggerChapterSummary(chapter);
  }
}

export default MemoryRetrieval;

