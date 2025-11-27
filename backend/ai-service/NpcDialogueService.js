/**
 * NPC AI 对话服务
 * 让AI以角色的人格进行对话，支持公聊和私聊的差异化回应
 */

import scriptDatabase from '../script-factory/database.js';

/**
 * NPC对话服务类
 */
class NpcDialogueService {
  constructor(aiProvider) {
    this.aiProvider = aiProvider;
  }

  /**
   * 设置AI提供者
   */
  setAIProvider(provider) {
    this.aiProvider = provider;
  }

  /**
   * 生成NPC对话回应
   * @param {Object} params - 对话参数
   * @param {string} params.scriptId - 剧本ID
   * @param {string} params.npcCharacterId - NPC角色ID
   * @param {string} params.playerMessage - 玩家消息
   * @param {string} params.playerName - 玩家名称
   * @param {boolean} params.isPrivate - 是否私聊
   * @param {Object} params.gameContext - 游戏上下文
   */
  async generateNpcResponse(params) {
    const { scriptId, npcCharacterId, playerMessage, playerName, isPrivate, gameContext } = params;

    // 获取NPC人格档案
    const persona = await scriptDatabase.getNpcPersona(npcCharacterId);
    if (!persona) {
      return this.generateGenericResponse(playerMessage, isPrivate);
    }

    // 获取角色基本信息
    const characters = await scriptDatabase.getScriptCharacters(scriptId);
    const npcCharacter = characters.find(c => c.id === npcCharacterId);
    
    // 获取真相信息（用于判断NPC应该透露什么）
    const truth = await scriptDatabase.getScriptTruth(scriptId);
    
    // 获取故事层级（判断当前可揭示的内容）
    const storyLayers = await scriptDatabase.getStoryLayers(scriptId);

    // 构建系统提示
    const systemPrompt = this.buildNpcSystemPrompt({
      character: npcCharacter,
      persona,
      truth,
      storyLayers,
      isPrivate,
      currentChapter: gameContext?.currentChapter || 1,
      isMurderer: npcCharacter?.is_murderer
    });

    // 构建对话消息
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `[${playerName}对你说]: ${playerMessage}` }
    ];

    try {
      const response = await this.aiProvider.callAPI(messages, {
        temperature: 0.8,
        max_tokens: 400
      });

      const content = response.content || response.text || '';
      
      return {
        success: true,
        response: this.postProcessResponse(content, persona, isPrivate),
        npcName: npcCharacter?.name,
        emotionalTone: this.detectEmotionalTone(content),
        revealedInfo: this.detectRevealedInfo(content, persona)
      };
    } catch (error) {
      console.error('[NPC对话] AI调用失败:', error.message);
      return this.generateFallbackResponse(npcCharacter, isPrivate);
    }
  }

  /**
   * 构建NPC系统提示
   */
  buildNpcSystemPrompt({ character, persona, truth, storyLayers, isPrivate, currentChapter, isMurderer }) {
    const behaviorMode = isPrivate ? persona.private_behavior : persona.public_behavior;
    const catchphrases = persona.catchphrases?.join('、') || '';
    
    let prompt = `你正在扮演剧本杀游戏中的一个角色。请完全沉浸在角色中进行对话。

## 角色基本信息
- 姓名：${character?.name || '神秘人物'}
- 职业：${character?.occupation || '未知'}
- 性格特点：${persona.personality_traits?.join('、') || '谨慎'}
- 说话风格：${persona.speaking_style || '正常'}
- 口头禅：${catchphrases || '无特殊口头禅'}

## 当前行为模式
${behaviorMode || '正常交谈'}

## 角色立场
${persona.stance || '中立观望'}

## 你知道的秘密（仅供参考）
${persona.known_secrets?.map((s, i) => `${i + 1}. ${s}`).join('\n') || '无特殊秘密'}

## 不愿透露的信息（绝对不要主动说出）
${persona.hidden_info?.map((h, i) => `${i + 1}. ${h}`).join('\n') || '无'}

## 可以被套出的信息（如果对方问得巧妙可以透露）
${persona.revealable_info?.map((r, i) => `${i + 1}. ${r}`).join('\n') || '无'}`;

    // 如果是凶手，添加特殊指导
    if (isMurderer) {
      prompt += `

## 【重要】你是凶手！
- 作案动机：${truth?.murder_motive || '有自己的理由'}
- 你必须掩饰自己的罪行
- 可以适当转移话题或暗示其他人可疑
- 保持表面的镇定和配合
- 如果被追问关键问题，可以表现出适度的回避或困惑`;
    }

    // 添加对话场景说明
    prompt += `

## 对话场景
这是${isPrivate ? '私下交谈' : '公开场合'}。
当前是第${currentChapter}章。

## 回复要求
1. 用第一人称回复，完全以角色身份说话
2. 回复要自然，像真人对话
3. 可以使用你的口头禅
4. 根据${isPrivate ? '私下' : '公开'}场合调整措辞
5. 长度控制在50-150字
6. 不要在回复中暴露你的元信息（如"我是AI"等）
7. 如果被问到不想透露的信息，要自然地回避`;

    return prompt;
  }

  /**
   * 后处理响应
   */
  postProcessResponse(content, persona, isPrivate) {
    // 移除可能的角色名前缀
    let processed = content.replace(/^[\[【].*?[\]】][:：]?\s*/g, '');
    
    // 如果响应太短，添加一些性格化的补充
    if (processed.length < 20 && persona.catchphrases?.length > 0) {
      const catchphrase = persona.catchphrases[Math.floor(Math.random() * persona.catchphrases.length)];
      processed = `${catchphrase}${processed}`;
    }
    
    return processed.trim();
  }

  /**
   * 检测情感色调
   */
  detectEmotionalTone(content) {
    const tones = {
      nervous: ['紧张', '不安', '慌', '急', '颤'],
      angry: ['怒', '气', '烦', '恼', '讨厌'],
      sad: ['难过', '悲伤', '哀', '痛', '可惜'],
      suspicious: ['奇怪', '可疑', '怀疑', '不对劲'],
      cooperative: ['帮忙', '配合', '当然', '没问题'],
      defensive: ['不是我', '冤枉', '解释', '误会']
    };

    for (const [tone, keywords] of Object.entries(tones)) {
      if (keywords.some(kw => content.includes(kw))) {
        return tone;
      }
    }
    return 'neutral';
  }

  /**
   * 检测是否透露了信息
   */
  detectRevealedInfo(content, persona) {
    const revealableInfo = persona.revealable_info || [];
    const revealed = [];
    
    for (const info of revealableInfo) {
      // 简单检测关键词匹配
      const keywords = info.split(/[，。、]/).filter(k => k.length >= 2);
      if (keywords.some(kw => content.includes(kw))) {
        revealed.push(info);
      }
    }
    
    return revealed;
  }

  /**
   * 生成通用响应（无人格档案时）
   */
  generateGenericResponse(playerMessage, isPrivate) {
    const responses = isPrivate ? [
      '这个...我不太方便说。',
      '你为什么要问这个？',
      '我需要想一想...',
      '这件事，我只能告诉你这么多。'
    ] : [
      '这个问题很有意思。',
      '大家都在调查，我也很想知道真相。',
      '让我们继续找线索吧。',
      '这确实是个值得关注的问题。'
    ];
    
    return {
      success: true,
      response: responses[Math.floor(Math.random() * responses.length)],
      npcName: '神秘人物',
      emotionalTone: 'neutral',
      revealedInfo: []
    };
  }

  /**
   * 生成备用响应（AI失败时）
   */
  generateFallbackResponse(character, isPrivate) {
    const name = character?.name || '对方';
    const fallbacks = isPrivate ? [
      `${name}似乎有些犹豫，不确定该如何回答你。`,
      `${name}沉默了片刻，似乎在思考着什么。`,
      `${name}欲言又止，最终只是轻轻摇了摇头。`
    ] : [
      `${name}环顾四周，似乎不想在这里讨论这个话题。`,
      `${name}礼貌地笑了笑，但没有直接回答。`,
      `${name}转移了话题，似乎对这个问题有所保留。`
    ];
    
    return {
      success: false,
      response: fallbacks[Math.floor(Math.random() * fallbacks.length)],
      npcName: name,
      emotionalTone: 'evasive',
      revealedInfo: []
    };
  }

  /**
   * 生成NPC之间的互动对话
   * 用于创造氛围和推动剧情
   */
  async generateNpcInteraction(scriptId, npcId1, npcId2, topic, gameContext) {
    const [persona1, persona2] = await Promise.all([
      scriptDatabase.getNpcPersona(npcId1),
      scriptDatabase.getNpcPersona(npcId2)
    ]);

    const characters = await scriptDatabase.getScriptCharacters(scriptId);
    const char1 = characters.find(c => c.id === npcId1);
    const char2 = characters.find(c => c.id === npcId2);

    if (!char1 || !char2) {
      return null;
    }

    const prompt = `请模拟两个角色之间关于"${topic}"的简短对话。

角色1: ${char1.name}
- 性格: ${persona1?.personality_traits?.join('、') || '正常'}
- 说话风格: ${persona1?.speaking_style || '正常'}

角色2: ${char2.name}
- 性格: ${persona2?.personality_traits?.join('、') || '正常'}
- 说话风格: ${persona2?.speaking_style || '正常'}

请生成3-4轮对话，格式如下:
${char1.name}: 对话内容
${char2.name}: 对话内容
...`;

    try {
      const response = await this.aiProvider.callAPI([
        { role: 'system', content: '你是一个擅长角色扮演的编剧，正在为剧本杀游戏创作NPC对话。' },
        { role: 'user', content: prompt }
      ], {
        temperature: 0.8,
        max_tokens: 400
      });

      return {
        success: true,
        dialogue: response.content || response.text,
        participants: [char1.name, char2.name]
      };
    } catch (error) {
      console.error('[NPC互动] 生成失败:', error.message);
      return null;
    }
  }

  /**
   * 生成NPC的情绪反应
   * 用于关键剧情点
   */
  async generateEmotionalReaction(scriptId, npcCharacterId, event, gameContext) {
    const persona = await scriptDatabase.getNpcPersona(npcCharacterId);
    const characters = await scriptDatabase.getScriptCharacters(scriptId);
    const character = characters.find(c => c.id === npcCharacterId);

    if (!character) {
      return null;
    }

    // 获取角色的情感弧线
    const emotionalArcs = await scriptDatabase.getEmotionalArcs(scriptId, npcCharacterId);
    const currentArc = emotionalArcs.find(a => a.arc_chapter === gameContext?.currentChapter);

    const prompt = `角色${character.name}对以下事件做出情绪反应：

事件：${event}

角色信息：
- 当前情绪状态：${currentArc?.emotional_state || '正常'}
- 性格特点：${persona?.personality_traits?.join('、') || '正常'}
- 是否凶手：${character.is_murderer ? '是（需要伪装）' : '否'}

请生成一段简短的情绪反应描述（30-60字），包括:
1. 表情变化
2. 肢体语言
3. 可能说的话（可选）`;

    try {
      const response = await this.aiProvider.callAPI([
        { role: 'system', content: '你是一个专业的剧本杀主持人，擅长描述角色的情绪反应。' },
        { role: 'user', content: prompt }
      ], {
        temperature: 0.7,
        max_tokens: 150
      });

      return {
        success: true,
        characterName: character.name,
        reaction: response.content || response.text,
        isMurderer: character.is_murderer
      };
    } catch (error) {
      console.error('[情绪反应] 生成失败:', error.message);
      return {
        success: false,
        characterName: character.name,
        reaction: `${character.name}的表情微微变化，但很快恢复如常。`,
        isMurderer: character.is_murderer
      };
    }
  }

  /**
   * 检测玩家是否触发了关键信息
   */
  async checkTriggerResponse(scriptId, npcCharacterId, playerMessage) {
    const persona = await scriptDatabase.getNpcPersona(npcCharacterId);
    if (!persona || !persona.trigger_responses) {
      return null;
    }

    const triggers = persona.trigger_responses;
    const lowerMessage = playerMessage.toLowerCase();

    for (const [trigger, response] of Object.entries(triggers)) {
      if (lowerMessage.includes(trigger.toLowerCase())) {
        return {
          triggered: true,
          trigger,
          response
        };
      }
    }

    return null;
  }
}

// 创建单例
let npcDialogueServiceInstance = null;

export function getNpcDialogueService(aiProvider = null) {
  if (!npcDialogueServiceInstance) {
    npcDialogueServiceInstance = new NpcDialogueService(aiProvider);
  } else if (aiProvider) {
    npcDialogueServiceInstance.setAIProvider(aiProvider);
  }
  return npcDialogueServiceInstance;
}

export default NpcDialogueService;
