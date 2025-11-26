/**
 * StoryWeaver 游戏配置文件
 * 
 * 这个文件集中管理所有可调整的游戏参数
 * 修改这些配置可以调整游戏体验，无需修改核心代码
 */

const gameConfig = {
  // ==================== 故事生成触发配置 ====================
  storyTrigger: {
    // 消息累积阈值：每累积多少条全局消息触发一次AI生成
    messageThreshold: 3,
    
    // 消息长度阈值：超过此字符数的消息会立即触发生成
    messageLengthThreshold: 50,
    
    // 时间阈值：距离上次AI响应超过此时间（毫秒）会触发生成
    timeThresholdMs: 2 * 60 * 1000, // 2分钟
    
    // 关键动作词：包含这些词的消息会立即触发AI生成
    actionKeywords: [
      // 战斗相关
      '攻击', '战斗', '打', '杀', '刺', '砍', '射', '防御', '闪避', '格挡',
      // 移动相关
      '走', '跑', '跳', '飞', '爬', '游', '进入', '离开', '前往', '返回', '逃跑', '逃',
      // 探索相关
      '寻找', '搜索', '探索', '调查', '发现', '检查', '观察', '查看', '打开', '关闭',
      // 交互相关
      '说话', '对话', '交谈', '询问', '回答', '请求', '拒绝', '同意', '威胁', '劝说',
      // 物品相关
      '拿', '拾取', '使用', '装备', '丢弃', '交易', '购买', '出售', '给予', '偷取',
      // 魔法/技能相关
      '施法', '魔法', '技能', '召唤', '治疗', '诅咒', '祝福', '变身', '传送',
      // 状态相关
      '死', '倒下', '昏迷', '受伤', '苏醒', '复活', '中毒', '解毒',
      // 情节相关
      '结束', '完成', '成功', '失败', '开始', '触发', '激活', '解锁'
    ],
    
    // 高优先级关键词：这些词会强制触发生成（即使不满足其他条件）
    highPriorityKeywords: [
      '死', '杀', '战斗', '攻击', '逃跑', '发现', '触发'
    ],
    
    // 情绪关键词：表达强烈情绪的词也会触发生成
    emotionKeywords: [
      '愤怒', '害怕', '惊讶', '高兴', '悲伤', '绝望', '希望', '震惊', '恐惧', '兴奋'
    ]
  },
  
  // ==================== 章节管理配置 ====================
  chapter: {
    // 章节字数阈值：超过此字数会触发章节分割建议
    wordCountThreshold: 2500,
    
    // 章节时间阈值：超过此时间（分钟）会考虑章节分割
    timeThresholdMinutes: 30,
    
    // 关键事件阈值：累积多少个关键事件后触发章节分割
    keyEventThreshold: 3,
    
    // 章节摘要最大长度
    summaryMaxLength: 200,
    
    // 章节标题生成提示词
    titleGenerationPrompt: '请为以下章节内容生成一个简短有力的标题（不超过15字）：'
  },
  
  // ==================== 故事机配置 ====================
  storyMachine: {
    // 反馈收集超时时间（分钟）
    feedbackTimeoutMinutes: 10,
    
    // 章节推进所需完成度（0-1）
    progressionThreshold: 0.8,
    
    // 每个章节生成的TODO数量范围
    todoCountRange: {
      min: 3,
      max: 7
    },
    
    // TODO优先级权重
    todoPriorities: {
      critical: 3,    // 关键剧情
      important: 2,   // 重要信息
      optional: 1     // 可选内容
    },
    
    // 故事机初始消息模板
    initialMessageTemplate: `🤖 故事机已激活！

📖 新的章节已经开始，我会为你提供：
- 🎯 个人任务提示
- 💡 隐藏信息线索
- 🔮 角色发展

你可以随时与我对话，询问关于故事、角色或任务的问题。
记住：只有你能看到我们的对话！`
  },
  
  // ==================== 玩家消息配置 ====================
  message: {
    // 消息最大长度
    maxLength: 1000,
    
    // 消息最小长度（过短的消息可能被忽略）
    minMeaningfulLength: 2,
    
    // 消息类型
    types: {
      global: '全局',      // 所有人可见，影响故事
      private: '故事机',   // 仅玩家和AI可见
      playerToPlayer: '私聊' // 仅发送者和接收者可见
    },
    
    // 消息频率限制（每分钟）
    rateLimitPerMinute: 30
  },
  
  // ==================== AI生成配置 ====================
  aiGeneration: {
    // 故事响应最大长度（tokens）
    maxResponseTokens: 1500,
    
    // 温度参数（0-1，越高越随机）
    temperature: 0.8,
    
    // NPC标记格式
    npcMarkupFormat: '[NPC:名称]',
    
    // 玩家名称高亮格式
    playerNameFormat: '@玩家名',
    
    // 系统角色定义
    systemRoles: {
      narrator: '你是一个富有想象力的故事叙述者',
      storyMachine: '你是故事机，负责为玩家提供个性化的游戏体验',
      evaluator: '你是一个公正的评估者，负责判断玩家反馈是否满足要求'
    },
    
    // 故事风格选项
    storyStyles: [
      { id: 'fantasy', name: '奇幻冒险', description: '魔法、龙与史诗冒险' },
      { id: 'scifi', name: '科幻未来', description: '太空、AI与未来世界' },
      { id: 'horror', name: '恐怖悬疑', description: '黑暗、神秘与惊悚' },
      { id: 'romance', name: '浪漫爱情', description: '感情、羁绊与命运' },
      { id: 'historical', name: '历史传奇', description: '古代、战争与英雄' },
      { id: 'slice_of_life', name: '日常生活', description: '现代、温馨与成长' }
    ]
  },
  
  // ==================== 记忆系统配置 ====================
  memory: {
    // 短期记忆容量
    shortTermCapacity: 20,
    
    // 章节记忆保留数量
    chapterMemoryLimit: 10,
    
    // 长期记忆关键事件数量
    longTermKeyEventLimit: 50,
    
    // 记忆重要性阈值（低于此值的记忆可能被遗忘）
    importanceThreshold: 0.3,
    
    // 记忆关键词（用于识别重要内容）
    importanceKeywords: [
      '重要', '关键', '秘密', '隐藏', '宝物', '线索', '任务', '目标',
      '死亡', '复活', '变化', '转折', '发现', '真相', '阴谋'
    ]
  },
  
  // ==================== 随机事件配置 ====================
  randomEvents: {
    // 随机事件触发概率（0-1）
    triggerProbability: 0.15,
    
    // 事件类型权重
    typeWeights: {
      encounter: 30,    // 遭遇事件
      discovery: 25,    // 发现事件
      weather: 15,      // 天气变化
      rumor: 15,        // 传闻消息
      opportunity: 10,  // 机遇事件
      crisis: 5         // 危机事件
    },
    
    // 事件模板
    eventTemplates: {
      encounter: [
        '一个神秘的旅行者出现在前方',
        '你听到了远处传来的奇怪声音',
        '一群{生物}挡住了去路'
      ],
      discovery: [
        '你发现了一个隐藏的{物品}',
        '地上有一些奇怪的痕迹',
        '远处的景象引起了你的注意'
      ],
      weather: [
        '天空突然阴沉下来',
        '一阵强风吹过',
        '温度开始{变化}'
      ],
      rumor: [
        '你听说附近发生了一些{事情}',
        '有人提到了一个关于{地点}的传说',
        '最近的消息显示{情况}'
      ]
    }
  },
  
  // ==================== UI/UX配置 ====================
  ui: {
    // 消息显示延迟（毫秒）
    messageDisplayDelay: 100,
    
    // 自动滚动阈值（距离底部多少像素内自动滚动）
    autoScrollThreshold: 50,
    
    // 输入框最大高度（像素）
    inputMaxHeight: 200,
    
    // 侧边栏默认宽度
    sidebarWidth: {
      default: 288,  // 72 * 4 = 288px (w-72)
      expanded: 320  // 80 * 4 = 320px (w-80)
    },
    
    // 动画持续时间（毫秒）
    animationDuration: 300,
    
    // 加载动画文本
    loadingTexts: [
      '故事正在编织中...',
      '命运的齿轮开始转动...',
      '世界正在成形...',
      'AI正在思考...'
    ]
  },
  
  // ==================== 调试配置 ====================
  debug: {
    // 是否在控制台输出触发判断日志
    logTriggerDecisions: true,
    
    // 是否输出AI请求/响应日志
    logAIInteractions: true,
    
    // 是否输出消息路由日志
    logMessageRouting: true,
    
    // 是否启用性能追踪
    enablePerformanceTracking: true
  }
};

