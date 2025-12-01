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
      longTermMemories: context.longTermMemories || memoryContext.longTermMemories || [],
      // ★ 预制剧本支持 ★
      isPrebuiltScript: context.isPrebuiltScript || false,
      script: context.script || null,
      storyOutline: context.storyOutline || context.outline || null,
      playerCharacter: context.playerCharacter || null // 当前玩家的角色信息
    };
    
    // 如果是预制剧本模式，检查是否有增强数据
    if (fullContext.isPrebuiltScript && fullContext.script) {
      // 优先使用增强版响应（如果有叙事诡计、NPC人格等数据）
      if (fullContext.script.narrativeTricks || fullContext.script.npcPersonas) {
        return this.generateEnhancedScriptResponse(fullContext, playerInput, options);
      }
      return this.generateScriptBasedResponse(fullContext, playerInput, options);
    }
    
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
   * 基于预制剧本生成响应
   * AI会参考剧本内容，但动态响应玩家行为
   */
  async generateScriptBasedResponse(context, playerInput, options = {}) {
    const startTime = Date.now();
    const script = context.script;
    const outline = context.storyOutline;
    const playerCharacter = context.playerCharacter;
    
    // 构建剧本感知的系统提示
    const systemPrompt = this.buildScriptAwareSystemPrompt(script, outline, playerCharacter, context);
    
    // 构建消息历史
    const messages = [
      { role: 'system', content: systemPrompt },
      ...this.buildConversationHistory(context),
      { role: 'user', content: playerInput }
    ];
    
    try {
      const response = await this.requestQueue.enqueue(
        () => this.provider.callAPI(messages, { 
          temperature: 0.7, 
          max_tokens: 800 
        }),
        {
          priority: options.priority || 0,
          timeout: options.timeout || 30000
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
   * 构建剧本感知的系统提示
   */
  buildScriptAwareSystemPrompt(script, outline, playerCharacter, context) {
    const currentChapter = context.currentChapter || 1;
    const chapterData = script.chapters?.find(c => c.chapterNumber === currentChapter) || script.chapters?.[0];
    
    let prompt = `你是一个剧本杀游戏的故事机/主持人AI。你正在主持一场基于预制剧本的游戏。

## 剧本信息
- 标题: ${script.title}
- 主题: ${script.theme}
- 当前章节: 第${currentChapter}章 - ${chapterData?.title || ''}

## 案件真相（仅供你参考，绝对不能直接透露给玩家！）
- 受害者: ${outline?.victimName}
- 案发时间: ${outline?.murderTime}
- 案发地点: ${outline?.murderLocation}
- 真相概要: ${outline?.fullTruth?.substring(0, 200)}...

## 本章目标
${chapterData?.chapterGoal || '引导玩家调查案件'}

## 可用地点
${script.locations?.map(l => `- ${l.name}: ${l.description}`).join('\n') || '暂无'}

## 可发现线索（本章可揭示）
${script.clues?.filter(c => c.revealChapter <= currentChapter).map(c => 
  `- ${c.name} (在${c.discoveryLocation}): ${c.content?.substring(0, 50)}...`
).join('\n') || '暂无'}`;

    // 如果有玩家角色信息，添加角色上下文
    if (playerCharacter) {
      prompt += `

## 当前交互玩家的角色
- 角色名: ${playerCharacter.name}
- 身份: ${playerCharacter.occupation}
- 玩家知道的秘密: ${playerCharacter.secretInfo || '无'}
- 个人目标: ${playerCharacter.personalGoal || '找出真凶'}`;
    }

    prompt += `

## 🖋️ 悬疑小说写作技巧（核心！）
你要像阿加莎·克里斯蒂或东野圭吾一样写作。每一段描述都应该是一个精心设计的悬疑片段。

### 1. 氛围营造优先
不要只描述"发生了什么"，而是描述"感觉像什么"。
❌ 错误示例："你进入了书房，看到了一张桌子。"
✅ 正确示例："推开沉重的橡木门，一股陈旧的纸墨气息扑面而来。昏暗的光线中，你隐约看到书桌上散落的纸张——有些被揉成一团，仿佛主人临死前曾试图销毁什么。"

### 2. 线索隐藏术
线索必须像珍珠一样藏在牡蛎里，让玩家自己发现。
❌ 错误示例："你发现了一封重要的信，信上写着凶手的名字。"
✅ 正确示例："书桌抽屉的夹层里，你摸到一张折叠的信纸，边缘已经发黄。展开一看，是一封未寄出的信，落款处的墨迹被泪水晕开，但依稀能辨认出几个字母……"

### 3. 感官细节法则
每个场景至少调动三种感官：视觉、听觉、嗅觉/触觉/味觉。
- 视觉：光影、颜色、形状、动态
- 听觉：脚步声、钟声、风声、低语
- 嗅觉：血腥味、香水残留、潮湿霉味
- 触觉：冰冷的金属、粗糙的木纹、粘稠的液体

### 4. 悬念节奏控制
- 玩家调查正确时：给出部分信息 + 留下新疑问（"你找到了钥匙，但它能打开什么？"）
- 玩家调查错误时：用环境暗示正确方向（"这里似乎没什么异常……但你总觉得走廊尽头那扇紧闭的门在召唤你。"）
- 关键时刻：制造意外中断（"正当你要打开那个抽屉——身后突然传来一声尖锐的猫叫。"）

### 5. NPC对话原则
NPC不是信息贩卖机，是有血有肉的角色。
- 说谎者：眼神闪躲，话题跳跃，过度解释
- 隐瞒者：欲言又止，转移话题，假装不经意
- 知情者：暗示性语言，意味深长的停顿，"你应该去问问XX"
- 无辜者：真诚但可能提供误导性信息

## 🚫 绝对禁止
- "根据剧本"、"作为AI"、"我来告诉你"
- 直接说出凶手或关键真相
- 机械地列举线索清单
- 使用游戏术语（如"获得线索+1"）

## ✅ 回复规则
- 使用第二人称"你"，让玩家身临其境
- 回复150-300字，宁可质量高也不要流水账
- 每次回复至少包含一个感官细节和一个悬念钩子
- 如果玩家发现线索，用小说语言描述，让他们自己意识到这是线索`;

    return prompt;
  }
  
  /**
   * 构建对话历史
   */
  buildConversationHistory(context) {
    const history = [];
    const recentInteractions = context.shortTermMemories?.slice(-6) || [];
    
    recentInteractions.forEach(interaction => {
      if (interaction.input) {
        history.push({ role: 'user', content: interaction.input });
      }
      if (interaction.response) {
        history.push({ role: 'assistant', content: interaction.response });
      }
    });
    
    return history;
  }

  /**
   * 生成增强版剧本响应（使用完整剧本数据）
   * 支持叙事诡计、NPC人格、情感弧线等高级功能
   */
  async generateEnhancedScriptResponse(context, playerInput, options = {}) {
    const startTime = Date.now();
    const script = context.script;
    const currentChapter = context.currentChapter || 1;
    
    // 获取增强数据
    const narrativeTricks = script.narrativeTricks || [];
    const storyLayers = script.storyLayers || [];
    const dynamicEvents = script.dynamicEvents || [];
    const npcPersonas = script.npcPersonas || [];

    // 检查是否触发动态事件
    const triggeredEvent = this.checkDynamicEventTrigger(playerInput, dynamicEvents, currentChapter);

    // 构建增强系统提示
    const systemPrompt = this.buildEnhancedSystemPrompt({
      script,
      currentChapter,
      narrativeTricks,
      storyLayers,
      triggeredEvent,
      playerCharacter: context.playerCharacter
    });

    const messages = [
      { role: 'system', content: systemPrompt },
      ...this.buildConversationHistory(context),
      { role: 'user', content: playerInput }
    ];

    try {
      const response = await this.requestQueue.enqueue(
        () => this.provider.callAPI(messages, {
          temperature: 0.75,
          max_tokens: 900
        }),
        {
          priority: options.priority || 0,
          timeout: options.timeout || 35000
        }
      );

      const duration = Date.now() - startTime;
      
      let finalResponse = this.standardizeResponse(response, { duration, success: true });
      
      // 如果触发了动态事件，添加事件描述
      if (triggeredEvent) {
        finalResponse.dynamicEvent = triggeredEvent;
        finalResponse.content = `${triggeredEvent.eventDescription}\n\n${finalResponse.content}`;
      }

      return finalResponse;
    } catch (error) {
      const duration = Date.now() - startTime;
      throw this.standardizeError(error, duration);
    }
  }

  /**
   * 构建增强版系统提示
   */
  buildEnhancedSystemPrompt({ script, currentChapter, narrativeTricks, storyLayers, triggeredEvent, playerCharacter }) {
    const chapterData = script.chapters?.find(c => c.chapter_number === currentChapter) || script.chapters?.[0];
    const truth = script.truth;
    
    // 获取当前可揭示的故事层
    const visibleLayers = storyLayers.filter(l => 
      l.reveal_chapter <= currentChapter || l.layer_type === 'surface'
    );

    let prompt = `你是一个专业的剧本杀游戏主持人（故事机），正在主持一场精心设计的悬疑推理游戏。

## 🎭 剧本核心信息
- **标题**: ${script.title}
- **当前章节**: 第${currentChapter}章 - ${chapterData?.title || ''}
- **章节目标**: ${chapterData?.chapter_goal || '推进调查'}
- **氛围**: ${script.atmosphere || '悬疑紧张'}

## 🔍 案件真相（绝对保密！）
- 受害者: ${truth?.victim_name}
- 凶手: ${script.characters?.find(c => c.is_murderer)?.name || '待揭晓'}
- 动机: ${truth?.murder_motive}
- 手法: ${truth?.murder_method}
- 案发时间: ${truth?.murder_time}
- 案发地点: ${truth?.murder_location}

## 📚 故事层级（根据进度逐步揭示）
${visibleLayers.map(l => `【${l.layer_title}】${l.layer_content?.substring(0, 100)}...`).join('\n\n')}`;

    // 添加叙事诡计提示（如果存在）
    if (narrativeTricks.length > 0) {
      const relevantTricks = narrativeTricks.filter(t => t.trigger_chapter >= currentChapter);
      if (relevantTricks.length > 0) {
        prompt += `

## 🎪 叙事诡计（暗中引导）
${relevantTricks.map(t => `- **${t.trick_name}** (${t.trick_type}): ${t.trick_description?.substring(0, 80)}...`).join('\n')}
【注意】这些诡计应该在玩家不知情的情况下影响他们的判断，不要直接提及。`;
      }
    }

    // 如果有动态事件触发
    if (triggeredEvent) {
      prompt += `

## ⚡ 突发事件
刚刚触发了一个动态事件：${triggeredEvent.eventName}
事件描述：${triggeredEvent.eventDescription}
氛围效果：${triggeredEvent.atmosphereEffect}
请在回复中自然地融入这个事件。`;
    }

    // 玩家角色信息
    if (playerCharacter) {
      prompt += `

## 👤 当前玩家角色
- 角色名: ${playerCharacter.name}
- 职业: ${playerCharacter.occupation}
- 已知秘密: ${playerCharacter.secret_info || '无'}
- 个人目标: ${playerCharacter.personal_goal || '找出真凶'}
- 技能: ${playerCharacter.skills?.map(s => s.skill_name).join('、') || '无特殊技能'}`;
    }

    prompt += `

## 🎯 悬疑小说写作核心原则

### 1. 氛围即叙事
每一个场景都要有"味道"。不是在讲故事，而是在构建一个可以走进去的世界。
- 进入房间：描述光线、气味、声音、温度
- 检查物品：描述触感、重量、细节、异常之处
- 与人交谈：描述表情、语气、小动作、眼神

### 2. 线索的艺术
线索不应该被"发现"，而应该被"感受到"。
❌ "你在抽屉里发现了一封信。"
✅ "抽屉的夹层里，你的指尖触到了一个折角——是一张被刻意藏起来的信纸。字迹潦草而急促，像是在恐惧中匆匆写下的。落款处的墨迹被什么液体晕开，散发着淡淡的苦杏仁味……"

### 3. 三感法则
每段描述至少调动三种感官：
- 👁️ 视觉：阴影、色彩、动态、光线变化
- 👂 听觉：脚步、呼吸、钟摆、远处的争吵
- 👃 嗅觉/触觉：血腥、香水、冰冷的金属、粗糙的麻绳

### 4. 悬念钩子
每段回复都要留下一个让玩家想继续的"钩子"：
- "但你总觉得，有什么重要的东西被你忽略了……"
- "正当你要仔细查看——走廊尽头突然传来一阵急促的脚步声。"
- "这把钥匙的形状很特殊……你在哪里见过类似的锁孔？"

### 5. NPC是演员，不是百科全书
- 说谎者：过度友善、细节太完美、眼神飘忽
- 隐瞒者：欲言又止、反复强调无关的事、转移话题
- 恐惧者：声音发抖、不敢直视、急于离开
- 知情者：意味深长的沉默、暗示性的话语、"你应该去问问……"

## 🚫 绝对禁止的表达
- "根据剧本"、"作为AI"、"让我告诉你"
- "你获得了线索"、"你发现了重要信息"
- 直接列举线索清单
- 任何打破第四面墙的语言

## ✅ 回复标准
- 使用第二人称"你"，沉浸式叙述
- 150-300字，追求质感而非数量
- 每次回复包含：氛围描写 + 具体细节 + 悬念钩子
- 让玩家自己意识到"这可能是线索"，而不是告诉他们`;

    return prompt;
  }

  /**
   * 检查动态事件触发
   * Optimized: Pre-compute lowercase input once, cache lowercase keywords
   */
  checkDynamicEventTrigger(playerInput, dynamicEvents, currentChapter) {
    if (!dynamicEvents || dynamicEvents.length === 0) {
      return null;
    }
    
    const lowerInput = playerInput.toLowerCase();
    
    // Pre-defined search and accusation keywords for faster lookup
    const searchKeywords = ['搜索', '检查', '调查'];
    const accusationKeywords = ['指认', '凶手是', '怀疑'];
    
    // Filter events by chapter range first to reduce iterations
    const eligibleEvents = dynamicEvents.filter(
      event => event.earliest_chapter <= currentChapter && event.latest_chapter >= currentChapter
    );
    
    for (const event of eligibleEvents) {
      const trigger = event.trigger_condition;
      
      switch (event.trigger_type) {
        case 'keyword':
          // Cache lowercase keywords if not already done
          if (trigger.keywords) {
            if (!trigger._lowerKeywords) {
              trigger._lowerKeywords = trigger.keywords.map(kw => kw.toLowerCase());
            }
            if (trigger._lowerKeywords.some(kw => lowerInput.includes(kw))) {
              return event;
            }
          }
          break;
        case 'search_action':
          if (searchKeywords.some(kw => lowerInput.includes(kw))) {
            return event;
          }
          break;
        case 'accusation':
          if (accusationKeywords.some(kw => lowerInput.includes(kw))) {
            return event;
          }
          break;
        case 'random':
          if (Math.random() < (trigger.probability || 0.1)) {
            return event;
          }
          break;
      }
    }
    
    return null;
  }

  /**
   * 生成凶手玩家专属引导
   */
  async generateMurdererGuidance(scriptId, currentChapter, gameContext) {
    const scriptDatabase = (await import('../script-factory/database.js')).default;
    const guide = await scriptDatabase.getMurdererGuide(scriptId, currentChapter);
    
    if (!guide || guide.length === 0) {
      return null;
    }

    const chapterGuide = guide[0];
    
    // 根据当前游戏状态选择最相关的建议
    const relevantTips = {
      strategy: chapterGuide.strategy_tips?.slice(0, 2) || [],
      speech: chapterGuide.speech_suggestions?.slice(0, 2) || [],
      danger: chapterGuide.danger_signals?.slice(0, 2) || [],
      safe: chapterGuide.safe_topics?.slice(0, 2) || []
    };

    return {
      chapter: currentChapter,
      tips: relevantTips,
      message: `【凶手专属提示】\n策略：${relevantTips.strategy[0] || '保持冷静'}\n安全话题：${relevantTips.safe.join('、') || '环境细节'}`
    };
  }


  /**
   * 生成完整故事大纲（游戏初始化时调用）
   * 这是整个游戏的核心！确定案件真相、凶手、证据、章节目标等
   */
  async generateStoryOutline(title, background, players, options = {}) {
    if (!this.provider) {
      throw new Error('AI提供商未初始化');
    }
    await this.ensureProviderAvailability();

    const playerCount = players.length;
    const playerNames = players.map(p => p.username).join('、');

    const systemPrompt = `你是一个顶级剧本杀游戏设计师。你需要设计一个完整的剧本杀案件大纲。

## 核心要求：
1. **案件必须有明确真相**：凶手是谁、动机是什么、如何作案、关键证据在哪里
2. **章节目标清晰**：每章玩家需要完成什么任务才能推进
3. **地点和物品必须与案情紧密相关**：
   - 不要生成通用的"客厅"、"厨房"，除非它们是案发现场
   - 地点描述要包含环境细节（如：散落着文件的书房、打破窗户的卧室）
   - 每个地点都必须有存在的意义（藏有线索或推动剧情）
4. **线索分布合理**：关键证据分散在不同地点，需要玩家合作

## 玩家数量：${playerCount}人
## 玩家列表：${playerNames}

## 返回格式（严格JSON）：
{
  "caseType": "谋杀案/失踪案/盗窃案",
  "victimName": "受害者姓名",
  "victimDescription": "受害者身份描述（50字内）",
  "murdererName": "凶手姓名（必须是NPC，不能是玩家）",
  "murdererMotive": "作案动机（100字内）",
  "murderMethod": "作案手法详细描述（100字内）",
  "murderLocation": "案发地点（具体且有特色）",
  "murderTime": "案发时间",
  "fullTruth": "完整真相描述（200字内，包含所有关键信息）",
  "keyEvidence": [
    {
      "name": "证据名称",
      "location": "证据所在位置",
      "description": "证据描述",
      "importance": "关键/重要/辅助",
      "discoveryHint": "发现这个证据的提示"
    }
  ],
  "redHerrings": [
    {
      "name": "误导线索名称",
      "description": "为什么这是误导",
      "location": "位置"
    }
  ],
  "locations": [
    {
      "name": "地点名称（如：凌乱的书房、阴暗的地下室）",
      "description": "地点描述（包含氛围和视觉细节）",
      "canInvestigate": true,
      "items": ["可检查的物品1", "可检查的物品2"],
      "cluesHere": ["这里可以发现的线索ID"]
    }
  ],
  "interactableItems": [
    {
      "name": "物品名称",
      "location": "所在位置",
      "description": "物品描述",
      "hiddenInfo": "检查后能发现的信息",
      "keywords": ["检查", "查看", "调查"]
    }
  ],
  "chapterGoals": [
    {
      "chapter": 1,
      "title": "章节标题",
      "mainObjective": "主要目标描述",
      "subTasks": [
        {
          "task": "具体任务描述（如：搜查书房寻找遗嘱）",
          "target": "任务目标（必须是上面定义的locations或npcs之一）",
          "targetType": "location/item/npc",
          "reward": "完成后获得的信息"
        }
      ],
      "successCondition": "本章成功条件",
      "puzzleQuestion": "本章核心谜题",
      "puzzleAnswer": "谜题答案",
      "puzzleKeywords": ["答案关键词1", "答案关键词2"]
    }
  ],
  "npcs": [
    {
      "name": "NPC姓名",
      "role": "NPC身份",
      "personality": "性格特点",
      "secret": "隐藏秘密",
      "alibi": "不在场证明（如有）",
      "suspicionLevel": 0-10
    }
  ]
}`;

    const userPrompt = `请为以下剧本杀游戏设计完整的案件大纲：

游戏标题：${title}
背景设定：${background || '神秘的古老庄园'}
玩家人数：${playerCount}人

要求：
1. 设计一个有趣的谋杀案
2. 凶手必须是NPC，不是玩家
3. 设计3个章节的目标
4. 每章至少2个可完成的任务
5. 设计5-8个可交互地点
6. 设计10个以上可检查的物品
7. 关键证据必须分散在不同地点

请返回完整的JSON格式大纲。`;

    try {
      console.log('[故事大纲] 开始生成故事大纲...');
      const response = await this.requestQueue.enqueue(
        () => this.provider.callAPI([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ], {
          temperature: 0.8,
          max_tokens: 3000
        }),
        {
          priority: 0,
          timeout: options.timeout || 60000
        }
      );

      // 解析JSON
      const content = response.content || response.text || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('AI返回格式错误，无法解析故事大纲');
      }

      const outline = JSON.parse(jsonMatch[0]);
      console.log('[故事大纲] 故事大纲生成成功');
      console.log(`  - 案件类型: ${outline.caseType}`);
      console.log(`  - 受害者: ${outline.victimName}`);
      console.log(`  - 凶手: ${outline.murdererName}`);
      console.log(`  - 地点数: ${outline.locations?.length || 0}`);
      console.log(`  - 章节数: ${outline.chapterGoals?.length || 0}`);

      return outline;
    } catch (error) {
      console.error('[故事大纲] 生成失败:', error.message);
      // 返回默认大纲
      return this.generateDefaultOutline(title, background, players);
    }
  }

  /**
   * 生成默认故事大纲（AI失败时的备用）
   */
  generateDefaultOutline(title, background, players) {
    return {
      caseType: '谋杀案',
      victimName: '维克多·布莱克',
      victimDescription: '庄园主人，在书房被发现死亡',
      murdererName: '詹姆斯管家',
      murdererMotive: '主人发现他多年来一直在挪用庄园资金',
      murderMethod: '用书房的烛台击打后伪造成意外',
      murderLocation: '书房',
      murderTime: '昨晚10点左右',
      fullTruth: '詹姆斯管家多年来一直挪用庄园资金，维克多发现后威胁要报警。詹姆斯趁维克多独自在书房时，用烛台将其击倒，并伪造成不慎跌倒的意外。',
      keyEvidence: [
        { name: '带血的烛台', location: '书房壁炉旁', description: '被擦拭过但仍有血迹残留', importance: '关键', discoveryHint: '检查壁炉附近' },
        { name: '账本', location: '书房保险柜', description: '记录了资金异常', importance: '关键', discoveryHint: '调查保险柜' },
        { name: '沾有泥土的手套', location: '厨房垃圾桶', description: '管家的手套，沾有书房地毯的纤维', importance: '重要', discoveryHint: '搜查厨房' }
      ],
      redHerrings: [
        { name: '破碎的酒杯', description: '看似争斗痕迹，实为转移注意力', location: '书房' }
      ],
      locations: [
        { name: '书房', description: '案发现场，维克多的私人空间', canInvestigate: true, items: ['书桌', '书架', '壁炉', '保险柜', '地毯'], cluesHere: ['烛台', '账本'] },
        { name: '厨房', description: '仆人们工作的地方', canInvestigate: true, items: ['橱柜', '垃圾桶', '刀架'], cluesHere: ['手套'] },
        { name: '花园', description: '庄园的后花园', canInvestigate: true, items: ['花圃', '工具房', '长椅'], cluesHere: [] },
        { name: '客厅', description: '庄园的接待区', canInvestigate: true, items: ['沙发', '壁炉', '相框'], cluesHere: [] },
        { name: '管家房间', description: '詹姆斯的住处', canInvestigate: true, items: ['衣柜', '床头柜', '日记本'], cluesHere: [] }
      ],
      interactableItems: [
        { name: '书桌', location: '书房', description: '维克多的办公桌', hiddenInfo: '抽屉里有一封未完成的信', keywords: ['检查', '调查', '查看'] },
        { name: '保险柜', location: '书房', description: '嵌入墙壁的保险柜', hiddenInfo: '里面有账本和一些文件', keywords: ['打开', '检查', '调查'] },
        { name: '垃圾桶', location: '厨房', description: '厨房角落的垃圾桶', hiddenInfo: '有一双沾有泥土的手套', keywords: ['翻找', '检查', '查看'] }
      ],
      chapterGoals: [
        {
          chapter: 1,
          title: '发现真相',
          mainObjective: '调查案发现场，收集初步证据',
          subTasks: [
            { task: '检查书房的书桌', target: '书桌', targetType: 'item', reward: '发现未完成的信件' },
            { task: '调查壁炉附近', target: '壁炉', targetType: 'item', reward: '发现可疑的烛台' }
          ],
          successCondition: '发现至少一件关键证据',
          puzzleQuestion: '凶手用什么凶器行凶？',
          puzzleAnswer: '烛台',
          puzzleKeywords: ['烛台', '蜡烛台', '铜烛台']
        },
        {
          chapter: 2,
          title: '追查线索',
          mainObjective: '扩大调查范围，询问相关人员',
          subTasks: [
            { task: '搜查厨房', target: '厨房', targetType: 'location', reward: '发现管家的手套' },
            { task: '调查保险柜', target: '保险柜', targetType: 'item', reward: '发现账本异常' }
          ],
          successCondition: '收集到指向凶手的证据',
          puzzleQuestion: '谁是凶手？他的动机是什么？',
          puzzleAnswer: '詹姆斯管家，因为挪用资金被发现',
          puzzleKeywords: ['詹姆斯', '管家', '挪用', '资金', '账目']
        },
        {
          chapter: 3,
          title: '揭露真相',
          mainObjective: '整合所有证据，指控凶手',
          subTasks: [
            { task: '整理所有证据', target: '证据', targetType: 'item', reward: '完整的案件链' },
            { task: '对质凶手', target: '詹姆斯管家', targetType: 'npc', reward: '凶手认罪' }
          ],
          successCondition: '成功指认凶手并说明动机和手法',
          puzzleQuestion: '请完整描述案件经过',
          puzzleAnswer: '詹姆斯管家因挪用资金被发现，用烛台杀害主人并伪装成意外',
          puzzleKeywords: ['詹姆斯', '挪用', '烛台', '意外', '伪装']
        }
      ],
      npcs: [
        { name: '詹姆斯管家', role: '庄园管家', personality: '表面恭敬，内心焦虑', secret: '多年挪用资金', alibi: '声称在厨房准备晚餐', suspicionLevel: 8 },
        { name: '玛丽女仆', role: '庄园女仆', personality: '胆小，但观察力强', secret: '暗恋管家', alibi: '在房间休息', suspicionLevel: 3 },
        { name: '罗伯特侄子', role: '维克多的侄子', personality: '贪婪，急于继承遗产', secret: '欠了赌债', alibi: '在客厅看书', suspicionLevel: 6 }
      ]
    };
  }

  /**
   * 根据大纲生成玩家任务
   */
  async generatePlayerTasks(outline, chapterNumber, players, options = {}) {
    const chapterGoal = outline.chapterGoals?.find(g => g.chapter === chapterNumber);
    if (!chapterGoal) {
      console.warn(`[任务生成] 章节 ${chapterNumber} 目标不存在，使用默认任务`);
      return this.generateDefaultTasks(players, chapterNumber);
    }

    const tasks = [];
    const availableTasks = [...(chapterGoal.subTasks || [])];
    
    // 为每个玩家分配任务
    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      // 循环分配任务，确保每个玩家都有任务
      const taskIndex = i % availableTasks.length;
      const taskTemplate = availableTasks[taskIndex];
      
      tasks.push({
        playerId: player.id,
        playerName: player.username,
        taskType: 'investigation',
        taskTitle: taskTemplate.task,
        taskDescription: `前往${taskTemplate.target}进行调查`,
        taskTarget: taskTemplate.target,
        targetType: taskTemplate.targetType,
        requiredAction: `调查${taskTemplate.target}`,
        requiredKeywords: [taskTemplate.target, '检查', '调查', '查看'],
        rewardClue: taskTemplate.reward,
        rewardInfo: `完成任务后你将获得重要信息`
      });
    }

    return tasks;
  }

  /**
   * 生成默认任务
   */
  generateDefaultTasks(players, chapterNumber) {
    return players.map((player, index) => ({
      playerId: player.id,
      playerName: player.username,
      taskType: 'investigation',
      taskTitle: `调查线索 ${index + 1}`,
      taskDescription: '寻找案件相关的线索',
      taskTarget: '案发现场',
      targetType: 'location',
      requiredAction: '在房间内搜索',
      requiredKeywords: ['搜索', '检查', '调查', '查看'],
      rewardClue: '你发现了一些可疑的痕迹',
      rewardInfo: '继续深入调查'
    }));
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
   * @param {Object} outline - 故事大纲（包含案件真相）
   * @returns {Promise<Object>} { puzzle, playerClues }
   */
  async generatePuzzleAndClues(chapterContent, storyContext, players, options = {}, outline = null) {
    if (!this.provider) {
      throw new Error('AI提供商未初始化');
    }
    await this.ensureProviderAvailability();

    const playerCount = players.length;
    const chapterNum = storyContext.currentChapter || 1;
    
    // ★ 从大纲获取本章的谜题信息 ★
    let chapterGoal = null;
    let correctAnswer = '';
    let answerKeywords = [];
    
    if (outline?.chapterGoals) {
      chapterGoal = outline.chapterGoals[chapterNum - 1];
      if (chapterGoal) {
        correctAnswer = chapterGoal.puzzleAnswer || '';
        answerKeywords = chapterGoal.puzzleKeywords || [];
      }
    }
    
    // 如果大纲中有明确的答案，使用大纲
    if (correctAnswer && answerKeywords.length > 0) {
      console.log(`[谜题生成] 使用大纲中的谜题: ${chapterGoal.puzzleQuestion}`);
      console.log(`[谜题生成] 正确答案: ${correctAnswer}`);
      
      const puzzle = {
        question: chapterGoal.puzzleQuestion,
        correct_answer: correctAnswer,
        answer_keywords: answerKeywords.join('|'),
        difficulty: chapterNum,
        hints: [
          chapterGoal.subTasks?.[0]?.task || '仔细调查案发现场',
          `关键证据在${outline.keyEvidence?.[0]?.location || '某个地方'}`,
          '整合所有玩家的线索'
        ],
        successMessage: `✅ 正确！${chapterGoal.successCondition || '你们找到了关键线索！'}`,
        nextStep: chapterNum < 3 
          ? `请继续调查，准备进入第${chapterNum + 1}章。`
          : '现在可以指认凶手了！'
      };
      
      // 基于大纲为玩家分配线索
      const playerClues = this.distributeCluesFromOutline(players, outline, chapterNum);
      
      return { puzzle, playerClues };
    }

    // 如果没有大纲，使用AI生成（但基于故事内容）
    const systemPrompt = `你是一个剧本杀谜题设计师。根据章节内容设计一个**答案明确唯一**的谜题。

## 核心原则：
1. **问题必须基于章节内容**：问题中提到的人物、地点、物品必须在故事中出现过
2. **答案必须唯一明确**：只有一个正确答案，不能有歧义
3. **答案可验证**：通过关键词匹配可以判断对错
4. **难度递进**：第1章问简单事实，第2章问关联推理，第3章问凶手身份

## 章节${chapterNum}的谜题类型：
${chapterNum === 1 ? '- 问一个在故事中明确提到的事实（如：受害者在哪里被发现？用什么凶器？）' : ''}
${chapterNum === 2 ? '- 问需要关联2-3条线索才能回答的问题（如：谁有作案时间？谁的证词有矛盾？）' : ''}
${chapterNum === 3 ? '- 问凶手是谁及其动机（综合所有证据指认凶手）' : ''}

## 当前玩家：${players.map(p => p.username).join('、')}

## 返回格式（严格JSON）：
{
  "puzzle": {
    "question": "基于故事内容的具体问题（必须能在故事中找到答案）",
    "correct_answer": "明确的唯一答案（如：书房、烛台、詹姆斯管家）",
    "answer_keywords": ["关键词1", "关键词2"],
    "difficulty": ${chapterNum},
    "hints": ["提示1", "提示2"],
    "successMessage": "答对后的鼓励语",
    "nextStep": "下一步应该做什么"
  },
  "playerClues": {
    "${players[0]?.id || 'player1'}": [
      {
        "type": "目击证词",
        "content": "具体线索内容（从故事中提取）",
        "source": "你是如何得知的",
        "relevance": "与答案的关联",
        "canShare": true
      }
    ]
  }
}`;

    const userPrompt = `故事标题：${storyContext.title || '未命名'}
背景：${storyContext.background || '无'}
当前章节：第${chapterNum}章

章节内容：
${chapterContent.substring(0, 2000)}

请基于以上内容设计谜题。
要求：
1. 问题必须能从章节内容中找到答案
2. 答案只有一个，不能模糊
3. 为${playerCount}个玩家各分配1-2条独特线索`;

    try {
      const response = await this.requestQueue.enqueue(
        () => this.provider.callAPI([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ], {
          temperature: 0.5, // 降低随机性，确保答案明确
          max_tokens: 1500
        }),
        {
          priority: options.priority || 2,
          timeout: options.timeout || 30000
        }
      );

      let result = { puzzle: null, playerClues: {} };
      try {
        const content = response.content || response.text || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
          // 确保 answer_keywords 是字符串格式（用于后续匹配）
          if (Array.isArray(result.puzzle?.answer_keywords)) {
            result.puzzle.answer_keywords = result.puzzle.answer_keywords.join('|');
          }
        }
      } catch (parseError) {
        console.error('解析谜题失败，使用默认:', parseError);
        result = this.generateDefaultPuzzleAndClues(players, storyContext, outline);
      }

      // 确保每个玩家都有线索
      for (const player of players) {
        if (!result.playerClues[player.id]) {
          result.playerClues[player.id] = this.generateDefaultCluesForPlayer(player, storyContext);
        }
      }

      return result;
    } catch (error) {
      console.error('生成谜题失败:', error);
      return this.generateDefaultPuzzleAndClues(players, storyContext, outline);
    }
  }
  
  /**
   * 基于大纲为玩家分配线索
   */
  distributeCluesFromOutline(players, outline, chapterNum) {
    const playerClues = {};
    if (!outline) return playerClues;
    
    const keyEvidence = outline.keyEvidence || [];
    const locations = outline.locations || [];
    const npcs = outline.npcs || [];
    
    players.forEach((player, index) => {
      const clues = [];
      
      // 分配一条证据线索
      if (keyEvidence[index % keyEvidence.length]) {
        const evidence = keyEvidence[index % keyEvidence.length];
        clues.push({
          type: '物证发现',
          content: `你在${evidence.location}发现了${evidence.name}：${evidence.description}`,
          source: evidence.discoveryHint || '你仔细搜查时发现的',
          relevance: `第${chapterNum}章关键证据`,
          canShare: true
        });
      }
      
      // 分配一条NPC相关线索
      if (npcs[index % npcs.length]) {
        const npc = npcs[index % npcs.length];
        clues.push({
          type: '人物情报',
          content: `${npc.name}（${npc.role}）：${npc.alibi || npc.secret}`,
          source: '你对此人有所了解',
          relevance: `嫌疑程度：${npc.suspicionLevel || 5}/10`,
          canShare: true
        });
      }
      
      // 分配一条地点线索
      if (locations[index % locations.length]) {
        const loc = locations[index % locations.length];
        clues.push({
          type: '场景观察',
          content: `${loc.name}里有这些可检查的东西：${loc.items?.join('、') || '需要仔细搜查'}`,
          source: '你对这个地方比较熟悉',
          relevance: '调查地点提示',
          canShare: true
        });
      }
      
      playerClues[player.id] = clues;
    });
    
    return playerClues;
  }

  /**
   * 生成默认的谜题和线索（基于大纲）
   */
  generateDefaultPuzzleAndClues(players, storyContext, outline = null) {
    // 如果有大纲，使用大纲信息生成更准确的默认谜题
    if (outline) {
      const chapterNum = storyContext.currentChapter || 1;
      const chapterGoal = outline.chapterGoals?.[chapterNum - 1];
      
      let puzzle;
      if (chapterNum === 1) {
        puzzle = {
          question: `受害者${outline.victimName}是在哪里被发现的？`,
          correct_answer: outline.murderLocation || '书房',
          answer_keywords: outline.murderLocation || '书房',
          difficulty: 1,
          hints: ['仔细阅读故事开头', '案发地点在故事中有明确描述'],
          successMessage: `✅ 正确！${outline.victimName}确实是在${outline.murderLocation}被发现的。`,
          nextStep: '现在去调查案发现场，寻找更多线索。'
        };
      } else if (chapterNum === 2) {
        puzzle = {
          question: `凶手使用了什么凶器或手法？`,
          correct_answer: outline.murderMethod || '未知',
          answer_keywords: outline.murderMethod?.split(/[，。、\s]+/).filter(w => w.length > 1).join('|') || '凶器',
          difficulty: 2,
          hints: ['检查案发现场的物品', '注意异常的痕迹'],
          successMessage: `✅ 正确！作案手法是：${outline.murderMethod}`,
          nextStep: '现在思考谁有这个作案条件和动机。'
        };
      } else {
        puzzle = {
          question: `谁是凶手？说出凶手的名字和作案动机。`,
          correct_answer: `${outline.murdererName}，${outline.murdererMotive}`,
          answer_keywords: `${outline.murdererName}|${outline.murdererMotive?.split(/[，。、\s]+/).filter(w => w.length > 1).slice(0, 3).join('|') || '动机'}`,
          difficulty: 3,
          hints: ['综合所有证据', '谁有动机、时间和条件？', '排除不在场证明成立的人'],
          successMessage: `🎉 恭喜！你们成功破案！凶手是${outline.murdererName}！`,
          nextStep: '真相大白！游戏结束。'
        };
      }
      
      // 使用大纲分配线索
      const playerClues = this.distributeCluesFromOutline(players, outline, chapterNum);
      
      return { puzzle, playerClues };
    }
    
    // 没有大纲时的通用默认谜题
    const puzzle = {
      question: '凶手是谁？请说出凶手的名字。',
      correct_answer: '詹姆斯管家',
      answer_keywords: '詹姆斯|管家|James',
      difficulty: 3,
      hints: ['注意谁有作案时间', '谁的证词有矛盾', '物证指向谁'],
      successMessage: '✅ 正确！你找到了凶手！',
      nextStep: '案件告破，真相大白！'
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
   * 验证玩家对谜题的回答（增强版）
   * 支持从大纲和谜题中获取正确答案
   * @param {string} playerAnswer - 玩家回答
   * @param {Object} puzzle - 谜题对象
   * @param {Object} outline - 故事大纲（可选）
   * @returns {Object} { isCorrect, confidence, feedback }
   */
  async validatePuzzleAnswer(playerAnswer, puzzle, outline = null) {
    // 获取关键词（支持多种格式）
    let keywords = [];
    if (puzzle.answer_keywords) {
      if (typeof puzzle.answer_keywords === 'string') {
        keywords = puzzle.answer_keywords.split('|').map(k => k.trim().toLowerCase());
      } else if (Array.isArray(puzzle.answer_keywords)) {
        keywords = puzzle.answer_keywords.map(k => k.toLowerCase());
      }
    }
    if (puzzle.puzzleKeywords) {
      const parsedKeywords = typeof puzzle.puzzleKeywords === 'string' 
        ? JSON.parse(puzzle.puzzleKeywords) 
        : puzzle.puzzleKeywords;
      keywords = [...keywords, ...parsedKeywords.map(k => k.toLowerCase())];
    }
    
    // ★ 如果有大纲，补充凶手和证据关键词 ★
    if (outline) {
      if (outline.murdererName) {
        keywords.push(outline.murdererName.toLowerCase());
      }
      if (outline.murderMethod) {
        // 提取作案手法中的关键词
        const methodKeywords = outline.murderMethod.match(/[\u4e00-\u9fa5]+/g) || [];
        keywords.push(...methodKeywords.filter(k => k.length >= 2).map(k => k.toLowerCase()));
      }
      if (outline.culprit_id) {
        keywords.push(outline.culprit_id.toLowerCase());
      }
    }
    
    // 去重关键词
    keywords = [...new Set(keywords)].filter(k => k.length > 0);
    
    const answerLower = playerAnswer.toLowerCase();
    const correctAnswer = puzzle.correct_answer || puzzle.puzzleAnswer || '';
    const correctAnswerLower = correctAnswer.toLowerCase();
    
    // 检查关键词匹配
    const matchedKeywords = keywords.filter(k => answerLower.includes(k));
    const keywordMatch = matchedKeywords.length / Math.max(keywords.length, 1);
    
    // 检查是否包含正确答案的核心部分
    const correctAnswerParts = correctAnswerLower.split(/[，。、\s]+/).filter(p => p.length > 1);
    const answerMatch = correctAnswerParts.filter(p => answerLower.includes(p)).length / Math.max(correctAnswerParts.length, 1);
    
    // ★ 特殊判定：如果玩家明确指出了凶手名字 ★
    let isMurdererMentioned = false;
    if (outline?.murdererName) {
      isMurdererMentioned = answerLower.includes(outline.murdererName.toLowerCase());
    }
    
    // 综合评分
    let confidence = (keywordMatch * 0.5 + answerMatch * 0.3 + (isMurdererMentioned ? 0.2 : 0));
    const isCorrect = confidence >= 0.4 || isMurdererMentioned; // 说对凶手即为部分正确

    // ★ 使用谜题中预设的成功消息和下一步指示 ★
    const successMessage = puzzle.success_message || puzzle.successMessage || '✅ 正确！';
    const nextStep = puzzle.next_step || puzzle.nextStep || '继续调查...';
    
    let feedback = '';
    let nextAction = '';
    
    if (isCorrect) {
      if (confidence >= 0.7) {
        feedback = `🎉 **完全正确！**\n\n${successMessage}`;
        nextAction = `\n\n📍 **下一步：** ${nextStep}`;
      } else if (isMurdererMentioned) {
        feedback = `✅ **答对了凶手！** 你找到了关键人物！\n\n再想想动机和手法来完善你的推理。`;
        nextAction = `\n\n💡 **提示：** 尝试描述凶手的作案动机和方法。`;
      } else {
        feedback = `✅ **基本正确！**\n\n${successMessage}`;
        nextAction = `\n\n📍 **下一步：** ${nextStep}`;
      }
      feedback += nextAction;
    } else if (confidence >= 0.2) {
      feedback = `🤔 **接近了**，但还差一些关键信息...\n\n正确答案应该包含：${keywords.slice(0, 2).join('、')}等关键信息。`;
    } else {
      feedback = `❌ 这个答案似乎偏离了方向。\n\n💡 **提示：** 试着重新审视案发现场和已收集的证据，与其他玩家交流线索。`;
    }

    console.log(`[答案验证] 玩家答案: "${playerAnswer.substring(0, 50)}..."
  - 关键词匹配: ${matchedKeywords.join(', ')} (${Math.round(keywordMatch * 100)}%)
  - 答案匹配: ${Math.round(answerMatch * 100)}%
  - 提到凶手: ${isMurdererMentioned}
  - 综合得分: ${Math.round(confidence * 100)}%
  - 结果: ${isCorrect ? '正确' : '错误'}`);

    return {
      isCorrect,
      confidence,
      matchedKeywords,
      feedback,
      isMurdererMentioned,
      nextStep: isCorrect ? nextStep : null,
      successMessage: isCorrect ? successMessage : null
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
    const { 
      clues = [], 
      puzzleProgress = null, 
      revealedClues = [], 
      puzzle = null,
      outline = null,  // ★ 新增：故事大纲
      tasks = [],      // ★ 新增：玩家任务
      chapterObjective = null  // ★ 新增：章节目标
    } = playerState;

    // 分析玩家输入意图
    const intent = this.analyzePlayerIntent(playerInput);
    
    // ★ 检查玩家是否在尝试调查特定地点或物品 ★
    const investigationTarget = this.detectInvestigationTarget(playerInput, outline);

    // 选择要揭示的下一条线索
    const nextClue = clues.find(c => !revealedClues.includes(c.id));

    // ★ 构建可交互地点和物品信息 ★
    let locationsInfo = '';
    let itemsInfo = '';
    let investigationResult = null;
    
    if (outline) {
      // 构建地点列表
      if (outline.locations) {
        locationsInfo = outline.locations.map(loc => 
          `- ${loc.name}：${loc.description}${loc.items?.length ? `（可检查：${loc.items.join('、')}）` : ''}`
        ).join('\n');
      }
      
      // 构建可交互物品列表
      if (outline.interactableItems) {
        itemsInfo = outline.interactableItems.map(item => 
          `- ${item.name}（${item.location}）：检查后可发现 → ${item.hiddenInfo}`
        ).join('\n');
      }
      
      // ★ 如果玩家在调查特定目标，匹配结果 ★
      if (investigationTarget.found) {
        if (investigationTarget.type === 'location') {
          const location = outline.locations?.find(l => 
            l.name.includes(investigationTarget.target) || investigationTarget.target.includes(l.name)
          );
          if (location) {
            investigationResult = {
              type: 'location',
              name: location.name,
              description: location.description,
              items: location.items,
              cluesHere: location.cluesHere
            };
          }
        } else if (investigationTarget.type === 'item') {
          const item = outline.interactableItems?.find(i => 
            i.name.includes(investigationTarget.target) || investigationTarget.target.includes(i.name)
          );
          if (item) {
            investigationResult = {
              type: 'item',
              name: item.name,
              location: item.location,
              hiddenInfo: item.hiddenInfo
            };
          }
        }
      }
    }

    let systemPrompt = `你是剧本杀游戏的"故事机"，一个神秘的知情者。

## 你的角色：
- 你知道所有真相，但不会直接说出凶手
- 你通过引导和暗示帮助玩家调查
- 当玩家调查正确的地点/物品时，给予有价值的发现
- 当玩家问去哪里调查时，给出明确的地点建议

## 当前案件：
- 案件名称：${context.title || '未命名案件'}
- 案件背景：${context.background || '无'}
${outline ? `- 案件类型：${outline.caseType}
- 受害者：${outline.victimName}
- 案发地点：${outline.murderLocation}
- 案发时间：${outline.murderTime}` : ''}

## 玩家可调查的地点：
${locationsInfo}

## 可检查的物品和发现：
${itemsInfo || '暂无物品信息'}

## 关键证据位置（隐藏信息，不直接告知玩家）：
${outline?.keyEvidence?.map(e => `- ${e.name} 在 ${e.location}：${e.description}`).join('\n') || '暂无'}

## 这个玩家的状态：
- 已获得线索数：${revealedClues.length}/${clues.length}
${puzzle ? `- 当前谜题：${puzzle.puzzle_question || puzzle.question}` : ''}
${chapterObjective ? `- 本章目标：${chapterObjective.description}` : ''}

## 玩家的意图分析：
${intent.type === 'ask_clue' ? '玩家想获取线索' : ''}
${intent.type === 'answer_puzzle' ? '玩家在尝试解谜' : ''}
${intent.type === 'ask_help' ? '玩家请求帮助' : ''}
${intent.type === 'investigate' ? `玩家正在调查：${investigationTarget.target}` : ''}
${intent.type === 'chat' ? '玩家在闲聊或探索' : ''}

`;

    // ★ 如果玩家在调查，给出发现 ★
    if (investigationResult) {
      if (investigationResult.type === 'location') {
        systemPrompt += `
## 🔍 玩家正在调查地点：${investigationResult.name}
描述这个地点的场景，然后告诉玩家这里有什么可以检查的：
- 可检查物品：${investigationResult.items?.join('、') || '暂无'}
- 这里可能发现的线索：${investigationResult.cluesHere?.join('、') || '需要仔细搜查'}

请生动描述场景，并明确告诉玩家可以检查什么。`;
      } else if (investigationResult.type === 'item') {
        systemPrompt += `
## 🔍 玩家正在检查物品：${investigationResult.name}
地点：${investigationResult.location}
玩家检查后发现：${investigationResult.hiddenInfo}

请用戏剧性的方式描述这个发现，让玩家感到有所收获！`;
      }
    } else if (intent.type === 'ask_clue' || intent.type === 'ask_help') {
      // 根据意图添加具体指导
      if (nextClue) {
        systemPrompt += `
## 你要透露的线索：
- 类型：${nextClue.type}
- 内容：${nextClue.content}
- 来源：${nextClue.source}

请用谜语或暗示的方式透露这条线索，不要直接说出。`;
      } else if (outline?.locations) {
        // ★ 关键改进：告诉玩家去哪里调查 ★
        const suggestedLocation = outline.locations.find(l => l.cluesHere?.length > 0) || outline.locations[0];
        const unvisitedEvidence = outline.keyEvidence?.find(e => !revealedClues.some(c => c.content?.includes(e.name)));
        
        systemPrompt += `
## 引导玩家调查：
建议玩家去的地点：${suggestedLocation?.name || '案发现场'}
原因：${suggestedLocation?.description || '可能有线索'}
${unvisitedEvidence ? `暗示：${unvisitedEvidence.discoveryHint}` : ''}

请用神秘但明确的方式告诉玩家应该去哪里调查，例如：
"也许你应该去${suggestedLocation?.name}看看...那里似乎隐藏着某些东西..."`;
      } else {
        systemPrompt += `
## 注意：暂无具体线索可揭示
请引导玩家：
1. 建议调查案发现场（书房/客厅等）
2. 提示可以检查物品（书桌、抽屉、壁炉等）
3. 鼓励与其他玩家交流`;
      }
    } else if (intent.type === 'answer_puzzle' && puzzle) {
      systemPrompt += `
## 谜题验证：
正确答案：${puzzle.correct_answer || puzzle.puzzleAnswer}
关键词：${puzzle.answer_keywords || puzzle.puzzleKeywords || []}

判断规则：
1. 如果玩家说对了凶手名字和大致动机，判定正确
2. 如果只对了一部分，给予鼓励并提示差什么
3. 如果完全错误，引导重新思考`;
    }

    systemPrompt += `

## 回应风格：
- 神秘而富有暗示性
- 回复控制在100-200字
- 如果玩家问去哪里调查，一定要给出具体地点名称
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
          max_tokens: 400
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
      result.investigationResult = investigationResult; // ★ 新增：调查结果

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      throw this.standardizeError(error, duration);
    }
  }
  
  /**
   * 检测玩家是否在尝试调查特定地点或物品
   */
  detectInvestigationTarget(input, outline) {
    if (!outline) {
      return { found: false };
    }
    
    const lowerInput = input.toLowerCase();
    
    // 调查地点的关键词
    const locationKeywords = ['去', '到', '调查', '搜查', '前往', '进入', '查看'];
    // 检查物品的关键词
    const itemKeywords = ['检查', '查看', '翻找', '打开', '仔细看', '观察', '搜索'];
    
    // 检查是否在调查地点
    if (locationKeywords.some(k => lowerInput.includes(k))) {
      for (const loc of (outline.locations || [])) {
        if (lowerInput.includes(loc.name.toLowerCase()) || lowerInput.includes(loc.name)) {
          return { found: true, type: 'location', target: loc.name };
        }
      }
    }
    
    // 检查是否在检查物品
    if (itemKeywords.some(k => lowerInput.includes(k))) {
      for (const item of (outline.interactableItems || [])) {
        if (lowerInput.includes(item.name.toLowerCase()) || lowerInput.includes(item.name)) {
          return { found: true, type: 'item', target: item.name };
        }
      }
      // 也检查地点中的物品
      for (const loc of (outline.locations || [])) {
        for (const item of (loc.items || [])) {
          if (lowerInput.includes(item.toLowerCase()) || lowerInput.includes(item)) {
            return { found: true, type: 'item', target: item };
          }
        }
      }
    }
    
    return { found: false };
  }

  /**
   * 分析玩家输入的意图
   */
  analyzePlayerIntent(input) {
    const lowerInput = input.toLowerCase();
    
    // 调查地点/物品的关键词（优先级最高）
    const investigateKeywords = ['去', '到', '调查', '搜查', '前往', '进入', '检查', '查看', '翻找', '打开', '仔细看', '观察', '搜索'];
    // 询问线索的关键词
    const clueKeywords = ['线索', '证据', '发现', '看到', '听到', '告诉我', '有什么', '知道什么', '信息', '去哪', '哪里找'];
    // 尝试解谜的关键词
    const puzzleKeywords = ['凶手是', '答案是', '我认为', '我猜', '真相是', '是因为', '动机是', '杀了', '杀害', '嫌疑人'];
    // 请求帮助的关键词
    const helpKeywords = ['帮助', '提示', '不知道', '想不出', '没头绪', '给点提示', '怎么办', '下一步'];

    // 优先检查是否在调查
    if (investigateKeywords.some(k => lowerInput.includes(k))) {
      return { type: 'investigate', confidence: 0.9 };
    }
    if (puzzleKeywords.some(k => lowerInput.includes(k))) {
      return { type: 'answer_puzzle', confidence: 0.8 };
    }
    if (clueKeywords.some(k => lowerInput.includes(k))) {
      return { type: 'ask_clue', confidence: 0.8 };
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
4. **案件必备**：第一章必须有明确的案件（凶杀/失踪/盗窃）和受害者

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
  "chapterContent": "章节正文内容（300-500字，使用[NPC:名称]和[玩家:名称]标记。第一章必须包含：1.案件发生 2.受害者描述 3.嫌疑人出场）",
  "newCharacters": [
    {
      "name": "角色名",
      "type": "npc 或 victim（受害者）或 suspect（嫌疑人）",
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
