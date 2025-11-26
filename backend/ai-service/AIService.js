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
   * @returns {Promise<Array>} TODO列表 [{id, content, expected_answer, hint, priority}]
   */
  async generateChapterTodos(chapterContent, storyContext, options = {}) {
    if (!this.provider) {
      throw new Error('AI提供商未初始化');
    }
    await this.ensureProviderAvailability();
    
    const startTime = Date.now();
    
    // 构建TODO生成提示词 - 剧本杀专用，带预期答案
    const systemPrompt = `你是一个剧本杀游戏设计师，负责根据章节内容生成调查问题和预期答案。

这是一个多人协作的剧本杀游戏。你需要为故事机设计引导性问题，每个问题都有预设的"正确方向"，
这样故事机可以根据玩家的回答判断是否接近真相，并给出引导。

## 设计要求：
1. 分析章节内容，提取关键线索和疑点
2. 设计3-5个调查问题，每个问题都有：
   - 问题内容（引导玩家思考的方向）
   - 预期答案（玩家应该发现的关键信息或正确推理）
   - 提示语（如果玩家答错，可以给出的引导）
3. 问题应围绕：案件核心、人物关系、关键证据、时间线、动机分析

故事背景：
标题：${storyContext.title || '未命名故事'}
背景：${storyContext.background || '无'}

## 返回格式（JSON数组）：
[
  {
    "content": "问题内容（故事机会向玩家提问的内容）",
    "expected_answer": "预期答案（关键词或核心信息，用于判断玩家是否答对）",
    "hint": "提示语（玩家答错时的引导，不直接揭示答案）",
    "priority": 5
  }
]

## 示例：
[
  {
    "content": "你注意到书房里有什么异常吗？",
    "expected_answer": "书架上的书顺序被动过|有一本书放反了|灰尘痕迹不对",
    "hint": "仔细观察书架，有些东西和之前不太一样...",
    "priority": 5
  },
  {
    "content": "管家说他一直在厨房，但你怎么看？",
    "expected_answer": "他在撒谎|他的衣服有泥土|他提到的时间不对",
    "hint": "回想一下他的衣着和他说的话...",
    "priority": 4
  }
]`;
    
    const userPrompt = `章节内容：
${chapterContent}

请分析这个剧本杀章节，生成3-5个调查问题。每个问题必须包含content、expected_answer、hint和priority。
只返回JSON数组，不要其他文字。`;
    
    try {
      const response = await this.requestQueue.enqueue(
        () => this.provider.callAPI([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ], {
          temperature: 0.7,
          max_tokens: 800
        }),
        {
          priority: options.priority || 2,
          timeout: options.timeout || 25000
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
        // 如果解析失败，生成默认TODO（带预期答案）
        todos = [
          { 
            content: '你在现场发现了什么可疑的东西？', 
            expected_answer: '血迹|指纹|脚印|凶器',
            hint: '仔细观察现场周围，不要放过任何细节...',
            priority: 5 
          },
          { 
            content: '你认为谁最有作案动机？', 
            expected_answer: '矛盾|利益|仇恨|嫉妒',
            hint: '想想谁和受害者有过节...',
            priority: 4 
          },
          { 
            content: '案发时你在哪里？有人可以证明吗？', 
            expected_answer: '不在场证明|证人|时间',
            hint: '回忆一下当时的情况...',
            priority: 3 
          }
        ];
      }
      
      // 确保TODO数量在3-5个之间
      if (todos.length < 3) {
        // 补充默认TODO - 剧本杀相关
        const defaultTodos = [
          { 
            content: '这个案件中有什么让你感到奇怪的地方？', 
            expected_answer: '矛盾|不合理|可疑',
            hint: '有些事情看起来不太对劲...',
            priority: 2 
          },
          { 
            content: '你和其他人是什么关系？', 
            expected_answer: '认识|关系|秘密',
            hint: '人与人之间的关系往往隐藏着秘密...',
            priority: 1 
          }
        ];
        todos = [...todos, ...defaultTodos.slice(0, 3 - todos.length)];
      } else if (todos.length > 5) {
        todos = todos.slice(0, 5);
      }
      
      // 为每个TODO生成ID并确保格式正确
      const { v4: uuidv4 } = await import('uuid');
      return todos.map((todo, index) => ({
        id: `todo_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
        content: todo.content || `调查问题 ${index + 1}`,
        expected_answer: todo.expected_answer || null,
        hint: todo.hint || null,
        priority: todo.priority || (5 - index) // 默认优先级递减
      }));
      
    } catch (error) {
      console.error('生成TODO列表失败:', error);
      // 返回默认TODO列表 - 剧本杀相关（带预期答案）
      const { v4: uuidv4 } = await import('uuid');
      return [
        { 
          id: `todo_${Date.now()}_0`, 
          content: '现场有什么重要的线索被忽视了？', 
          expected_answer: '痕迹|物证|证据',
          hint: '再仔细看看现场...',
          priority: 5 
        },
        { 
          id: `todo_${Date.now()}_1`, 
          content: '谁的证词存在矛盾？', 
          expected_answer: '说谎|不一致|矛盾',
          hint: '对比一下大家的说法...',
          priority: 4 
        },
        { 
          id: `todo_${Date.now()}_2`, 
          content: '你有什么不想让别人知道的秘密吗？', 
          expected_answer: '秘密|隐瞒|真相',
          hint: '每个人都有不可告人的秘密...',
          priority: 3 
        }
      ];
    }
  }
  
  /**
   * 生成故事机响应（基于TODO预期答案的智能引导）
   * @param {Object} context - 完整上下文
   * @param {string} playerInput - 玩家输入
   * @param {string} playerId - 玩家ID
   * @param {Object} options - 选项 { currentTodo, allTodos }
   * @returns {Promise<Object>} 标准化响应
   */
  async generateStoryMachineResponse(context, playerInput, playerId, options = {}) {
    if (!this.provider) {
      throw new Error('AI提供商未初始化');
    }
    await this.ensureProviderAvailability();
    
    const startTime = Date.now();
    const { currentTodo, allTodos = [] } = options;
    
    // 判断玩家回答是否匹配预期答案
    let answerMatchResult = null;
    if (currentTodo && currentTodo.expected_answer) {
      answerMatchResult = this.evaluatePlayerAnswer(playerInput, currentTodo.expected_answer);
    }
    
    // 构建故事机专用提示词 - 基于预期答案引导
    let systemPrompt = `你是一个剧本杀游戏中的"故事机"，扮演神秘的案件知情者角色。

## 你的核心职责：
1. 向玩家提出调查问题，收集他们的推理和发现
2. 根据玩家的回答，判断他们是否接近真相
3. 如果玩家回答正确或接近正确，给予肯定并透露更多线索
4. 如果玩家回答偏离方向，用暗示引导他们回到正确轨道
5. 保持神秘感，永远不直接揭露答案

## 当前案件信息：
- 案件名称：${context.title || '未命名案件'}
- 案件背景：${context.background || '无'}
`;

    // 如果有当前 TODO，添加相关信息
    if (currentTodo) {
      systemPrompt += `
## 当前调查问题：
- 问题：${currentTodo.content}
- 预期答案关键词：${currentTodo.expected_answer || '无'}
- 引导提示：${currentTodo.hint || '无'}

## 玩家回答评估：
`;
      if (answerMatchResult) {
        if (answerMatchResult.isCorrect) {
          systemPrompt += `玩家的回答**接近正确**！匹配到关键词：${answerMatchResult.matchedKeywords.join('、')}
请：
1. 肯定玩家的发现（"你注意到了关键的地方..."）
2. 透露一条新的线索或信息作为奖励
3. 引导到下一个调查方向`;
        } else {
          systemPrompt += `玩家的回答**偏离方向**。
请：
1. 不要直接否定，用委婉的方式引导
2. 给出提示：${currentTodo.hint || '试着从不同角度思考...'}
3. 暗示正确的方向，但不要直接说出答案`;
        }
      }
    }

    systemPrompt += `

## 回应风格：
- 神秘而富有暗示性
- 用"也许..."、"你有没有注意到..."、"有趣的想法..."等引导语
- 回复控制在80-150字
- 结尾可以抛出新问题继续引导`;

    const userPrompt = `玩家说：${playerInput}

请根据上述分析生成回复。`;
    
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
      const result = this.standardizeResponse(response, {
        duration,
        success: true
      });
      
      // 附加答案评估结果
      result.answerEvaluation = answerMatchResult;
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      throw this.standardizeError(error, duration);
    }
  }
  
  /**
   * 评估玩家回答是否匹配预期答案
   * @param {string} playerAnswer - 玩家回答
   * @param {string} expectedAnswer - 预期答案（用|分隔的关键词）
   * @returns {Object} { isCorrect, matchedKeywords, confidence }
   */
  evaluatePlayerAnswer(playerAnswer, expectedAnswer) {
    if (!expectedAnswer) {
      return { isCorrect: false, matchedKeywords: [], confidence: 0 };
    }
    
    const answerLower = playerAnswer.toLowerCase();
    const keywords = expectedAnswer.split('|').map(k => k.trim().toLowerCase());
    const matchedKeywords = keywords.filter(keyword => answerLower.includes(keyword));
    
    const isCorrect = matchedKeywords.length > 0;
    const confidence = matchedKeywords.length / keywords.length;
    
    return {
      isCorrect,
      matchedKeywords,
      confidence
    };
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