/**
 * 获取配置项
 * @param {string} path - 配置路径，用点号分隔，如 'storyTrigger.messageThreshold'
 * @param {any} defaultValue - 默认值
 * @returns {any} 配置值
 */
export function getConfig(path, defaultValue = null) {
  const keys = path.split('.');
  let value = gameConfig;
  
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return defaultValue;
    }
  }
  
  return value;
}

/**
 * 检查消息是否包含触发关键词
 * @param {string} message - 消息内容
 * @returns {Object} { hasKeyword: boolean, matchedKeywords: string[], priority: string }
 */
export function checkTriggerKeywords(message) {
  const { actionKeywords, highPriorityKeywords, emotionKeywords } = gameConfig.storyTrigger;
  
  const matchedAction = actionKeywords.filter(kw => message.includes(kw));
  const matchedHighPriority = highPriorityKeywords.filter(kw => message.includes(kw));
  const matchedEmotion = emotionKeywords.filter(kw => message.includes(kw));
  
  const allMatched = [...new Set([...matchedAction, ...matchedHighPriority, ...matchedEmotion])];
  
  let priority = 'none';
  if (matchedHighPriority.length > 0) {
    priority = 'high';
  } else if (matchedAction.length > 0) {
    priority = 'normal';
  } else if (matchedEmotion.length > 0) {
    priority = 'low';
  }
  
  return {
    hasKeyword: allMatched.length > 0,
    matchedKeywords: allMatched,
    priority
  };
}

