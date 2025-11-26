import config from '../config/index.js';
import { DeepSeekProvider } from './providers/DeepSeekProvider.js';
import { OpenAIProvider } from './providers/OpenAIProvider.js';
import { QwenProvider } from './providers/QwenProvider.js';
import { LocalAIProvider } from './providers/LocalAIProvider.js';
import MemoryManager from './memory/MemoryManager.js';
import RequestQueue from './RequestQueue.js';

/**
 * AI服务主类
 * 统一管理所有AI提供商，提供统一的接口
 * 包含请求队列管理、响应标准化、重试机制
 */
class AIService {
  constructor() {
    this.provider = null;
    this.memoryManager = MemoryManager;
    this.requestQueue = new RequestQueue({
      maxConcurrent: 3,
      maxRetries: 3,
      retryDelay: 1000,
      timeout: 30000
    });
    this.availabilityCacheMs = config.aiAvailabilityCacheMs || 60000;
    this.lastAvailabilityCheck = 0;
    this.providerAvailability = {
      provider: null,
      model: null,
      available: false,
      reason: '尚未检查',
      checkedAt: null
    };
    this.initializeProvider();
    // 启动时进行一次可用性检查（失败时仅记录日志，不阻断启动）
    this.checkProviderAvailability({ force: true }).catch((error) => {
      console.warn(`⚠️  初始AI可用性检查失败: ${error.message}`);
    });
  }
  
