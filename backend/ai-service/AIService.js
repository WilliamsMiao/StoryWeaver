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
   * 生成章节谜题和玩家专属线索
   * @param {string} chapterContent - 章节内容
   * @param {Object} storyContext - 故事上下文
   * @param {Array} players - 玩家列表 [{id, username, role}]
   * @param {Object} options - 选项
   * @returns {Promise<Object>} { puzzle, playerClues }
   */
  async generatePuzzleAndClues(chapterContent, storyContext, players, options = {}) {
    if (!this.provider) {
      throw new Error('AI提供商未初始化');
    }
    await this.ensureProviderAvailability();

    const playerCount = players.length;
    const playerNames = players.map(p => p.username).join('、');

    const systemPrompt = `你是一个剧本杀游戏设计师。请根据章节内容设计：
1. 一个核心谜题（所有玩家需要合作解决）
2. 为每个玩家分配独特的线索（每人2-3条）

## 设计原则：
- 核心谜题**必须严格基于当前章节的故事内容**，直接关联剧情中的事件、人物、线索
- 谜题答案必须是**唯一、明确、具体的答案**（如人名、地点、物品、时间等），不能模糊或有多种解释
- 答案必须能够通过关键词精确验证（提供3-5个核心关键词，必须包含在正确答案中）
- 核心谜题必须需要多人信息整合才能解决
- 每个玩家的线索都是解谜的一部分，但单独无法得出答案
- 线索之间要有关联性，鼓励玩家互相交流
- 有些线索可以是误导性的，增加推理难度

## 线索类型：
- 目击证词：玩家"看到"或"听到"的信息
- 物证发现：玩家"发现"的物品或痕迹
- 背景信息：玩家因角色背景而知道的信息
- 人物关系：玩家与其他角色/NPC的特殊关系

## 当前玩家列表：
${players.map((p, i) => `${i+1}. ${p.username}（ID: ${p.id}）`).join('\n')}

## 返回格式（严格JSON）：
{
  "puzzle": {
    "question": "核心谜题问题（必须基于章节内容的具体问题，如'是谁偷走了XX'、'凶手使用的作案工具是什么'等）",
    "correct_answer": "正确答案（必须是唯一、明确的答案，如具体的人名、物品名、地点名等）",
    "answer_keywords": "关键词1|关键词2|关键词3|关键词4|关键词5（至少3-5个核心关键词，用于精确判断答案正确性）",
    "difficulty": 3,
    "hints": ["提示1", "提示2", "提示3"],
    "next_steps": "玩家答对后的明确指示（如：'前往书房调查'、'询问管家关于XX的事'、'检查花园的痕迹'等具体行动指引）"
  },
  "playerClues": {
    "玩家ID": [
      {
        "type": "目击证词",
        "content": "线索内容（玩家独有的信息）",
        "source": "线索来源（如：你在花园散步时...）",
        "relevance": "与谜题的关联说明（内部使用，不告诉玩家）",
        "canShare": true
      }
    ]
  }
}`;

    const userPrompt = `故事背景：${storyContext.title || '未命名'}
${storyContext.background || ''}

当前章节内容：
${chapterContent}

请为这${playerCount}个玩家设计谜题和线索。**重要要求**：
1. 谜题必须**严格基于上述章节内容**，从章节中的具体情节、对话、发现中提炼
2. 答案必须是**唯一、明确的**（如具体的人名、物品、地点等），不能有歧义
3. 每个玩家得到2-3条独特线索
4. 线索内容不能重复
5. 必须整合所有人的线索才能解开谜题
6. 提供明确的"下一步行动指示"（next_steps），告诉玩家答对后应该做什么
7. 返回严格的JSON格式`;

    try {
      const response = await this.requestQueue.enqueue(
        () => this.provider.callAPI([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ], {
          temperature: 0.7,
          max_tokens: 1500
        }),
        {
          priority: options.priority || 2,
          timeout: options.timeout || 30000
        }
      );

      // 解析AI返回的JSON
      let result = { puzzle: null, playerClues: {} };
      try {
        const content = response.content || response.text || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        console.error('解析谜题和线索失败，使用默认生成:', parseError);
        result = this.generateDefaultPuzzleAndClues(players, storyContext);
      }

      // 确保每个玩家都有线索
      for (const player of players) {
        if (!result.playerClues[player.id]) {
          result.playerClues[player.id] = this.generateDefaultCluesForPlayer(player, storyContext);
        }
      }

      return result;
    } catch (error) {
      console.error('生成谜题和线索失败:', error);
      return this.generateDefaultPuzzleAndClues(players, storyContext);
    }
  }

  /**
   * 生成默认的谜题和线索（备用）
   */
  generateDefaultPuzzleAndClues(players, storyContext) {
    const puzzle = {
      question: '凶手是谁？他/她的作案动机是什么？',
      correct_answer: '需要根据线索推理',
      answer_keywords: '凶手|动机|真相',
      difficulty: 3,
      hints: ['注意时间线的矛盾', '有人在撒谎', '物证不会说谎'],
      next_steps: '继续调查其他可疑人员，收集更多证据'
    };

    const playerClues = {};
    const clueTemplates = [
      { type: '目击证词', content: '你在案发前看到有人匆忙离开现场', source: '你当时正好路过', relevance: '时间线线索', canShare: true },
      { type: '物证发现', content: '你发现地上有一枚陌生的纽扣', source: '你仔细搜索了现场', relevance: '物证线索', canShare: true },
      { type: '背景信息', content: '你知道受害者最近和某人有过激烈争吵', source: '你是知情者', relevance: '动机线索', canShare: true },
      { type: '人物关系', content: '你和受害者有一段不为人知的过去', source: '这是你的秘密', relevance: '背景线索', canShare: false }
    ];

    players.forEach((player, index) => {
      const clues = [];
      for (let i = 0; i < 2; i++) {
        const template = clueTemplates[(index * 2 + i) % clueTemplates.length];
        clues.push({
          ...template,
          content: `${template.content}（${player.username}的专属线索）`
        });
      }
      playerClues[player.id] = clues;
    });

    return { puzzle, playerClues };
  }

  /**
   * 为单个玩家生成默认线索
   */
  generateDefaultCluesForPlayer(player, storyContext) {
    return [
      {
        type: '背景信息',
        content: `作为${player.username}，你知道一些别人不知道的事情...`,
        source: '你的角色背景',
        relevance: '需要与其他玩家交流来解读',
        canShare: true
      },
      {
        type: '目击证词',
        content: '你隐约记得那天发生了一些奇怪的事...',
        source: '你的记忆',
        relevance: '可能是关键时间线的一部分',
        canShare: true
      }
    ];
  }

  /**
   * 为新加入的玩家生成专属线索
   * @param {string} chapterContent - 章节内容
   * @param {Object} storyContext - 故事上下文
   * @param {Object} player - 玩家信息
   * @param {Object} puzzle - 当前谜题
   */
  async generateCluesForSinglePlayer(chapterContent, storyContext, player, puzzle) {
    if (!this.provider) {
      return { clues: this.generateDefaultCluesForPlayer(player, storyContext) };
    }
    
    try {
      await this.ensureProviderAvailability();
      
      const systemPrompt = `你是一个剧本杀游戏设计师。一个新玩家刚刚加入了正在进行的游戏。
请为这位新玩家生成2-3条独特的线索，这些线索应该：
1. 与现有谜题相关联
2. 与其他玩家的线索有互补性
3. 能够帮助解谜，但单独无法得出答案

当前谜题：${puzzle?.puzzle_question || '推理出事件真相'}

返回JSON格式：
{
  "clues": [
    {
      "type": "线索类型（目击证词/物证发现/背景信息/人物关系）",
      "content": "线索具体内容",
      "source": "线索来源描述",
      "relevance": "与谜题的关联",
      "canShare": true
    }
  ]
}`;

      const userPrompt = `故事背景：${storyContext.title}
${storyContext.background || ''}

当前章节内容：
${chapterContent.substring(0, 1000)}

新加入的玩家：${player.username}

请为这位新玩家生成独特的线索。`;

      const response = await this.requestQueue.enqueue(
        () => this.provider.callAPI([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ], {
          temperature: 0.7,
          max_tokens: 500
        }),
        { priority: 2, timeout: 20000 }
      );

      const content = response.content || response.text || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('为新玩家生成线索失败:', error);
    }
    
    return { clues: this.generateDefaultCluesForPlayer(player, storyContext) };
  }

  /**
   * 验证玩家对谜题的回答
   * @param {string} playerAnswer - 玩家回答
   * @param {Object} puzzle - 谜题对象
   * @returns {Object} { isCorrect, confidence, feedback }
   */
  async validatePuzzleAnswer(playerAnswer, puzzle) {
    const keywords = (puzzle.answer_keywords || '').split('|').map(k => k.trim().toLowerCase());
    const answerLower = playerAnswer.toLowerCase();
    const correctAnswerLower = (puzzle.correct_answer || '').toLowerCase();
    
    // 检查关键词匹配 - 要求更严格的匹配
    const matchedKeywords = keywords.filter(k => answerLower.includes(k));
    const keywordMatch = matchedKeywords.length / Math.max(keywords.length, 1);
    
    // 检查是否包含正确答案的核心部分
    const correctAnswerParts = correctAnswerLower.split(/[，。、\s]+/).filter(p => p.length > 1);
    const answerMatch = correctAnswerParts.filter(p => answerLower.includes(p)).length / Math.max(correctAnswerParts.length, 1);
    
    // 提高正确判断的阈值，确保答案更加准确
    const confidence = (keywordMatch * 0.7 + answerMatch * 0.3);
    const isCorrect = confidence >= 0.7; // 提高到70%匹配度视为正确，确保答案唯一性

    let feedback = '';
    let nextSteps = puzzle.next_steps || '';
    
    if (isCorrect) {
      if (confidence >= 0.85) {
        feedback = '🎉 完全正确！你成功解开了这个谜题！\n\n';
      } else {
        feedback = '✅ 正确！你的推理方向完全对了！\n\n';
      }
      
      // 添加明确的下一步指示
      if (nextSteps) {
        feedback += `📍 **下一步行动**：${nextSteps}\n\n`;
        feedback += '💡 当所有玩家都解开谜题后，故事将自动推进到下一章节。';
      } else {
        feedback += '💡 等待其他玩家完成解谜，故事即将继续推进...';
      }
    } else if (confidence >= 0.4) {
      feedback = '🤔 答案接近了，但还不够准确...请再仔细思考一下？\n\n💭 提示：答案应该更加具体和明确。';
    } else {
      feedback = '❌ 这个答案似乎偏离了方向。\n\n💡 建议：回顾你获得的线索，或者向故事机询问更多提示。';
    }

    return {
      isCorrect,
      confidence,
      matchedKeywords,
      feedback,
      nextSteps: isCorrect ? nextSteps : null
    };
  }

  /**
   * 生成故事机的智能响应（完整版）
   * 根据玩家状态、已揭示的线索、解谜进度生成个性化响应
   * @param {Object} context - 完整上下文
   * @param {string} playerInput - 玩家输入
   * @param {string} playerId - 玩家ID
   * @param {Object} playerState - 玩家状态 { clues, puzzleProgress, revealedClues }
   * @returns {Promise<Object>} 响应结果
   */
  async generateSmartStoryMachineResponse(context, playerInput, playerId, playerState = {}) {
    if (!this.provider) {
      throw new Error('AI提供商未初始化');
    }
    await this.ensureProviderAvailability();

    const startTime = Date.now();
    const { clues = [], puzzleProgress = null, revealedClues = [], puzzle = null } = playerState;

    // 分析玩家输入意图
    const intent = this.analyzePlayerIntent(playerInput);

    // 选择要揭示的下一条线索
    const nextClue = clues.find(c => !revealedClues.includes(c.id));

    let systemPrompt = `你是剧本杀游戏的"故事机"，一个神秘的知情者。

## 你的角色：
- 你知道所有真相，但不会直接说出
- 你通过引导和暗示帮助玩家思考
- 你根据玩家的进度逐步透露线索
- 你保持神秘感，用隐晦的语言交流

## 当前案件：
- 案件名称：${context.title || '未命名案件'}
- 案件背景：${context.background || '无'}

## 这个玩家的状态：
- 已获得线索数：${revealedClues.length}/${clues.length}
- 解谜尝试次数：${puzzleProgress?.attempts || 0}
${puzzle ? `- 当前谜题：${puzzle.question}` : ''}

## 玩家的意图分析：
${intent.type === 'ask_clue' ? '玩家想获取线索' : ''}
${intent.type === 'answer_puzzle' ? '玩家在尝试解谜' : ''}
${intent.type === 'ask_help' ? '玩家请求帮助' : ''}
${intent.type === 'chat' ? '玩家在闲聊或探索' : ''}

`;

    // 根据意图添加具体指导
    if (intent.type === 'ask_clue' && nextClue) {
      systemPrompt += `
## 你要透露的线索：
- 类型：${nextClue.type}
- 内容：${nextClue.content}
- 来源：${nextClue.source}

请用神秘的方式透露这条线索，不要直接说出，而是通过暗示让玩家意识到。
比如：
- "你有没有注意到...？"
- "也许你应该回想一下..."
- "有趣...在那个地方..."`;
    } else if (intent.type === 'answer_puzzle' && puzzle) {
      systemPrompt += `
## 谜题验证：
玩家的回答需要和正确答案对比：${puzzle.correct_answer}

如果答案接近正确，给予肯定并引导完善。
如果答案偏离，用提示引导而不是直接否定。`;
    } else if (intent.type === 'ask_help') {
      const hintIndex = Math.min(puzzleProgress?.hintsUsed || 0, (puzzle?.hints?.length || 1) - 1);
      const hint = puzzle?.hints?.[hintIndex] || '仔细观察，真相就在细节中...';
      systemPrompt += `
## 给予提示：
可以透露的提示：${hint}

用委婉的方式给出提示，保持神秘感。`;
    }

    systemPrompt += `

## 回应风格：
- 神秘而富有暗示性
- 回复控制在80-150字
- 结尾可以抛出问题引导思考
- 使用 "..." 增加神秘感`;

    const userPrompt = `玩家说：${playerInput}

请生成故事机的回复。`;

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
          priority: 1,
          timeout: 20000
        }
      );

      const duration = Date.now() - startTime;
      const result = this.standardizeResponse(response, { duration, success: true });

      // 附加额外信息
      result.intent = intent;
      result.revealedClue = intent.type === 'ask_clue' ? nextClue : null;
      result.shouldRevealClue = intent.type === 'ask_clue' && nextClue;

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      throw this.standardizeError(error, duration);
    }
  }

  /**
   * 分析玩家输入的意图
   */
  analyzePlayerIntent(input) {
    const lowerInput = input.toLowerCase();
    
    // 询问线索的关键词
    const clueKeywords = ['线索', '证据', '发现', '看到', '听到', '告诉我', '有什么', '知道什么', '信息'];
    // 尝试解谜的关键词
    const puzzleKeywords = ['凶手是', '答案是', '我认为', '我猜', '真相是', '是因为', '动机是'];
    // 请求帮助的关键词
    const helpKeywords = ['帮助', '提示', '不知道', '想不出', '没头绪', '给点提示', '怎么办'];

    if (clueKeywords.some(k => lowerInput.includes(k))) {
      return { type: 'ask_clue', confidence: 0.8 };
    }
    if (puzzleKeywords.some(k => lowerInput.includes(k))) {
      return { type: 'answer_puzzle', confidence: 0.8 };
    }
    if (helpKeywords.some(k => lowerInput.includes(k))) {
      return { type: 'ask_help', confidence: 0.8 };
    }
    
    return { type: 'chat', confidence: 0.5 };
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

  // ==================== 角色和线索卡片生成 ====================

  /**
   * 生成增强版故事章节（包含角色标记、玩家融入、线索卡片）
   * @param {Object} context - 故事上下文
   * @param {string} playerInput - 触发内容或章节类型
   * @param {Array} players - 玩家列表
   * @param {Array} interactions - 玩家互动记录
   * @param {Array} existingCharacters - 已有角色列表
   * @returns {Promise<Object>} { content, characters, clueCards, playerRoles }
   */
  async generateEnhancedChapter(context, playerInput, players = [], interactions = [], existingCharacters = [], options = {}) {
    if (!this.provider) {
      throw new Error('AI提供商未初始化');
    }
    await this.ensureProviderAvailability();

    const startTime = Date.now();
    const playerNames = players.map(p => p.username).join('、');
    const playerDescriptions = players.map(p => `${p.username}（玩家ID: ${p.id}）`).join('\n');
    
    // 构建互动摘要
    const interactionSummary = this.buildInteractionSummary(interactions, players);
    
    // 已有角色信息
    const existingCharacterInfo = existingCharacters.length > 0 
      ? existingCharacters.map(c => `- ${c.name}（${c.character_type}）: ${c.occupation || '未知职业'}`).join('\n')
      : '暂无已登场角色';

    const systemPrompt = `你是一个顶尖的剧本杀游戏编剧。你需要创作沉浸式的互动故事章节。

## 核心要求：
1. **角色标记**：所有NPC必须用 [NPC:名称] 格式标记，所有玩家用 [玩家:名称] 格式标记
2. **玩家融入**：将所有玩家自然地写入剧情，给他们安排具体的行动、对话或发现
3. **线索设计**：为每个登场角色设计可发现的线索卡片

## 当前玩家列表：
${playerDescriptions}

## 玩家互动记录（请参考并融入剧情）：
${interactionSummary || '暂无互动记录'}

## 已登场角色：
${existingCharacterInfo}

## 故事背景：
标题：${context.title || '未命名'}
背景：${context.background || '无'}
当前章节：第${context.currentChapter || 1}章

## 输出格式（严格JSON）：
{
  "chapterContent": "章节正文内容（300-500字，使用[NPC:名称]和[玩家:名称]标记）",
  "newCharacters": [
    {
      "name": "角色名",
      "type": "npc",
      "age": "年龄",
      "occupation": "职业",
      "personality": "性格特点",
      "background": "背景故事（50字内）",
      "secret": "隐藏秘密（重要线索）",
      "isSuspect": true/false,
      "suspicionLevel": 0-10
    }
  ],
  "playerRoles": [
    {
      "playerId": "玩家ID",
      "roleInChapter": "本章角色定位",
      "actionDescription": "玩家在本章的行动描述",
      "discoveredInfo": "玩家可能发现的信息"
    }
  ],
  "clueCards": [
    {
      "characterName": "关联角色名",
      "category": "行为线索/物证/证词/关系/背景",
      "title": "线索标题",
      "content": "线索内容（30字内）",
      "importance": 1-5,
      "isHidden": false
    }
  ]
}`;

    const userPrompt = `请为这个故事创作第${context.currentChapter || 1}章。

${playerInput || '故事继续发展...'}

要求：
1. 每个玩家（${playerNames}）都必须在剧情中有具体的戏份
2. 至少出现1-2个NPC角色（可以是新角色或已有角色）
3. 为每个登场角色设计1-2条线索卡片
4. 章节结尾留下悬念`;
    
    try {
      const response = await this.requestQueue.enqueue(
        () => this.provider.callAPI([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ], {
          temperature: 0.8,
          max_tokens: 2000
        }),
        {
          priority: options.priority || 0,
          timeout: options.timeout || 45000
        }
      );

      const duration = Date.now() - startTime;
      const content = response.content || response.text || '';
      
      // 解析JSON结果
      let result;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          // 如果没有JSON，尝试将内容作为纯文本章节处理
          result = this.generateDefaultChapterStructure(content, players);
        }
      } catch (parseError) {
        console.error('解析增强章节失败:', parseError);
        result = this.generateDefaultChapterStructure(content, players);
      }

      return {
        ...result,
        model: this.provider.name,
        duration,
        success: true
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      throw this.standardizeError(error, duration);
    }
  }

  /**
   * 生成默认章节结构（当AI返回格式不正确时）
   */
  generateDefaultChapterStructure(content, players) {
    return {
      chapterContent: content || '故事继续发展...',
      newCharacters: [],
      playerRoles: players.map(p => ({
        playerId: p.id,
        roleInChapter: '调查者',
        actionDescription: `${p.username}继续调查案件`,
        discoveredInfo: null
      })),
      clueCards: []
    };
  }

  /**
   * 构建玩家互动摘要
   */
  buildInteractionSummary(interactions, players) {
    if (!interactions || interactions.length === 0) {
      return null;
    }

    const playerMap = new Map(players.map(p => [p.id, p.username]));
    const summary = interactions.map(i => {
      const playerName = playerMap.get(i.player_id) || i.player_name || '未知玩家';
      return `- ${playerName} ${i.interaction_type}: ${i.action_description || i.target_character || '进行了互动'}`;
    }).join('\n');

    return summary;
  }

  /**
   * 为单个角色生成详细线索卡片
   * @param {Object} character - 角色信息
   * @param {Object} storyContext - 故事上下文
   * @param {number} chapterNumber - 章节号
   */
  async generateCharacterClueCards(character, storyContext, chapterNumber, options = {}) {
    if (!this.provider) {
      throw new Error('AI提供商未初始化');
    }
    await this.ensureProviderAvailability();

    const systemPrompt = `你是剧本杀线索设计师。为给定角色生成线索卡片。

## 角色信息：
- 姓名：${character.name}
- 类型：${character.character_type || 'npc'}
- 职业：${character.occupation || '未知'}
- 性格：${character.personality || '未知'}
- 背景：${character.background || '未知'}
- 秘密：${character.secret || '未知'}

## 故事背景：
${storyContext.title || '未命名'}
${storyContext.background || ''}

## 线索类别说明：
- 行为线索：角色的可疑行为或习惯
- 物证：与角色相关的物品或痕迹
- 证词：角色说过的话或他人对其的评价
- 关系：与其他角色的关系
- 背景：角色的过往或身份信息

## 返回格式（JSON数组）：
[
  {
    "category": "线索类别",
    "title": "线索标题（6字内）",
    "content": "线索内容（50字内）",
    "importance": 1-5,
    "isHidden": false,
    "discoveryCondition": "发现条件（可选）"
  }
]`;

    const userPrompt = `请为 ${character.name} 生成3-5条线索卡片，当前是第${chapterNumber}章。

线索应该：
1. 有助于推理案件真相
2. 部分线索可能是误导性的
3. 重要线索可设为隐藏，需要特定条件才能发现`;

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
          priority: options.priority || 1,
          timeout: options.timeout || 20000
        }
      );

      const content = response.content || response.text || '';
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return this.generateDefaultClueCards(character);
    } catch (error) {
      console.error('生成角色线索卡片失败:', error);
      return this.generateDefaultClueCards(character);
    }
  }

  /**
   * 生成默认线索卡片
   */
  generateDefaultClueCards(character) {
    return [
      {
        category: '行为线索',
        title: '可疑行为',
        content: `${character.name}在案发时间段行踪可疑`,
        importance: 2,
        isHidden: false
      },
      {
        category: '背景',
        title: '身份信息',
        content: `${character.name}，${character.occupation || '职业不明'}`,
        importance: 1,
        isHidden: false
      }
    ];
  }

  /**
   * 为玩家生成角色设定
   * @param {Array} players - 玩家列表
   * @param {Object} storyContext - 故事上下文
   */
  async generatePlayerRoles(players, storyContext, options = {}) {
    if (!this.provider) {
      throw new Error('AI提供商未初始化');
    }
    await this.ensureProviderAvailability();

    const playerNames = players.map(p => p.username).join('、');

    const systemPrompt = `你是剧本杀游戏设计师。为每个玩家分配独特的侦探角色。

## 故事背景：
${storyContext.title || '未命名'}
${storyContext.background || ''}

## 玩家列表：
${players.map((p, i) => `${i + 1}. ${p.username}`).join('\n')}

## 角色类型：
- detective: 专业侦探
- journalist: 记者
- relative: 受害者亲属  
- witness: 目击者
- expert: 专家顾问

## 返回格式（JSON数组）：
[
  {
    "playerId": "玩家ID",
    "playerName": "玩家名",
    "roleType": "角色类型",
    "characterName": "角色全名",
    "occupation": "职业",
    "personality": "性格",
    "specialAbility": "特殊能力（如：擅长观察细节）",
    "personalGoal": "个人目标",
    "secretInfo": "只有该玩家知道的秘密信息"
  }
]`;

    const userPrompt = `请为这${players.length}个玩家分配角色：${playerNames}

要求：
1. 每个角色都有独特的背景和能力
2. 角色之间应该有一定的互补性
3. 每个人都有专属的秘密信息`;

    try {
      const response = await this.requestQueue.enqueue(
        () => this.provider.callAPI([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ], {
          temperature: 0.8,
          max_tokens: 1000
        }),
        {
          priority: options.priority || 0,
          timeout: options.timeout || 25000
        }
      );

      const content = response.content || response.text || '';
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const roles = JSON.parse(jsonMatch[0]);
        // 确保每个玩家都有角色
        return players.map((p, i) => {
          const role = roles.find(r => r.playerId === p.id || r.playerName === p.username) || roles[i];
          return {
            ...role,
            playerId: p.id,
            playerName: p.username
          };
        });
      }
      return this.generateDefaultPlayerRoles(players);
    } catch (error) {
      console.error('生成玩家角色失败:', error);
      return this.generateDefaultPlayerRoles(players);
    }
  }

  /**
   * 生成默认玩家角色
   */
  generateDefaultPlayerRoles(players) {
    const roleTypes = ['detective', 'journalist', 'witness', 'expert', 'relative'];
    return players.map((p, i) => ({
      playerId: p.id,
      playerName: p.username,
      roleType: roleTypes[i % roleTypes.length],
      characterName: `${p.username}侦探`,
      occupation: '调查员',
      personality: '机敏',
      specialAbility: '善于观察',
      personalGoal: '找出真相',
      secretInfo: '你对这个案件有一些自己的怀疑...'
    }));
  }
}

export default new AIService();
