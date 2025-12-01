/**
 * 记忆管理器
 * 管理短期、章节、长期三层记忆系统
 */
export class MemoryManager {
  constructor() {
    // 记忆类型常量
    this.MEMORY_TYPES = {
      SHORT_TERM: 'short_term',      // 短期记忆：最近交互
      CHAPTER: 'chapter',            // 章节记忆：章节摘要
      LONG_TERM: 'long_term',         // 长期记忆：关键事件、角色关系
      CHARACTER: 'character',         // 角色记忆
      EVENT: 'event',                 // 事件记忆
      WORLD: 'world'                  // 世界设定记忆
    };
  }
  
  /**
   * 获取短期记忆（最近N条交互）
   * @param {Array} interactions - 交互历史
   * @param {number} limit - 数量限制
   * @returns {Array} 短期记忆数组
   */
  getShortTermMemories(interactions, limit = 10) {
    if (!interactions || interactions.length === 0) {
      return [];
    }
    
    // 取最近N条交互
    const recent = interactions.slice(-limit);
    
    return recent.map(interaction => ({
      playerName: interaction.playerName || interaction.username,
      input: interaction.input || interaction.message,
      response: interaction.response || interaction.content,
      timestamp: interaction.timestamp || interaction.createdAt
    }));
  }
  
  /**
   * 获取章节记忆（章节摘要）
   * @param {Array} chapters - 章节列表
   * @returns {Array} 章节记忆数组
   */
  getChapterMemories(chapters) {
    if (!chapters || chapters.length === 0) {
      return [];
    }
    
    return chapters
      .filter(ch => ch.summary) // 只包含有摘要的章节
      .map(ch => ({
        chapterNumber: ch.chapterNumber,
        content: ch.summary,
        author: ch.authorId,
        createdAt: ch.createdAt
      }));
  }
  
  /**
   * 获取长期记忆（关键事件和角色关系）
   * @param {Array} memories - 所有记忆
   * @param {number} limit - 数量限制
   * @returns {Array} 长期记忆数组
   */
  getLongTermMemories(memories, limit = 20) {
    if (!memories || memories.length === 0) {
      return [];
    }
    
    // 按重要性排序，取前N条
    return memories
      .filter(m => 
        m.memoryType === this.MEMORY_TYPES.LONG_TERM ||
        m.memoryType === this.MEMORY_TYPES.CHARACTER ||
        m.memoryType === this.MEMORY_TYPES.EVENT ||
        m.memoryType === this.MEMORY_TYPES.WORLD
      )
      .sort((a, b) => {
        // 先按重要性排序
        if (b.importance !== a.importance) {
          return b.importance - a.importance;
        }
        // 再按时间排序（新的优先）
        return new Date(b.createdAt) - new Date(a.createdAt);
      })
      .slice(0, limit)
      .map(m => ({
        memoryType: m.memoryType,
        content: m.content,
        importance: m.importance,
        createdAt: m.createdAt
      }));
  }
  
  /**
   * 构建完整的记忆上下文
   * @param {Object} storyData - 故事数据
   * @param {Array} interactions - 交互历史
   * @param {Object} options - 选项
   * @returns {Object} 记忆上下文
   */
  buildMemoryContext(storyData, interactions = [], options = {}) {
    const {
      shortTermLimit = 10,
      chapterLimit = 5,
      longTermLimit = 20
    } = options;
    
    const shortTermMemories = this.getShortTermMemories(interactions, shortTermLimit);
    const chapterMemories = this.getChapterMemories(storyData.chapters || []);
    const longTermMemories = this.getLongTermMemories(storyData.memories || [], longTermLimit);
    
    return {
      shortTermMemories,
      chapterMemories: chapterMemories.slice(-chapterLimit), // 只取最近N章
      longTermMemories
    };
  }
  
  /**
   * 从内容中提取记忆
   * Optimized: Single pass through sentences, pre-compile patterns
   * @param {string} content - 内容
   * @param {Object} options - 选项
   * @returns {Array} 提取的记忆数组
   */
  extractMemories(content, options = {}) {
    const memories = [];
    const sentences = content.split(/[。！？]/).filter(s => s.trim().length > 5);
    
    // Pre-compiled keyword sets for faster lookup
    // Note: Only character, event, and world patterns are used for memory extraction
    const patterns = {
      character: new Set(['名字', '角色', '人物', '他', '她', '他们', '她们']),
      event: new Set(['发现', '决定', '承诺', '秘密', '计划', '行动']),
      world: new Set(['地点', '世界', '规则', '魔法', '设定', '环境'])
    };
    
    // Process all sentences in a single pass
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      let matched = false;
      
      // Check all patterns for this sentence
      for (const [patternType, keywords] of Object.entries(patterns)) {
        for (const keyword of keywords) {
          if (trimmed.includes(keyword)) {
            let memoryType, importance;
            switch (patternType) {
              case 'character':
                memoryType = this.MEMORY_TYPES.CHARACTER;
                importance = 3;
                break;
              case 'event':
                memoryType = this.MEMORY_TYPES.EVENT;
                importance = 4;
                break;
              case 'world':
                memoryType = this.MEMORY_TYPES.WORLD;
                importance = 3;
                break;
              default:
                continue;
            }
            
            memories.push({
              content: trimmed,
              memoryType,
              importance
            });
            matched = true;
            break; // Stop checking this pattern type once matched
          }
        }
        if (matched) break; // Stop checking other patterns once we have a match for this sentence
      }
    }
    
    // 去重（基于内容相似度）
    const uniqueMemories = this.deduplicateMemories(memories);
    
    return uniqueMemories;
  }
  
  /**
   * 记忆去重
   */
  deduplicateMemories(memories) {
    const seen = new Set();
    const unique = [];
    
    for (const memory of memories) {
      const key = memory.content.substring(0, 50); // 使用前50个字符作为key
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(memory);
      }
    }
    
    return unique;
  }
  
  /**
   * 判断记忆是否应该升级为长期记忆
   * @param {Object} memory - 记忆对象
   * @returns {boolean}
   */
  shouldPromoteToLongTerm(memory) {
    // 重要性 >= 4 的记忆自动升级为长期记忆
    if (memory.importance >= 4) {
      return true;
    }
    
    // 角色和世界设定记忆自动升级
    if (memory.memoryType === this.MEMORY_TYPES.CHARACTER ||
        memory.memoryType === this.MEMORY_TYPES.WORLD) {
      return true;
    }
    
    return false;
  }
}

export default new MemoryManager();