/**
 * 获取随机事件
 * @returns {Object|null} 随机事件或null
 */
export function getRandomEvent() {
  const { triggerProbability, typeWeights, eventTemplates } = gameConfig.randomEvents;
  
  // 随机判断是否触发
  if (Math.random() > triggerProbability) {
    return null;
  }
  
  // 根据权重选择事件类型
  const totalWeight = Object.values(typeWeights).reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;
  
  let selectedType = 'encounter';
  for (const [type, weight] of Object.entries(typeWeights)) {
    random -= weight;
    if (random <= 0) {
      selectedType = type;
      break;
    }
  }
  
  // 从模板中随机选择
  const templates = eventTemplates[selectedType];
  if (!templates || templates.length === 0) {
    return null;
  }
  
  const template = templates[Math.floor(Math.random() * templates.length)];
  
  return {
    type: selectedType,
    template,
    timestamp: new Date()
  };
}
// === 统一的配置访问Helper ===
// 任何需要衍生配置的模块，都应该通过这些方法或 getConfig() 获取，
// 这样在未来扩展 gameConfig 时，只需在这里更新映射逻辑。
const DEFAULT_QUESTION_TRIGGERS = ['还是', '或者', '如果', '是否', '要不要', '?', '？'];
const DEFAULT_DRAMATIC_KEYWORDS = ['突然', '危机', '危险', '爆炸', '崩塌', '救命', '不妙', '紧急'];

export function getChapterTriggerOptions() {
  const chapterConfig = getConfig('chapter', {});
  const storyTriggerConfig = getConfig('storyTrigger', {});
  return {
    wordCount: chapterConfig.wordCountThreshold ?? 2000,
    timeElapsed: chapterConfig.timeThresholdMinutes ?? 30,
    keyEvents: chapterConfig.keyEventThreshold ?? 3,
    messageCount: chapterConfig.messageCountThreshold ?? storyTriggerConfig.messageThreshold ?? 10,
    playerInactivity: chapterConfig.playerInactivityMinutes ?? 10,
    enableAutoTrigger: chapterConfig.enableAutoTrigger ?? true
  };
}

export function getFeedbackSystemConfig() {
  const storyMachine = getConfig('storyMachine', {});
  return {
    progressionThreshold: storyMachine.progressionThreshold ?? 0.8,
    todoCountRange: {
      min: storyMachine.todoCountRange?.min ?? 3,
      max: storyMachine.todoCountRange?.max ?? 7
    },
    todoPriorities: {
      critical: storyMachine.todoPriorities?.critical ?? 3,
      important: storyMachine.todoPriorities?.important ?? 2,
      optional: storyMachine.todoPriorities?.optional ?? 1
    }
  };
}

export function getStoryGenerationTriggers() {
  const storyTrigger = getConfig('storyTrigger', {});
  const baseTimeThresholdMs = storyTrigger.timeThresholdMs ?? (2 * 60 * 1000);
  return {
    cumulativeMessageCount: storyTrigger.messageThreshold ?? 3,
    actionKeywords: [...(storyTrigger.actionKeywords ?? [])],
    questionTriggers: storyTrigger.questionTriggers ?? DEFAULT_QUESTION_TRIGGERS,
    dramaticKeywords: Array.from(new Set([
      ...DEFAULT_DRAMATIC_KEYWORDS,
      ...(storyTrigger.highPriorityKeywords ?? [])
    ])),
    longMessageThreshold: storyTrigger.messageLengthThreshold ?? 80,
    timeIntervalMinutes: Math.max(1, Math.round(baseTimeThresholdMs / (60 * 1000))),
    emotionKeywords: [...(storyTrigger.emotionKeywords ?? [])]
  };
}

export default gameConfig;
