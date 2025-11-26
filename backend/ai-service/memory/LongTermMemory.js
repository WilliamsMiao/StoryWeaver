/**
 * 长期记忆存储
 * 关键事件记录、角色关系网络、故事主题维护
 */
import { v4 as uuidv4 } from 'uuid';
import database from '../../storage/database.js';

export class LongTermMemory {
  constructor(storyId) {
    this.storyId = storyId;
    this.keyEvents = []; // 关键事件列表
    this.characterRelations = new Map(); // 角色关系网络
    this.storyThemes = []; // 故事主题
    this.worldSettings = []; // 世界设定
  }
  
  /**
   * 添加关键事件
   * @param {string} event - 事件描述
   * @param {number} importance - 重要性 1-5
   * @param {Object} metadata - 元数据
   * @returns {Promise<Object>} 事件记录
   */
  async addKeyEvent(event, importance = 3, metadata = {}) {
    const eventId = uuidv4();
    
    const eventRecord = {
      id: eventId,
      storyId: this.storyId,
      event,
      importance,
      metadata,
      timestamp: new Date()
    };
    
    // 保存到数据库
    await database.createMemory(
      eventId,
      this.storyId,
      'event',
      event,
      importance
    );
    
    // 添加到内存
    this.keyEvents.push(eventRecord);
    
    // 按重要性排序
    this.keyEvents.sort((a, b) => b.importance - a.importance);
    
    // 只保留最重要的50个事件
    if (this.keyEvents.length > 50) {
      const toRemove = this.keyEvents.slice(50);
      this.keyEvents = this.keyEvents.slice(0, 50);
      
      // 可以在这里删除数据库中的旧事件（可选）
    }
    
    return eventRecord;
  }
  
  /**
   * 更新角色关系
   * @param {string} character1 - 角色1 ID
   * @param {string} character2 - 角色2 ID
   * @param {number} relation - 关系度 -1到1
   * @param {string} reason - 关系变化原因
   * @returns {Promise<void>}
   */
  async updateCharacterRelation(character1, character2, relation, reason = '') {
    // 确保关系值在-1到1之间
    relation = Math.max(-1, Math.min(1, relation));
    
    // 创建关系键（确保顺序一致）
    const key = [character1, character2].sort().join('_');
    
    const relationData = {
      character1,
      character2,
      relation,
      reason,
      timestamp: new Date()
    };
    
    // 更新内存
    this.characterRelations.set(key, relationData);
    
    // 保存到数据库（作为记忆）
    const memoryId = uuidv4();
    const content = `${character1} 与 ${character2} 的关系: ${this.getRelationLabel(relation)}${reason ? ` (${reason})` : ''}`;
    
    await database.createMemory(
      memoryId,
      this.storyId,
      'character_relation',
      content,
      Math.abs(relation) * 5 // 重要性基于关系强度
    );
  }
  
  /**
   * 获取角色关系
   * @param {string} character1 - 角色1 ID
   * @param {string} character2 - 角色2 ID
   * @returns {number} 关系度 -1到1
   */
  getCharacterRelation(character1, character2) {
    const key = [character1, character2].sort().join('_');
    const relation = this.characterRelations.get(key);
    return relation ? relation.relation : 0; // 默认中立
  }
  
  /**
   * 获取关系标签
   * @param {number} relation - 关系度
   * @returns {string} 关系标签
   */
  getRelationLabel(relation) {
    if (relation >= 0.7) return '非常友好';
    if (relation >= 0.3) return '友好';
    if (relation >= -0.3) return '中立';
    if (relation >= -0.7) return '敌对';
    return '非常敌对';
  }
  
  /**
   * 添加故事主题
   * @param {string} theme - 主题描述
   * @returns {Promise<void>}
   */
  async addStoryTheme(theme) {
    // 检查是否已存在相似主题
    const existing = this.storyThemes.find(t => 
      this.calculateSimilarity(t, theme) > 0.8
    );
    
    if (!existing) {
      this.storyThemes.push({
        theme,
        timestamp: new Date()
      });
      
      // 保存到数据库
      const memoryId = uuidv4();
      await database.createMemory(
        memoryId,
        this.storyId,
        'theme',
        theme,
        4 // 主题重要性较高
      );
    }
  }
  
