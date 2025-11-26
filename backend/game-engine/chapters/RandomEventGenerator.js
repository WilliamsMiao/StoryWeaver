/**
 * 随机事件生成器
 * 在章节过渡时引入意外事件，平衡玩家控制与AI引导
 */
import AIService from '../../ai-service/AIService.js';

export class RandomEventGenerator {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.probability = options.probability || 0.3; // 30%概率
    this.intensity = options.intensity || 'medium'; // 'low' | 'medium' | 'high'
    this.eventTypes = this.initializeEventTypes();
    this.recentEvents = []; // 避免重复事件
    this.maxRecentEvents = 10;
  }
  
  /**
   * 初始化事件类型
   */
  initializeEventTypes() {
    return {
      discovery: {
        name: '意外发现',
        description: '角色发现新的物品、地点或信息',
        impact: 'medium',
        keywords: ['发现', '找到', '获得', '揭示']
      },
      encounter: {
        name: '神秘访客',
        description: '遇到新的角色或生物',
        impact: 'medium',
        keywords: ['遇到', '遇见', '访客', '陌生人']
      },
      environment: {
        name: '环境变化',
        description: '环境发生突然变化',
        impact: 'low',
        keywords: ['变化', '改变', '天气', '环境']
      },
      conflict: {
        name: '角色冲突',
        description: '角色之间产生冲突或矛盾',
        impact: 'high',
        keywords: ['冲突', '矛盾', '争吵', '对抗']
      },
      clue: {
        name: '新线索出现',
        description: '发现新的线索或信息',
        impact: 'medium',
        keywords: ['线索', '信息', '提示', '证据']
      },
      time: {
        name: '时间跳跃',
        description: '时间发生跳跃或变化',
        impact: 'high',
        keywords: ['时间', '跳跃', '流逝', '变化']
      },
      twist: {
        name: '剧情转折',
        description: '故事发生意外转折',
        impact: 'high',
        keywords: ['转折', '意外', '突然', '变化']
      }
    };
  }
  
  /**
   * 生成随机事件
   * @param {Object} story - 故事对象
   * @param {Object} context - 上下文
   * @returns {Promise<Object|null>} 随机事件或null
   */
  async generateRandomEvent(story, context = {}) {
    if (!this.enabled) {
      return null;
    }
    
    // 检查概率
    if (Math.random() > this.probability) {
      return null;
    }
    
    // 选择事件类型
    const eventType = this.selectEventType(story, context);
    if (!eventType) {
      return null;
    }
    
    // 生成事件描述
    const event = await this.createEvent(eventType, story, context);
    
    // 记录到最近事件
    this.recordEvent(event);
    
    return event;
  }
  
  /**
   * 选择事件类型
   */
  selectEventType(story, context) {
    const availableTypes = Object.keys(this.eventTypes);
    
    // 过滤掉最近使用过的事件类型
    const recentTypes = this.recentEvents
      .slice(-this.maxRecentEvents)
      .map(e => e.type);
    
    const filteredTypes = availableTypes.filter(type => 
      !recentTypes.includes(type)
    );
    
    const typesToChoose = filteredTypes.length > 0 ? filteredTypes : availableTypes;
    
    // 根据强度选择
    let candidates = typesToChoose;
    if (this.intensity === 'low') {
      candidates = candidates.filter(type => 
        this.eventTypes[type].impact === 'low' || this.eventTypes[type].impact === 'medium'
      );
    } else if (this.intensity === 'high') {
      candidates = candidates.filter(type => 
        this.eventTypes[type].impact === 'high' || this.eventTypes[type].impact === 'medium'
      );
    }
    
    if (candidates.length === 0) {
      candidates = typesToChoose;
    }
    
    // 随机选择
    const selectedType = candidates[Math.floor(Math.random() * candidates.length)];
    
    return {
      type: selectedType,
      ...this.eventTypes[selectedType]
    };
  }
  
  /**
   * 创建事件
   */
  async createEvent(eventType, story, context) {
    try {
      const prompt = this.buildEventPrompt(eventType, story, context);
      
      const aiContext = {
        title: story.title,
        background: story.background,
        currentChapter: story.chapters?.length || 0,
        recentChapters: story.chapters?.slice(-2) || []
      };
      
      const response = await AIService.generateStoryResponse(
        aiContext,
        prompt
      );
      
      return {
        id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: eventType.type,
        name: eventType.name,
        description: response.content,
        impact: eventType.impact,
        timestamp: new Date(),
        generated: true
      };
    } catch (error) {
      console.error('生成随机事件失败:', error);
      // 备用方案：使用模板
      return this.generateTemplateEvent(eventType, story);
    }
  }
  
  /**
   * 构建事件提示词
   */
  buildEventPrompt(eventType, story, context) {
    return `在故事中引入一个"${eventType.name}"类型的随机事件（50-100字），要求：
1. 事件类型：${eventType.description}
2. 与当前故事发展相关，不要过于突兀
3. 增加故事的趣味性和不可预测性
4. 为后续情节留下发展空间
5. 保持故事风格一致

故事背景：${story.background || ''}
当前章节：第${story.chapters?.length || 0}章
最近发展：${context.recentEvents?.join('；') || '无'}

请生成这个随机事件：`;
  }
  
  /**
   * 生成模板事件（备用方案）
   */
  generateTemplateEvent(eventType, story) {
    const templates = {
      discovery: [
        '一个意外的发现改变了故事的走向...',
        '在探索过程中，发现了隐藏的秘密...',
        '偶然间找到了重要的线索...'
      ],
      encounter: [
        '一个神秘的身影出现在视野中...',
        '遇到了意想不到的访客...',
        '新的角色加入了故事...'
      ],
      environment: [
        '环境突然发生了变化...',
        '天气开始转变，预示着某种变化...',
        '周围的气氛变得不同寻常...'
      ],
      conflict: [
        '矛盾开始显现，冲突一触即发...',
        '意见分歧导致了紧张的局面...',
        '角色之间的关系出现了裂痕...'
      ],
      clue: [
        '新的线索浮出水面...',
        '发现了关键信息...',
        '一个重要的提示出现了...'
      ],
      time: [
        '时间似乎发生了跳跃...',
        '不知不觉中，时间已经流逝...',
        '时间的流逝带来了变化...'
      ],
      twist: [
        '故事发生了意外的转折...',
        '一个意想不到的变化发生了...',
        '剧情出现了新的发展方向...'
      ]
    };
    
    const typeTemplates = templates[eventType.type] || templates.discovery;
    const template = typeTemplates[Math.floor(Math.random() * typeTemplates.length)];
    
    return {
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: eventType.type,
      name: eventType.name,
      description: template,
      impact: eventType.impact,
      timestamp: new Date(),
      generated: false,
      template: true
    };
  }
  
  /**
   * 记录事件
   */
  recordEvent(event) {
    this.recentEvents.push(event);
    if (this.recentEvents.length > this.maxRecentEvents) {
      this.recentEvents = this.recentEvents.slice(-this.maxRecentEvents);
    }
  }
  
  /**
   * 检查是否应该生成事件
   * 基于故事状态和上下文
   */
  shouldGenerateEvent(story, context) {
    if (!this.enabled) {
      return false;
    }
    
    // 如果最近刚生成过事件，降低概率
    const recentEventCount = this.recentEvents.filter(e => {
      const timeDiff = Date.now() - new Date(e.timestamp).getTime();
      return timeDiff < 5 * 60 * 1000; // 5分钟内
    }).length;
    
    if (recentEventCount > 0) {
      // 降低生成概率
      const adjustedProbability = this.probability * (1 - recentEventCount * 0.3);
      return Math.random() < adjustedProbability;
    }
    
    // 如果故事进展缓慢，增加事件概率
    const lastChapter = story.chapters?.[story.chapters.length - 1];
    if (lastChapter) {
      const timeSinceLastChapter = Date.now() - new Date(lastChapter.createdAt || Date.now()).getTime();
      const minutesSinceLastChapter = timeSinceLastChapter / (1000 * 60);
      
      // 如果超过30分钟没有新章节，增加事件概率
      if (minutesSinceLastChapter > 30) {
        return Math.random() < (this.probability * 1.5);
      }
    }
    
    return Math.random() < this.probability;
  }
  
  /**
   * 更新配置
   */
  updateConfig(options) {
    if (options.enabled !== undefined) this.enabled = options.enabled;
    if (options.probability !== undefined) this.probability = options.probability;
    if (options.intensity !== undefined) this.intensity = options.intensity;
  }
  
  /**
   * 获取统计信息
   */
  getStatistics() {
    const typeCounts = {};
    this.recentEvents.forEach(event => {
      typeCounts[event.type] = (typeCounts[event.type] || 0) + 1;
    });
    
    return {
      totalEvents: this.recentEvents.length,
      typeDistribution: typeCounts,
      recentEventCount: this.recentEvents.filter(e => {
        const timeDiff = Date.now() - new Date(e.timestamp).getTime();
        return timeDiff < 60 * 60 * 1000; // 1小时内
      }).length
    };
  }
}

export default RandomEventGenerator;