  /**
   * 初始化AI提供商
   */
  initializeProvider() {
    const providerName = config.aiProvider.toLowerCase();
    
    try {
      switch (providerName) {
        case 'deepseek':
          if (!config.deepseekApiKey && config.nodeEnv === 'production') {
            throw new Error('DeepSeek API密钥未配置（生产环境必须配置）');
          }
          // 开发环境允许无密钥启动（但功能会受限）
          this.provider = new DeepSeekProvider({
            apiKey: config.deepseekApiKey || 'dev-mode',
            model: 'deepseek-chat'
          });
          if (!config.deepseekApiKey) {
            console.warn('⚠️  警告: DeepSeek API密钥未配置，AI功能将不可用');
          }
          break;
          
        case 'openai':
          this.provider = new OpenAIProvider({
            apiKey: config.openaiApiKey,
            model: 'gpt-3.5-turbo'
          });
          break;
          
        case 'qwen':
          this.provider = new QwenProvider({
            apiKey: config.qwenApiKey,
            baseURL: config.qwenBaseUrl,
            model: 'qwen-turbo',
            isLocal: !config.qwenApiKey
          });
          break;
          
        case 'local':
          this.provider = new LocalAIProvider({
            baseURL: config.localAiUrl,
            model: config.localAiModel,
            apiType: config.localAiApiType
          });
          break;
          
        default:
          console.warn(`未知的AI提供商: ${providerName}，使用DeepSeek作为默认`);
          this.provider = new DeepSeekProvider({
            apiKey: config.deepseekApiKey,
            model: 'deepseek-chat'
          });
      }
      
      console.log(`✅ AI提供商已初始化: ${this.provider.name}`);
    } catch (error) {
      console.error(`❌ AI提供商初始化失败: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * 生成故事响应
   * @param {Object} context - 完整上下文
   * @param {string} playerInput - 玩家输入
   * @param {Object} options - 选项（优先级等）
   * @returns {Promise<Object>} 标准化响应 { content, model, tokens, duration, success }
   */
  async generateStoryResponse(context, playerInput, options = {}) {
    if (!this.provider) {
      throw new Error('AI提供商未初始化');
    }
    await this.ensureProviderAvailability();
    
    const startTime = Date.now();
    
    // 构建记忆上下文
    const memoryContext = this.memoryManager.buildMemoryContext(
      {
        chapters: context.chapters || [],
        memories: context.memories || []
      },
      context.interactions || [],
      {
        shortTermLimit: 10,
        chapterLimit: 5,
        longTermLimit: 20
      }
    );
    
    // 准备完整上下文
    const fullContext = {
      background: context.background || '',
      storyTitle: context.title || '',
      currentChapter: context.currentChapter || 0,
      players: context.players || [],
      recentChapters: (context.chapters || []).slice(-3),
      shortTermMemories: context.shortTermMemories || memoryContext.shortTermMemories || [],
      chapterMemories: context.chapterMemories || memoryContext.chapterMemories || [],
      longTermMemories: context.longTermMemories || memoryContext.longTermMemories || []
    };
    
    // 使用请求队列执行AI请求
    try {
      const response = await this.requestQueue.enqueue(
        () => this.provider.generateStoryResponse(fullContext, playerInput),
        {
          priority: options.priority || 0,
          timeout: options.timeout || 30000
        }
      );
      
      const duration = Date.now() - startTime;
      
      // 标准化响应
      return this.standardizeResponse(response, {
        duration,
        success: true
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // 标准化错误响应
      throw this.standardizeError(error, duration);
    }
  }
  
  /**
   * 生成章节TODO列表
   * @param {string} chapterContent - 章节内容
   * @param {Object} storyContext - 故事上下文 {title, background, currentChapter}
   * @param {Object} options - 选项
   * @returns {Promise<Array>} TODO列表 [{id, content, priority}]
   */
  async generateChapterTodos(chapterContent, storyContext, options = {}) {
    if (!this.provider) {
      throw new Error('AI提供商未初始化');
    }
    await this.ensureProviderAvailability();
    
    const startTime = Date.now();
    
    // 构建TODO生成提示词 - 剧本杀专用
    const systemPrompt = `你是一个剧本杀游戏分析助手，负责根据章节内容生成案件调查TODO列表。

这是一个多人协作的剧本杀游戏，你需要：
1. 分析章节内容，识别关键线索、疑点和待解谜团
2. 生成3-5个TODO项，每个TODO项是故事机需要引导玩家调查或讨论的方向
3. TODO项应围绕：
   - 案件核心疑点（动机、手法、嫌疑人）
   - 人物关系中的矛盾点
   - 需要收集的关键证据
   - 玩家角色可能隐藏的秘密
   - 推进剧情的关键抉择
4. 每个TODO项应该具体明确，能够指导故事机与玩家展开互动

故事背景：
标题：${storyContext.title || '未命名故事'}
背景：${storyContext.background || '无'}

请生成TODO列表，格式为JSON数组，每个元素包含：
- content: TODO项内容（围绕剧本杀调查方向）
- priority: 优先级（1-5，5为最高）

返回格式示例：
[
  {"content": "引导玩家调查受害者最后接触的人物", "priority": 5},
  {"content": "询问玩家角色在案发时间的不在场证明", "priority": 4},
  {"content": "收集玩家对嫌疑人动机的推理", "priority": 3}
]`;
    
    const userPrompt = `章节内容：
${chapterContent}

请分析这个剧本杀章节，生成3-5个案件调查TODO项。只返回JSON数组，不要其他文字。`;
    
    try {
      const response = await this.requestQueue.enqueue(
        () => this.provider.callAPI([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ], {
          temperature: 0.7,
          max_tokens: 500
        }),
        {
          priority: options.priority || 2,
          timeout: options.timeout || 20000
        }
      );
      
      // 解析AI返回的JSON
      let todos = [];
      try {
        const content = response.content || response.text || '';
        // 尝试提取JSON部分（可能包含markdown代码块）
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        const jsonStr = jsonMatch ? jsonMatch[0] : content;
        todos = JSON.parse(jsonStr);
      } catch (parseError) {
        console.error('解析TODO列表失败，使用默认生成:', parseError);
        // 如果解析失败，生成默认TODO
        todos = [
          { content: '了解玩家对本章节关键事件的看法', priority: 5 },
          { content: '收集玩家对角色行为的反馈', priority: 4 },
          { content: '询问玩家对情节发展的理解', priority: 3 }
        ];
      }
      
      // 确保TODO数量在3-5个之间
      if (todos.length < 3) {
        // 补充默认TODO - 剧本杀相关
        const defaultTodos = [
          { content: '引导玩家分析案件中的可疑之处', priority: 2 },
          { content: '询问玩家角色与案件的关联', priority: 1 }
        ];
        todos = [...todos, ...defaultTodos.slice(0, 3 - todos.length)];
      } else if (todos.length > 5) {
        todos = todos.slice(0, 5);
      }
      
      // 为每个TODO生成ID并确保格式正确
      const { v4: uuidv4 } = await import('uuid');
      return todos.map((todo, index) => ({
        id: `todo_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
        content: todo.content || `TODO项 ${index + 1}`,
        priority: todo.priority || (5 - index) // 默认优先级递减
      }));
      
    } catch (error) {
      console.error('生成TODO列表失败:', error);
      // 返回默认TODO列表 - 剧本杀相关
      const { v4: uuidv4 } = await import('uuid');
      return [
        { id: `todo_${Date.now()}_0`, content: '引导玩家收集并分析现有线索', priority: 5 },
        { id: `todo_${Date.now()}_1`, content: '询问玩家角色的不在场证明和动机', priority: 4 },
        { id: `todo_${Date.now()}_2`, content: '推动玩家对嫌疑人的推理讨论', priority: 3 }
      ];
    }
  }
  
  /**
   * 生成故事机响应（玩家与AI的私密对话）
   * @param {Object} context - 完整上下文
   * @param {string} playerInput - 玩家输入
   * @param {string} playerId - 玩家ID
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 标准化响应
   */
  async generateStoryMachineResponse(context, playerInput, playerId, options = {}) {
    if (!this.provider) {
      throw new Error('AI提供商未初始化');
    }
    await this.ensureProviderAvailability();
    
    const startTime = Date.now();
    
    // 构建故事机专用提示词 - 剧本杀专用
    const systemPrompt = `你是一个剧本杀游戏中的"故事机"，扮演神秘的案件知情者角色。

你的职责：
1. 为每位玩家提供独属于其角色的秘密线索和背景信息
2. 根据玩家的调查方向，适时透露关键证据
3. 收集玩家的推理反馈，判断其是否接近真相
4. 引导玩家发现被忽视的重要细节
5. 营造悬疑紧张的氛围，但不直接揭露凶手

回应风格：
- 保持神秘感，像一个知道真相但不能直说的叙述者
- 用暗示和引导代替直接回答
- 适度给出线索，避免让调查太简单或太难
- 根据玩家角色身份，给予不同视角的信息

当前案件：${context.title || '未命名案件'}
案件背景：${context.background || '无'}

请以神秘而有帮助的方式回应玩家，帮助其角色深入案件调查。`;
    
    const userPrompt = `玩家说：${playerInput}

请根据案件背景和当前调查进度，为这位玩家提供独属于其角色的线索或收集其推理反馈。`;
    
    try {
      const response = await this.requestQueue.enqueue(
        () => this.provider.callAPI([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ], {
          temperature: 0.7,
          max_tokens: 300
        }),
        {
          priority: options.priority || 1,
          timeout: options.timeout || 20000
        }
      );
      
      const duration = Date.now() - startTime;
      return this.standardizeResponse(response, {
        duration,
        success: true
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      throw this.standardizeError(error, duration);
    }
  }
  
  /**
   * 总结章节
   * @param {string} chapterContent - 章节内容
   * @param {Object} options - 选项
   * @returns {Promise<string>} 章节摘要
   */
  async summarizeChapter(chapterContent, options = {}) {
    if (!this.provider) {
      throw new Error('AI提供商未初始化');
    }
    await this.ensureProviderAvailability();
    
    const startTime = Date.now();
    
    try {
      const summary = await this.requestQueue.enqueue(
        () => this.provider.summarizeChapter(chapterContent),
        {
          priority: options.priority || 1, // 摘要优先级较低
          timeout: options.timeout || 20000
        }
      );
      
      return summary;
    } catch (error) {
      console.error('生成章节摘要失败:', error);
      // 返回简单摘要作为备用
      return this.generateSimpleSummary(chapterContent);
    }
  }
  
  /**
   * 生成简单摘要（备用方案）
   */
  generateSimpleSummary(content) {
    const sentences = content.split(/[。！？]/).filter(s => s.trim().length > 10);
    if (sentences.length === 0) {
      return '本章节内容';
    }
    
    // 取前3句和后2句
    const summary = [
      ...sentences.slice(0, 3),
      '...',
      ...sentences.slice(-2)
    ].join('。');
    
    return summary.substring(0, 200) + (summary.length > 200 ? '...' : '');
  }
  
  /**
   * 生成故事结局
   * @param {Object} storyContext - 故事上下文
   * @param {Object} options - 选项
   * @returns {Promise<string>} 结局内容
   */
  async generateEnding(storyContext, options = {}) {
    if (!this.provider) {
      throw new Error('AI提供商未初始化');
    }
    await this.ensureProviderAvailability();
    
    const startTime = Date.now();
    
    const memoryContext = this.memoryManager.buildMemoryContext(
      {
        chapters: storyContext.chapters || [],
        memories: storyContext.memories || []
      },
      [],
      {
        chapterLimit: 10,
        longTermLimit: 30
      }
    );
    
    const fullContext = {
      background: storyContext.background || '',
      storyTitle: storyContext.title || '',
      ...memoryContext
    };
    
    try {
      const ending = await this.requestQueue.enqueue(
        () => this.provider.generateEnding(fullContext),
        {
          priority: options.priority || 2, // 结局生成优先级较高
          timeout: options.timeout || 40000
        }
      );
      
      return ending;
    } catch (error) {
      console.error('生成故事结局失败:', error);
      throw error;
    }
  }
  
  /**
   * 提取记忆
   * @param {string} content - 内容
   * @returns {Array} 记忆数组
   */
  async extractMemories(content) {
    return this.memoryManager.extractMemories(content);
  }
  
  /**
   * 标准化响应格式
   * @param {Object} response - 原始响应
   * @param {Object} metadata - 元数据
   * @returns {Object} 标准化响应
   */
  standardizeResponse(response, metadata = {}) {
    return {
      content: response.content || '',
      model: response.model || this.provider?.model || 'unknown',
      tokens: response.tokens || 0,
      duration: metadata.duration || 0,
      success: metadata.success !== false,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * 标准化错误响应
   * @param {Error} error - 错误对象
   * @param {number} duration - 持续时间
   * @returns {Error} 标准化错误
   */
  standardizeError(error, duration = 0) {
    const standardized = new Error(error.message || 'AI服务错误');
    standardized.code = error.code || 'AI_SERVICE_ERROR';
    standardized.duration = duration;
    standardized.timestamp = new Date().toISOString();
    standardized.originalError = error;
    return standardized;
  }

  async ensureProviderAvailability(options = {}) {
    return this.checkProviderAvailability(options);
  }
  
  async checkProviderAvailability({ force = false } = {}) {
    if (!this.provider) {
      throw new Error('AI提供商未初始化');
    }
    const now = Date.now();
    const cacheValid = !force && this.lastAvailabilityCheck &&
      now - this.lastAvailabilityCheck < this.availabilityCacheMs;
    if (cacheValid && this.providerAvailability) {
      if (!this.providerAvailability.available) {
        this.throwUnavailableError(this.providerAvailability.reason);
      }
      return this.providerAvailability;
    }
    let status = { available: true };
    if (typeof this.provider.checkAvailability === 'function') {
      try {
        status = await this.provider.checkAvailability();
      } catch (error) {
        status = {
          available: false,
          reason: error.message
        };
      }
    }
    const available = status?.available !== false;
    this.lastAvailabilityCheck = now;
    this.providerAvailability = {
      provider: this.provider.name,
      model: this.provider.model,
      available,
      reason: status?.reason || (available ? null : 'AI服务不可用'),
      checkedAt: new Date(now).toISOString()
    };
    if (!available) {
      this.throwUnavailableError(this.providerAvailability.reason);
    }
    return this.providerAvailability;
  }
  
  throwUnavailableError(reason) {
    const error = new Error(reason || 'AI服务暂时不可用，请稍后重试');
    error.code = 'AI_PROVIDER_UNAVAILABLE';
    error.httpStatus = 503;
    throw error;
  }
  
  getProviderAvailability() {
    return {
      provider: this.provider?.name || 'Unknown',
      model: this.provider?.model || 'Unknown',
      available: this.providerAvailability?.available ?? false,
      reason: this.providerAvailability?.reason || null,
      checkedAt: this.providerAvailability?.checkedAt || null
    };
  }
  
  /**
   * 获取当前提供商信息
   */
  getProviderInfo() {
    return {
      name: this.provider?.name || 'Unknown',
      model: this.provider?.model || 'Unknown'
    };
  }
  
  /**
   * 获取请求队列统计信息
   */
  getQueueStats() {
    return this.requestQueue.getStats();
  }
  
  /**
   * 清空请求队列
   */
  clearQueue() {
    this.requestQueue.clear();
  }
}

export default new AIService();