  /**
   * 添加世界设定
   * @param {string} setting - 设定描述
   * @returns {Promise<void>}
   */
  async addWorldSetting(setting) {
    // 检查是否已存在
    const existing = this.worldSettings.find(s => s === setting);
    
    if (!existing) {
      this.worldSettings.push(setting);
      
      // 保存到数据库
      const memoryId = uuidv4();
      await database.createMemory(
        memoryId,
        this.storyId,
        'world',
        setting,
        5 // 世界设定重要性最高
      );
    }
  }
  
  /**
   * 计算文本相似度（简单实现）
   * @param {string} text1 - 文本1
   * @param {string} text2 - 文本2
   * @returns {number} 相似度 0-1
   */
  calculateSimilarity(text1, text2) {
    const words1 = new Set(text1.split(/\s+/));
    const words2 = new Set(text2.split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }
  
  /**
   * 从内容中提取并保存长期记忆
   * @param {string} content - 内容
   * @returns {Promise<Array>} 提取的记忆列表
   */
  async extractAndSaveMemories(content) {
    const memories = [];
    
    // 提取关键事件
    const eventPatterns = [
      /(发现|找到|获得)[了]?([^。！？]+)/g,
      /(决定|选择|决定)[了]?([^。！？]+)/g,
      /(承诺|发誓|保证)[了]?([^。！？]+)/g
    ];
    
    eventPatterns.forEach(pattern => {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        if (match[2] && match[2].length > 5) {
          memories.push({
            type: 'event',
            content: match[0],
            importance: 4
          });
        }
      }
    });
    
    // 提取角色关系
    const relationPatterns = [
      /([^，。！？]+)(和|与)([^，。！？]+)(成为|变成|是)([^，。！？]+)/g,
      /([^，。！？]+)(对|向)([^，。！？]+)(表示|说|告诉)([^，。！？]+)/g
    ];
    
    // 提取世界设定
    const worldPatterns = [
      /(世界|地点|规则|魔法|设定)[是：:]([^。！？]+)/g
    ];
    
    // 保存提取的记忆
    for (const memory of memories) {
      if (memory.type === 'event') {
        await this.addKeyEvent(memory.content, memory.importance);
      }
    }
    
    return memories;
  }
  
  /**
   * 获取所有长期记忆（用于AI上下文）
   * @param {number} limit - 数量限制
   * @returns {Object} 长期记忆对象
   */
  getLongTermMemories(limit = 20) {
    return {
      keyEvents: this.keyEvents.slice(0, limit),
      characterRelations: Array.from(this.characterRelations.values()),
      storyThemes: this.storyThemes,
      worldSettings: this.worldSettings
    };
  }
  
  /**
   * 从数据库加载长期记忆
   */
  async loadFromDatabase() {
    // 加载关键事件
    const events = await database.getMemories(this.storyId, 'event');
    this.keyEvents = events.map(e => ({
      id: e.id,
      storyId: e.story_id,
      event: e.content,
      importance: e.importance,
      timestamp: new Date(e.created_at)
    }));
    
    // 加载角色关系
    const relations = await database.getMemories(this.storyId, 'character_relation');
    relations.forEach(r => {
      // 解析关系内容
      const match = r.content.match(/(.+?)\s+与\s+(.+?)\s+的关系:/);
      if (match) {
        const key = [match[1], match[2]].sort().join('_');
        this.characterRelations.set(key, {
          character1: match[1],
          character2: match[2],
          relation: r.importance / 5, // 从重要性反推关系度
          timestamp: new Date(r.created_at)
        });
      }
    });
    
    // 加载主题
    const themes = await database.getMemories(this.storyId, 'theme');
    this.storyThemes = themes.map(t => ({
      theme: t.content,
      timestamp: new Date(t.created_at)
    }));
    
    // 加载世界设定
    const world = await database.getMemories(this.storyId, 'world');
    this.worldSettings = world.map(w => w.content);
  }
}

export default LongTermMemory;

