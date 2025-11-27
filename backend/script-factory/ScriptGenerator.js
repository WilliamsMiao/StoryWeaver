/**
 * 剧本生成器 - 核心服务
 * 一键生成完整的剧本杀剧本
 */

import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import scriptDatabase from './database.js';

// 主题模板库
const THEME_TEMPLATES = {
  mansion_murder: {
    name: '庄园谋杀',
    description: '经典的封闭庄园谋杀案',
    settings: ['维多利亚庄园', '现代别墅', '古堡', '乡村大宅'],
    victimTypes: ['富有的庄园主', '神秘的遗产继承人', '著名收藏家'],
    murdererMotives: ['遗产争夺', '复仇', '隐藏秘密', '情杀'],
    atmosphere: '阴暗、神秘、充满家族秘辛'
  },
  corporate_secrets: {
    name: '公司机密',
    description: '商业世界的阴谋与背叛',
    settings: ['科技公司总部', '金融大厦', '制药公司', '律师事务所'],
    victimTypes: ['CEO', '首席科学家', '财务总监', '创始合伙人'],
    murdererMotives: ['商业竞争', '内部斗争', '泄密威胁', '股权纠纷'],
    atmosphere: '紧张、高压、利益纠葛'
  },
  historical_mystery: {
    name: '历史悬疑',
    description: '穿越时空的神秘案件',
    settings: ['民国上海', '唐朝长安', '清朝紫禁城', '二战时期'],
    victimTypes: ['富商', '官员', '名伶', '学者'],
    murdererMotives: ['家族恩怨', '政治阴谋', '爱恨情仇', '宝藏争夺'],
    atmosphere: '年代感、文化底蕴、时代特色'
  },
  campus_mystery: {
    name: '校园悬疑',
    description: '象牙塔里的秘密',
    settings: ['名牌大学', '私立高中', '艺术学院', '医学院'],
    victimTypes: ['知名教授', '学生会长', '校园名人', '神秘转学生'],
    murdererMotives: ['学术造假', '霸凌报复', '感情纠葛', '家族恩怨'],
    atmosphere: '青春、秘密、成长'
  },
  supernatural: {
    name: '超自然悬疑',
    description: '真相与超自然的边界',
    settings: ['闹鬼旅馆', '神秘村落', '废弃医院', '古老寺庙'],
    victimTypes: ['灵媒', '调查记者', '探险家', '神秘学者'],
    murdererMotives: ['邪教阴谋', '隐藏真相', '诅咒复仇', '灵异掩盖'],
    atmosphere: '诡异、惊悚、亦真亦假'
  }
};

// 角色原型库
const CHARACTER_ARCHETYPES = [
  { type: 'heir', name: '继承人', traits: ['野心勃勃', '表面温和'], secretPotential: '对遗产有隐秘企图' },
  { type: 'servant', name: '仆人/助理', traits: ['忠诚', '观察力强'], secretPotential: '知道主人的秘密' },
  { type: 'rival', name: '竞争对手', traits: ['精明', '有城府'], secretPotential: '有不可告人的过去' },
  { type: 'lover', name: '情人/伴侣', traits: ['感性', '善于隐藏'], secretPotential: '隐秘的感情关系' },
  { type: 'friend', name: '老友', traits: ['了解受害者', '看似无害'], secretPotential: '旧日恩怨' },
  { type: 'professional', name: '专业人士', traits: ['理性', '有专业知识'], secretPotential: '职业相关的秘密' },
  { type: 'outsider', name: '外来者', traits: ['神秘', '来历不明'], secretPotential: '隐藏的真实身份' },
  { type: 'relative', name: '亲属', traits: ['有血缘关系', '复杂感情'], secretPotential: '家族秘密' }
];

// 线索类型库
const CLUE_TYPES = {
  physical: { name: '物证', examples: ['凶器', '血迹', '指纹', '衣物纤维', '脚印'] },
  testimony: { name: '证词', examples: ['目击证言', '不在场证明', '矛盾陈述'] },
  document: { name: '文件', examples: ['遗嘱', '信件', '日记', '合同', '账本'] },
  digital: { name: '数字证据', examples: ['监控录像', '通话记录', '邮件', '社交媒体'] },
  circumstantial: { name: '情况证据', examples: ['动机', '时间线', '行为异常'] }
};

// 叙事诡计模板库
const NARRATIVE_TRICKS = {
  physical: {
    name: '物理诡计',
    types: [
      { name: '密室杀人', description: '看似密闭的空间实际存在未被发现的出入口' },
      { name: '时间误差', description: '利用钟表错误或时区差异制造不在场证明' },
      { name: '凶器消失', description: '凶器以意想不到的方式被隐藏或销毁' },
      { name: '死亡时间伪装', description: '通过特殊手段使死亡时间被误判' }
    ]
  },
  narrative: {
    name: '叙述诡计',
    types: [
      { name: '身份诡计', description: '某人的真实身份与表面身份不符' },
      { name: '叙述者不可靠', description: '提供信息的人故意或无意地误导' },
      { name: '双重身份', description: '一个人同时扮演两个角色' },
      { name: '死者未死', description: '被认为死亡的人其实还活着' }
    ]
  },
  cognitive: {
    name: '认知诡计',
    types: [
      { name: '先入为主', description: '利用玩家的固有认知制造误导' },
      { name: '注意力转移', description: '用明显的嫌疑转移对真凶的注意' },
      { name: '逻辑陷阱', description: '看似合理的推理实际指向错误方向' },
      { name: '情感操控', description: '利用同情心使玩家忽视真相' }
    ]
  }
};

// 角色技能库
const CHARACTER_SKILLS = {
  detective: { name: '侦探直觉', type: 'investigation', description: '每章可以向AI询问一条关于某人的隐藏信息' },
  hacker: { name: '信息入侵', type: 'information', description: '可以获取原本不属于自己的一条线索' },
  psychologist: { name: '微表情分析', type: 'deduction', description: '可以判断某人最近一次发言是否有所隐瞒' },
  charmer: { name: '社交达人', type: 'social', description: '与NPC对话时可以获得额外信息' },
  observer: { name: '细节观察', type: 'investigation', description: '搜索地点时有更高概率发现隐藏物品' },
  insider: { name: '内部消息', type: 'information', description: '游戏开始时额外获得一条关于案件的提示' },
  negotiator: { name: '谈判专家', type: 'social', description: '可以说服另一玩家分享一条线索' },
  analyst: { name: '数据分析', type: 'deduction', description: '可以验证某条线索是否指向真凶' }
};

class ScriptGenerator extends EventEmitter {
  constructor(aiProvider = null) {
    super();
    this.aiProvider = aiProvider;
  }

  /**
   * 设置AI提供者
   */
  setAIProvider(provider) {
    this.aiProvider = provider;
  }

  /**
   * 发射进度事件
   */
  emitProgress(type, data) {
    this.emit('progress', { type, ...data, timestamp: new Date().toISOString() });
  }

  /**
   * 一键生成完整剧本
   */
  async generateScript(options = {}) {
    const {
      theme = 'mansion_murder',
      playerCount = 4,
      difficulty = 3,
      title = null,
      customBackground = null
    } = options;

    console.log(`[剧本生成器] 开始生成剧本: 主题=${theme}, 玩家数=${playerCount}, 难度=${difficulty}`);
    this.emitProgress('start', { theme, playerCount, difficulty });

    const scriptId = uuidv4();
    const themeTemplate = THEME_TEMPLATES[theme] || THEME_TEMPLATES.mansion_murder;
    
    // ★ 关键：角色数量独立于玩家人数
    // 单人/双人游戏：玩家扮演侦探，需要 4-6 个 NPC 嫌疑人
    // 多人游戏：玩家扮演嫌疑人角色
    const isSoloMode = playerCount <= 2;
    const characterCount = isSoloMode ? Math.max(4, 3 + difficulty) : Math.max(playerCount, 4);

    try {
      // Step 1: 生成基本框架
      console.log('[剧本生成器] Step 1: 生成基本框架...');
      this.emitProgress('step', { step: 1, description: '生成基本框架' });
      const framework = await this.generateFramework(themeTemplate, playerCount, difficulty, customBackground, isSoloMode);
      this.emitProgress('progress', { message: `框架生成完成: ${framework.title}` });

      // Step 2: 创建剧本主记录
      console.log('[剧本生成器] Step 2: 创建剧本记录...');
      this.emitProgress('step', { step: 2, description: '创建剧本记录' });
      await scriptDatabase.createScript({
        id: scriptId,
        title: title || framework.title,
        subtitle: framework.subtitle,
        description: framework.description,
        minPlayers: playerCount,
        maxPlayers: isSoloMode ? playerCount : playerCount + 2,
        recommendedPlayers: playerCount,
        difficulty: difficulty,
        estimatedDuration: 90 + (difficulty * 15),
        theme: theme,
        tags: [themeTemplate.name, isSoloMode ? '侦探模式' : `${playerCount}人本`, `难度${difficulty}`],
        author: 'AI剧本工厂',
        isSoloMode: isSoloMode // 标记是否为侦探模式
      });
      this.emitProgress('progress', { message: '剧本记录已创建' });

      // Step 3: 生成案件真相
      console.log('[剧本生成器] Step 3: 生成案件真相...');
      this.emitProgress('step', { step: 3, description: '生成案件真相' });
      const truth = await this.generateTruth(scriptId, framework, themeTemplate);
      this.emitProgress('progress', { message: `真相生成完成: ${truth.victimName}遇害` });

      // Step 4: 生成角色（使用 characterCount 而非 playerCount）
      console.log('[剧本生成器] Step 4: 生成角色...');
      this.emitProgress('step', { step: 4, description: '生成角色' });
      const characters = await this.generateCharacters(scriptId, framework, truth, characterCount, isSoloMode);
      this.emitProgress('progress', { message: `角色生成完成: ${characters.length}个角色` });

      // Step 5: 生成人物关系
      console.log('[剧本生成器] Step 5: 生成人物关系...');
      this.emitProgress('step', { step: 5, description: '生成人物关系' });
      await this.generateRelationships(scriptId, characters, truth);
      this.emitProgress('progress', { message: '人物关系网络构建完成' });

      // Step 6: 生成地点
      console.log('[剧本生成器] Step 6: 生成地点...');
      this.emitProgress('step', { step: 6, description: '生成地点' });
      const locations = await this.generateLocations(scriptId, framework, themeTemplate);
      this.emitProgress('progress', { message: `地点生成完成: ${locations.length}个场景` });

      // Step 7: 生成线索
      console.log('[剧本生成器] Step 7: 生成线索...');
      this.emitProgress('step', { step: 7, description: '生成线索' });
      const clues = await this.generateClues(scriptId, truth, characters, locations);
      this.emitProgress('progress', { message: `线索生成完成: ${clues.length}条线索` });

      // Step 8: 生成章节
      console.log('[剧本生成器] Step 8: 生成章节...');
      this.emitProgress('step', { step: 8, description: '生成章节' });
      const chapters = await this.generateChapters(scriptId, framework, truth, characters, clues, locations);
      this.emitProgress('progress', { message: `章节生成完成: ${chapters.length}个章节` });

      // Step 9: 生成谜题
      console.log('[剧本生成器] Step 9: 生成谜题...');
      this.emitProgress('step', { step: 9, description: '生成谜题' });
      await this.generatePuzzles(scriptId, chapters, truth, clues);
      this.emitProgress('progress', { message: '谜题系统生成完成' });

      // Step 10: 生成叙事诡计
      console.log('[剧本生成器] Step 10: 生成叙事诡计...');
      this.emitProgress('step', { step: 10, description: '生成叙事诡计' });
      await this.generateNarrativeTricks(scriptId, truth, characters, difficulty);
      this.emitProgress('progress', { message: '叙事诡计设计完成' });

      // Step 11: 生成多层故事结构
      console.log('[剧本生成器] Step 11: 生成多层故事结构...');
      this.emitProgress('step', { step: 11, description: '生成多层故事结构' });
      await this.generateStoryLayers(scriptId, truth, characters, framework);
      this.emitProgress('progress', { message: '三层故事结构构建完成' });

      // Step 12: 生成角色技能
      console.log('[剧本生成器] Step 12: 生成角色技能...');
      this.emitProgress('step', { step: 12, description: '生成角色技能' });
      await this.generateCharacterSkills(scriptId, characters);
      this.emitProgress('progress', { message: '角色技能系统生成完成' });

      // Step 13: 生成NPC人格档案
      console.log('[剧本生成器] Step 13: 生成NPC人格档案...');
      this.emitProgress('step', { step: 13, description: '生成NPC人格档案' });
      await this.generateNpcPersonas(scriptId, characters, truth);
      this.emitProgress('progress', { message: 'NPC人格档案创建完成' });

      // Step 14: 生成情感弧线
      console.log('[剧本生成器] Step 14: 生成情感弧线...');
      this.emitProgress('step', { step: 14, description: '生成情感弧线' });
      await this.generateEmotionalArcs(scriptId, characters, chapters.length);
      this.emitProgress('progress', { message: '角色情感弧线设计完成' });

      // Step 15: 生成分支剧情和多结局
      console.log('[剧本生成器] Step 15: 生成分支剧情和多结局...');
      this.emitProgress('step', { step: 15, description: '生成分支剧情和多结局' });
      await this.generateBranchesAndEndings(scriptId, truth, characters, chapters);
      this.emitProgress('progress', { message: '分支剧情和多结局设计完成' });

      // Step 16: 生成动态事件
      console.log('[剧本生成器] Step 16: 生成动态事件...');
      this.emitProgress('step', { step: 16, description: '生成动态事件' });
      await this.generateDynamicEvents(scriptId, chapters.length, framework);
      this.emitProgress('progress', { message: '动态事件系统生成完成' });

      // Step 17: 生成凶手引导
      console.log('[剧本生成器] Step 17: 生成凶手引导...');
      this.emitProgress('step', { step: 17, description: '生成凶手引导' });
      await this.generateMurdererGuide(scriptId, truth, characters, chapters.length);
      this.emitProgress('progress', { message: '凶手玩家引导系统生成完成' });

      // Step 18: 验证剧本完整性
      console.log('[剧本生成器] Step 18: 验证剧本完整性...');
      this.emitProgress('step', { step: 18, description: '验证剧本完整性' });
      const validation = await this.validateScript(scriptId);
      
      if (validation.isValid) {
        this.emitProgress('progress', { message: '剧本验证通过' });
      } else {
        this.emitProgress('warning', { message: `验证警告: ${validation.warnings.join(', ')}` });
      }

      // 更新剧本状态
      await scriptDatabase.updateScript(scriptId, { 
        status: validation.isValid ? 'ready' : 'needs_review' 
      });

      console.log(`[剧本生成器] 剧本生成完成! ID: ${scriptId}`);
      
      const script = await scriptDatabase.getFullEnhancedScript(scriptId);
      this.emitProgress('complete', { 
        scriptId, 
        title: script.title,
        validation 
      });

      return {
        success: true,
        scriptId,
        validation
      };

    } catch (error) {
      console.error('[剧本生成器] 生成失败:', error);
      this.emitProgress('error', { message: error.message });
      
      // 清理失败的记录
      try {
        await scriptDatabase.deleteScript(scriptId);
      } catch (e) {}
      
      throw error;
    }
  }

  /**
   * 生成剧本框架
   */
  async generateFramework(themeTemplate, playerCount, difficulty, customBackground, isSoloMode = false) {
    // 随机选择设定
    const setting = themeTemplate.settings[Math.floor(Math.random() * themeTemplate.settings.length)];
    const victimType = themeTemplate.victimTypes[Math.floor(Math.random() * themeTemplate.victimTypes.length)];
    const motive = themeTemplate.murdererMotives[Math.floor(Math.random() * themeTemplate.murdererMotives.length)];
    
    // 侦探模式的描述不同
    const modeDescription = isSoloMode 
      ? '作为侦探，你需要调查所有嫌疑人，找出真凶'
      : `${playerCount}位嫌疑人各有秘密，真相扑朔迷离`;

    // 如果有AI，使用AI生成更丰富的内容
    if (this.aiProvider) {
      try {
        const prompt = `请为一个${themeTemplate.name}主题的剧本杀游戏生成基本框架。

设定：${setting}
受害者类型：${victimType}
凶手动机：${motive}
游戏模式：${isSoloMode ? '侦探模式（玩家扮演侦探调查案件）' : `多人模式（${playerCount}位玩家扮演嫌疑人）`}
难度：${difficulty}/5

${customBackground ? `自定义背景：${customBackground}` : ''}

请返回JSON格式：
{
  "title": "剧本标题（4-8个字）",
  "subtitle": "副标题（可选）",
  "description": "剧本简介（50-100字）",
  "setting": "具体场景设定",
  "timeperiod": "故事发生的时间",
  "atmosphere": "整体氛围描述"
}`;

        this.emitProgress('ai_request', { action: '生成剧本框架' });
        
        const response = await this.aiProvider.callAPI([
          { role: 'system', content: '你是一个专业的剧本杀编剧，擅长创作悬疑推理剧本。' },
          { role: 'user', content: prompt }
        ], { temperature: 0.8, max_tokens: 500 });

        const content = response.content || response.text || '';
        this.emitProgress('ai_response', { content: content.substring(0, 300) });
        
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          result.isSoloMode = isSoloMode;
          return result;
        }
      } catch (error) {
        console.warn('[剧本生成器] AI生成框架失败，使用模板:', error.message);
        this.emitProgress('warning', { message: `AI生成框架失败: ${error.message}，使用模板` });
      }
    }

    // 默认框架
    return {
      title: `${setting}疑云`,
      subtitle: `${themeTemplate.name}`,
      description: `在${setting}中，${victimType}离奇死亡。${modeDescription}。你能找出隐藏在谜团后的凶手吗？`,
      setting: setting,
      victimType: victimType,
      motive: motive,
      atmosphere: themeTemplate.atmosphere,
      isSoloMode: isSoloMode
    };
  }

  /**
   * 生成案件真相
   */
  async generateTruth(scriptId, framework, themeTemplate) {
    const truthId = uuidv4();
    const murdererCharacterId = uuidv4(); // 预分配凶手ID

    let truthData;

    if (this.aiProvider) {
      try {
        const prompt = `基于以下剧本框架，设计完整的案件真相：

标题：${framework.title}
场景：${framework.setting}
受害者类型：${framework.victimType}
可能动机：${framework.motive}

请设计一个逻辑严密、令人意想不到但又合理的案件真相。返回JSON格式：
{
  "victimName": "受害者姓名",
  "victimBackground": "受害者详细背景（100-150字）",
  "murderMotive": "详细的作案动机（50-100字）",
  "murderMethod": "具体的作案手法（50-100字）",
  "murderTime": "案发时间",
  "murderLocation": "案发地点",
  "fullTruth": "完整的案件真相（200-300字，包括凶手如何策划、实施、掩盖）",
  "timeline": [
    {"time": "时间点", "event": "事件描述"}
  ],
  "redHerrings": [
    {"description": "误导线索描述", "target": "指向的无辜者"}
  ]
}`;

        this.emitProgress('ai_request', { action: '生成案件真相' });
        
        const response = await this.aiProvider.callAPI([
          { role: 'system', content: '你是一个推理小说家，擅长设计逻辑严密的谋杀案件。' },
          { role: 'user', content: prompt }
        ], { temperature: 0.7, max_tokens: 1000 });

        const content = response.content || response.text || '';
        this.emitProgress('ai_response', { content: content.substring(0, 300) });
        
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          truthData = JSON.parse(jsonMatch[0]);
        }
      } catch (error) {
        console.warn('[剧本生成器] AI生成真相失败，使用模板:', error.message);
        this.emitProgress('warning', { message: `AI生成真相失败: ${error.message}` });
      }
    }

    // 默认真相
    if (!truthData) {
      truthData = {
        victimName: '维克多·布莱克',
        victimBackground: `${framework.setting}的主人，一位${framework.victimType}。表面上德高望重，实则隐藏着诸多秘密。`,
        murderMotive: framework.motive || '为了隐藏自己的秘密，凶手决定铤而走险',
        murderMethod: '趁受害者独处时，使用钝器从背后袭击，随后伪装成意外',
        murderTime: '昨晚10点左右',
        murderLocation: framework.setting + '的书房',
        fullTruth: `凶手早已对受害者心怀不满。案发当晚，凶手趁其他人不注意，悄悄进入书房。受害者正背对门口翻阅文件时，凶手抄起书桌上的青铜摆件，从背后猛击其头部。受害者当场倒地身亡。凶手随后将现场布置成意外摔倒的样子，并确保自己没有留下明显痕迹。`,
        timeline: [
          { time: '晚上9:00', event: '晚宴结束，宾客各自散去' },
          { time: '晚上9:30', event: '受害者独自前往书房' },
          { time: '晚上10:00', event: '凶手潜入书房行凶' },
          { time: '晚上10:15', event: '凶手离开，伪装现场' },
          { time: '次日早上7:00', event: '仆人发现尸体' }
        ],
        redHerrings: [
          { description: '书房窗户半开，似乎有外人闯入', target: '让人怀疑外来者' },
          { description: '受害者与某人的争吵邮件', target: '商业竞争对手' }
        ]
      };
    }

    await scriptDatabase.createScriptTruth({
      id: truthId,
      scriptId: scriptId,
      caseType: themeTemplate.name,
      victimName: truthData.victimName,
      victimBackground: truthData.victimBackground,
      murdererCharacterId: murdererCharacterId,
      murderMotive: truthData.murderMotive,
      murderMethod: truthData.murderMethod,
      murderTime: truthData.murderTime,
      murderLocation: truthData.murderLocation,
      fullTruth: truthData.fullTruth,
      timeline: truthData.timeline,
      redHerrings: truthData.redHerrings
    });

    return {
      ...truthData,
      id: truthId,
      murdererCharacterId
    };
  }

  /**
   * 生成角色
   * @param {string} scriptId - 剧本ID
   * @param {object} framework - 剧本框架
   * @param {object} truth - 案件真相
   * @param {number} characterCount - 角色数量（不是玩家数量）
   * @param {boolean} isSoloMode - 是否为侦探模式
   */
  async generateCharacters(scriptId, framework, truth, characterCount, isSoloMode = false) {
    const characters = [];
    const archetypes = this.selectArchetypes(characterCount);

    // 随机选择凶手位置
    const murdererIndex = Math.floor(Math.random() * characterCount);

    for (let i = 0; i < characterCount; i++) {
      const archetype = archetypes[i];
      const isMurderer = i === murdererIndex;
      const characterId = isMurderer ? truth.murdererCharacterId : uuidv4();

      let characterData;

      if (this.aiProvider) {
        try {
          const roleContext = isSoloMode 
            ? '这是一个侦探模式剧本，所有角色都是NPC嫌疑人，玩家扮演侦探来调查他们。'
            : '这是一个多人剧本，玩家会扮演这些角色。';
            
          const prompt = `为剧本杀游戏创建一个角色：

${roleContext}

剧本标题：${framework.title}
场景：${framework.setting}
角色原型：${archetype.name}
角色特点：${archetype.traits.join('、')}
${isMurderer ? `【这是凶手角色】凶手动机：${truth.murderMotive}` : ''}

受害者：${truth.victimName}
案发背景：${truth.victimBackground}

请创建一个立体的角色，返回JSON格式：
{
  "name": "角色姓名",
  "gender": "性别",
  "age": 年龄数字,
  "occupation": "职业",
  "publicInfo": "所有人可见的公开信息（50-80字）",
  "publicPersonality": "性格描述",
  "publicBackground": "公开的背景故事",
  "secretInfo": "角色隐藏的秘密（50-100字）",
  "secretMotive": "隐藏的动机或目的",
  "alibi": "声称的不在场证明",
  "alibiTruth": "不在场证明的真相",
  "personalGoal": "个人目标"
}`;

          this.emitProgress('ai_request', { action: `生成角色 ${i + 1}/${characterCount}: ${archetype.name}` });
          
          const response = await this.aiProvider.callAPI([
            { role: 'system', content: '你是一个剧本杀编剧，擅长创作有深度的角色。' },
            { role: 'user', content: prompt }
          ], { temperature: 0.8, max_tokens: 600 });

          const content = response.content || response.text || '';
          this.emitProgress('ai_response', { content: content.substring(0, 200) });
          
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            characterData = JSON.parse(jsonMatch[0]);
          }
        } catch (error) {
          console.warn(`[剧本生成器] AI生成角色${i + 1}失败:`, error.message);
          this.emitProgress('warning', { message: `AI生成角色${i + 1}失败: ${error.message}` });
        }
      }

      // 默认角色数据
      if (!characterData) {
        const defaultNames = ['艾伦', '贝拉', '查理', '黛安娜', '伊森', '菲奥娜', '乔治', '海伦'];
        characterData = {
          name: defaultNames[i % defaultNames.length],
          gender: i % 2 === 0 ? '男' : '女',
          age: 25 + Math.floor(Math.random() * 30),
          occupation: archetype.name,
          publicInfo: `作为${archetype.name}，与受害者有着密切的联系。${archetype.traits.join('，')}。`,
          publicPersonality: archetype.traits[0],
          publicBackground: `在${framework.setting}中担任重要角色`,
          secretInfo: archetype.secretPotential,
          secretMotive: isMurderer ? truth.murderMotive : '隐藏自己的秘密',
          alibi: '案发时声称在自己房间休息',
          alibiTruth: isMurderer ? '实际上潜入了案发现场' : '确实在房间，但中途外出过',
          personalGoal: isMurderer ? '掩盖自己的罪行' : '找出真凶，证明自己的清白'
        };
      }

      // 侦探模式下，所有角色都是NPC
      const characterType = isSoloMode ? 'npc_suspect' : 'suspect';

      await scriptDatabase.createCharacter({
        id: characterId,
        scriptId: scriptId,
        name: characterData.name,
        gender: characterData.gender,
        age: characterData.age,
        occupation: characterData.occupation,
        characterType: characterType,
        isMurderer: isMurderer,
        isVictim: false,
        isNpc: isSoloMode, // 标记是否为NPC
        publicInfo: characterData.publicInfo,
        publicPersonality: characterData.publicPersonality,
        publicBackground: characterData.publicBackground,
        secretInfo: characterData.secretInfo,
        secretMotive: characterData.secretMotive,
        alibi: characterData.alibi,
        alibiTruth: characterData.alibiTruth,
        personalGoal: characterData.personalGoal,
        winCondition: isMurderer ? '不被指认为凶手' : '找出真正的凶手',
        displayOrder: i
      });

      characters.push({
        id: characterId,
        ...characterData,
        isMurderer,
        isNpc: isSoloMode,
        archetype: archetype.type
      });
    }

    return characters;
  }

  /**
   * 选择角色原型
   */
  selectArchetypes(count) {
    const shuffled = [...CHARACTER_ARCHETYPES].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  /**
   * 生成人物关系
   */
  async generateRelationships(scriptId, characters, truth) {
    const relationshipTypes = [
      '同事', '亲属', '恋人', '竞争对手', '老友', '债务关系', '主仆', '师徒'
    ];

    // 为每对角色生成关系
    for (let i = 0; i < characters.length; i++) {
      for (let j = i + 1; j < characters.length; j++) {
        const charA = characters[i];
        const charB = characters[j];
        const relType = relationshipTypes[Math.floor(Math.random() * relationshipTypes.length)];

        await scriptDatabase.createRelationship({
          id: uuidv4(),
          scriptId: scriptId,
          characterAId: charA.id,
          characterBId: charB.id,
          relationshipType: relType,
          relationshipDetail: `${charA.name}和${charB.name}是${relType}关系`,
          isPublic: Math.random() > 0.3, // 70%概率公开
          aToBDescription: `对${charB.name}的看法...`,
          bToADescription: `对${charA.name}的看法...`
        });
      }
    }
  }

  /**
   * 生成地点
   */
  async generateLocations(scriptId, framework, themeTemplate) {
    const locationTemplates = [
      { name: '案发现场', description: '发现尸体的地方，充满了各种线索' },
      { name: '客厅', description: '宾客们聚集的主要场所' },
      { name: '书房', description: '受害者经常独处的地方' },
      { name: '卧室区', description: '各人的私密空间' },
      { name: '厨房', description: '仆人们工作的地方' },
      { name: '花园/庭院', description: '可以看到建筑各处的开阔区域' }
    ];

    const locations = [];
    for (const template of locationTemplates) {
      const locId = uuidv4();
      await scriptDatabase.createLocation({
        id: locId,
        scriptId: scriptId,
        name: template.name,
        description: `${framework.setting}的${template.description}`,
        searchableItems: ['家具', '文件', '个人物品'],
        hiddenInfo: '仔细搜查可能发现隐藏的线索',
        availableFromChapter: 1
      });
      locations.push({ id: locId, ...template });
    }

    return locations;
  }

  /**
   * 生成线索
   */
  async generateClues(scriptId, truth, characters, locations) {
    const clues = [];
    const murderer = characters.find(c => c.isMurderer);

    // 关键物证
    const keyClues = [
      {
        name: '凶器',
        type: 'physical',
        content: `发现了用于行凶的物品，上面有可疑的痕迹`,
        location: '案发现场',
        isKeyEvidence: true,
        pointsToTruth: truth.murderMethod
      },
      {
        name: '可疑指纹',
        type: 'physical',
        content: `在凶器上发现了部分指纹`,
        location: '案发现场',
        isKeyEvidence: true,
        pointsToTruth: `指向凶手${murderer.name}`
      },
      {
        name: '时间线证据',
        type: 'circumstantial',
        content: `记录显示案发时间前后某人的异常行为`,
        location: '走廊',
        isKeyEvidence: true,
        pointsToTruth: truth.timeline[2]?.event
      }
    ];

    // 普通线索
    const normalClues = [
      { name: '私人信件', type: 'document', content: '受害者与某人的通信，暗示着冲突', location: '书房' },
      { name: '财务记录', type: 'document', content: '显示异常的资金往来', location: '书房' },
      { name: '目击证词', type: 'testimony', content: '有人声称看到可疑身影', location: '花园/庭院' },
      { name: '可疑声响', type: 'testimony', content: '有人听到争吵声', location: '客厅' },
      { name: '遗落物品', type: 'physical', content: '现场发现不属于受害者的物品', location: '案发现场' }
    ];

    // 红鲱鱼（误导线索）
    const redHerrings = truth.redHerrings?.map((rh, i) => ({
      name: `可疑线索${i + 1}`,
      type: 'circumstantial',
      content: rh.description,
      location: locations[i % locations.length]?.name || '客厅',
      isKeyEvidence: false,
      pointsToTruth: `（误导）${rh.target}`
    })) || [];

    // 将线索分配给角色
    const allClues = [...keyClues, ...normalClues, ...redHerrings];
    
    for (let i = 0; i < allClues.length; i++) {
      const clue = allClues[i];
      const clueId = uuidv4();
      const assignedCharacter = characters[i % characters.length];

      await scriptDatabase.createClue({
        id: clueId,
        scriptId: scriptId,
        clueName: clue.name,
        clueType: clue.type,
        clueContent: clue.content,
        discoveryLocation: clue.location,
        discoveryKeywords: ['搜索', '检查', '调查', clue.location],
        assignedToCharacterId: assignedCharacter.id,
        importance: clue.isKeyEvidence ? 5 : 3,
        isKeyEvidence: clue.isKeyEvidence || false,
        pointsToTruth: clue.pointsToTruth || null,
        revealChapter: clue.isKeyEvidence ? 2 : 1
      });

      clues.push({ id: clueId, ...clue, assignedTo: assignedCharacter.name });
    }

    return clues;
  }

  /**
   * 生成章节
   */
  async generateChapters(scriptId, framework, truth, characters, clues, locations) {
    const chapters = [];

    const chapterTemplates = [
      {
        number: 1,
        title: '案件发现',
        goal: '了解案件背景，收集初步信息',
        successCondition: '所有玩家都获得自己的角色信息和初始线索'
      },
      {
        number: 2,
        title: '调查取证',
        goal: '深入调查，收集关键证据',
        successCondition: '发现至少一条关键证据'
      },
      {
        number: 3,
        title: '真相大白',
        goal: '整合所有线索，指认凶手',
        successCondition: '成功指认凶手并说明动机'
      }
    ];

    for (const template of chapterTemplates) {
      const chapterId = uuidv4();

      let chapterContent;
      if (this.aiProvider && template.number === 1) {
        try {
          const prompt = `为剧本杀第${template.number}章撰写开场白和场景描述：

剧本标题：${framework.title}
场景：${framework.setting}
受害者：${truth.victimName}
案发时间：${truth.murderTime}
案发地点：${truth.murderLocation}

章节目标：${template.goal}

请返回JSON格式：
{
  "openingNarration": "开场旁白（100-150字，营造氛围）",
  "sceneDescription": "场景描述（50-80字）",
  "mainContent": "主要内容（150-200字，包括玩家需要做什么）"
}`;

          this.emitProgress('ai_request', { action: `生成第${template.number}章内容` });
          
          const response = await this.aiProvider.callAPI([
            { role: 'system', content: '你是一个剧本杀主持人，擅长营造悬疑氛围。' },
            { role: 'user', content: prompt }
          ], { temperature: 0.7, max_tokens: 500 });

          const content = response.content || response.text || '';
          this.emitProgress('ai_response', { content: content.substring(0, 200) });
          
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            chapterContent = JSON.parse(jsonMatch[0]);
          }
        } catch (error) {
          console.warn(`[剧本生成器] AI生成章节${template.number}失败:`, error.message);
          this.emitProgress('warning', { message: `AI生成章节${template.number}失败: ${error.message}` });
        }
      }

      if (!chapterContent) {
        chapterContent = {
          openingNarration: template.number === 1 
            ? `${framework.setting}笼罩在一层神秘的阴霾之中。昨夜，${truth.victimName}在${truth.murderLocation}离奇死亡。作为与受害者有密切关系的各位，你们被聚集在一起接受调查...`
            : template.number === 2
            ? `随着调查的深入，更多的秘密开始浮出水面。每个人似乎都有所隐瞒，真相就隐藏在层层谎言之后...`
            : `所有的线索都已摆在眼前，是时候揭开这个案件的真相了。凶手就在你们中间...`,
          sceneDescription: `${framework.setting}的${locations[0]?.name || '大厅'}`,
          mainContent: template.number === 1
            ? '请仔细阅读你的角色卡，了解自己的身份和秘密。然后开始与其他玩家交流，收集初步信息。'
            : template.number === 2
            ? '现在可以搜查各个地点，询问其他玩家，寻找证据。与故事机交流可以获得提示。'
            : '整合你所收集的所有线索，准备指认凶手。请准备好你的推理和证据。'
        };
      }

      await scriptDatabase.createChapter({
        id: chapterId,
        scriptId: scriptId,
        chapterNumber: template.number,
        title: template.title,
        openingNarration: chapterContent.openingNarration,
        sceneDescription: chapterContent.sceneDescription,
        mainContent: chapterContent.mainContent,
        chapterGoal: template.goal,
        successCondition: template.successCondition,
        availableLocations: locations.map(l => l.name),
        availableNpcs: [],
        newRevelations: [],
        timeLimit: 30
      });

      chapters.push({ id: chapterId, ...template, ...chapterContent });
    }

    return chapters;
  }

  /**
   * 生成谜题
   */
  async generatePuzzles(scriptId, chapters, truth, clues) {
    const murderer = await scriptDatabase.getScriptCharacters(scriptId).then(chars => chars.find(c => c.is_murderer));

    const puzzleTemplates = [
      {
        chapterNumber: 1,
        question: `受害者${truth.victimName}是在什么时间、什么地点被发现的？`,
        correctAnswer: `${truth.murderTime}，${truth.murderLocation}`,
        answerKeywords: [truth.murderTime, truth.murderLocation, '书房', '晚上'],
        difficulty: 1,
        successMessage: '✅ 正确！你们已经掌握了案件的基本信息。',
        nextStep: '现在开始深入调查，搜集更多证据。'
      },
      {
        chapterNumber: 2,
        question: '根据目前收集的证据，凶手使用了什么凶器或手法？',
        correctAnswer: truth.murderMethod,
        answerKeywords: truth.murderMethod.match(/[\u4e00-\u9fa5]+/g)?.filter(w => w.length >= 2) || ['凶器', '手法'],
        difficulty: 3,
        successMessage: '✅ 正确！你们已经找到了关键的作案手法。',
        nextStep: '现在思考谁有动机和条件这样做。'
      },
      {
        chapterNumber: 3,
        question: `谁是杀害${truth.victimName}的凶手？请说出名字和作案动机。`,
        correctAnswer: `${murderer?.name || '凶手'}，${truth.murderMotive}`,
        answerKeywords: [murderer?.name || '凶手', ...truth.murderMotive.match(/[\u4e00-\u9fa5]+/g)?.filter(w => w.length >= 2).slice(0, 3) || ['动机']],
        difficulty: 5,
        successMessage: `🎉 恭喜！你们成功破案！凶手正是${murderer?.name || '凶手'}！\n\n${truth.fullTruth}`,
        nextStep: '案件告破，真相大白！'
      }
    ];

    for (const puzzle of puzzleTemplates) {
      const chapter = chapters.find(c => c.number === puzzle.chapterNumber);
      if (!chapter) continue;

      await scriptDatabase.createPuzzle({
        id: uuidv4(),
        scriptId: scriptId,
        chapterId: chapter.id,
        puzzleType: 'deduction',
        question: puzzle.question,
        correctAnswer: puzzle.correctAnswer,
        answerKeywords: puzzle.answerKeywords,
        difficulty: puzzle.difficulty,
        hints: [
          '仔细回顾已收集的线索',
          '与其他玩家交流信息',
          '注意时间线和人物关系'
        ],
        maxHints: 3,
        successMessage: puzzle.successMessage,
        failureMessage: '这个答案似乎不太对，再想想看...',
        partialMessage: '接近了，但还缺少一些关键信息...',
        nextStep: puzzle.nextStep,
        isRequired: true
      });
    }
  }

  /**
   * 验证剧本完整性
   */
  async validateScript(scriptId) {
    const script = await scriptDatabase.getFullScript(scriptId);
    const warnings = [];
    const errors = [];

    // 检查基本信息
    if (!script.title) errors.push('缺少剧本标题');
    if (!script.description) warnings.push('缺少剧本描述');

    // 检查真相
    if (!script.truth) {
      errors.push('缺少案件真相');
    } else {
      if (!script.truth.murderer_character_id) errors.push('未指定凶手');
      if (!script.truth.murder_motive) errors.push('缺少作案动机');
      if (!script.truth.murder_method) errors.push('缺少作案手法');
    }

    // 检查角色
    if (!script.characters || script.characters.length < script.min_players) {
      errors.push(`角色数量不足（需要至少${script.min_players}个）`);
    } else {
      const hasMurderer = script.characters.some(c => c.is_murderer);
      if (!hasMurderer) errors.push('没有角色被指定为凶手');

      for (const char of script.characters) {
        if (!char.public_info) warnings.push(`角色 ${char.name} 缺少公开信息`);
        if (!char.secret_info) warnings.push(`角色 ${char.name} 缺少秘密信息`);
      }
    }

    // 检查章节
    if (!script.chapters || script.chapters.length < 3) {
      errors.push('章节数量不足（需要至少3章）');
    } else {
      for (const chapter of script.chapters) {
        if (!chapter.puzzles || chapter.puzzles.length === 0) {
          warnings.push(`第${chapter.chapter_number}章缺少谜题`);
        }
      }
    }

    // 检查线索
    if (!script.clues || script.clues.length < 5) {
      warnings.push('线索数量较少，建议增加更多线索');
    }
    const keyClues = script.clues?.filter(c => c.is_key_evidence) || [];
    if (keyClues.length < 2) {
      warnings.push('关键证据数量不足，建议增加');
    }

    // 检查地点
    if (!script.locations || script.locations.length < 3) {
      warnings.push('可调查地点较少，建议增加');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: {
        characters: script.characters?.length || 0,
        chapters: script.chapters?.length || 0,
        clues: script.clues?.length || 0,
        locations: script.locations?.length || 0,
        puzzles: script.chapters?.reduce((sum, c) => sum + (c.puzzles?.length || 0), 0) || 0
      }
    };
  }

  /**
   * 获取可用主题列表
   */
  getAvailableThemes() {
    return Object.entries(THEME_TEMPLATES).map(([key, value]) => ({
      id: key,
      name: value.name,
      description: value.description,
      atmosphere: value.atmosphere
    }));
  }

  // ==================== 新增：高级剧本生成方法 ====================

  /**
   * 生成叙事诡计
   */
  async generateNarrativeTricks(scriptId, truth, characters, difficulty) {
    const murderer = characters.find(c => c.isMurderer);
    const trickCount = Math.min(difficulty, 3); // 根据难度决定诡计数量
    
    // 选择诡计类型
    const trickTypes = Object.keys(NARRATIVE_TRICKS);
    const selectedTypes = trickTypes.slice(0, trickCount);

    for (const trickType of selectedTypes) {
      const trickCategory = NARRATIVE_TRICKS[trickType];
      const selectedTrick = trickCategory.types[Math.floor(Math.random() * trickCategory.types.length)];

      let trickData;
      if (this.aiProvider) {
        try {
          const prompt = `为剧本杀设计一个${trickCategory.name}：

诡计类型：${selectedTrick.name}
诡计概念：${selectedTrick.description}

剧本背景：
- 凶手：${murderer?.name}
- 作案动机：${truth.murderMotive}
- 作案手法：${truth.murderMethod}

请设计具体的诡计实现，返回JSON格式：
{
  "trickName": "诡计名称",
  "trickDescription": "诡计具体描述（100-150字）",
  "revelation": "真相揭示后的描述（80-120字）",
  "triggerCondition": "触发揭示的条件",
  "involvedCharacters": ["涉及的角色名"],
  "difficultyRating": 难度1-5
}`;

          this.emitProgress('ai_request', { action: `生成${trickCategory.name}` });
          
          const response = await this.aiProvider.callAPI([
            { role: 'system', content: '你是一个推理小说专家，擅长设计巧妙的叙事诡计。' },
            { role: 'user', content: prompt }
          ], { temperature: 0.8, max_tokens: 500 });

          const content = response.content || response.text || '';
          this.emitProgress('ai_response', { content: content.substring(0, 200) });
          
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            trickData = JSON.parse(jsonMatch[0]);
          }
        } catch (error) {
          console.warn('[剧本生成器] AI生成诡计失败:', error.message);
          this.emitProgress('warning', { message: `AI生成诡计失败: ${error.message}` });
        }
      }

      // 默认诡计数据
      if (!trickData) {
        trickData = {
          trickName: selectedTrick.name,
          trickDescription: `此案件中存在${selectedTrick.name}。${selectedTrick.description}。凶手利用这一点成功制造了完美的伪装。`,
          revelation: `当玩家发现关键线索后，才恍然大悟：原来${selectedTrick.name}一直在误导调查方向。`,
          triggerCondition: '收集到3条以上关键证据',
          involvedCharacters: [murderer?.name || '凶手'],
          difficultyRating: difficulty
        };
      }

      await scriptDatabase.createNarrativeTrick({
        id: uuidv4(),
        scriptId,
        trickType,
        trickName: trickData.trickName,
        trickDescription: trickData.trickDescription,
        revelation: trickData.revelation,
        triggerCondition: trickData.triggerCondition,
        triggerChapter: Math.max(2, Math.floor(trickCount / 2) + 1),
        involvedCharacters: trickData.involvedCharacters,
        relatedClues: [],
        difficultyRating: trickData.difficultyRating
      });
    }
  }

  /**
   * 生成多层故事结构
   */
  async generateStoryLayers(scriptId, truth, characters, framework) {
    const layers = [
      { type: 'surface', title: '表层故事', description: '玩家最初看到的案件表象' },
      { type: 'hidden', title: '暗层秘密', description: '隐藏在表象下的各人秘密' },
      { type: 'core', title: '核心真相', description: '案件的真正真相和动机' }
    ];

    for (const layer of layers) {
      let layerData;
      if (this.aiProvider) {
        try {
          const prompt = `为剧本杀设计${layer.title}：

${layer.description}

剧本背景：
- 标题：${framework.title}
- 受害者：${truth.victimName}
- 案发背景：${truth.victimBackground}
- 完整真相：${truth.fullTruth}

角色列表：
${characters.map(c => `- ${c.name}（${c.isMurderer ? '凶手' : '嫌疑人'}）`).join('\n')}

请为这一层设计具体内容，返回JSON格式：
{
  "layerTitle": "层级标题",
  "layerContent": "该层级的完整内容（150-250字）",
  "revealCondition": "揭示该层的条件",
  "revealChapter": 揭示的章节数字,
  "relatedCharacters": ["相关角色名"],
  "requiredClues": ["需要发现的线索"]
}`;

          this.emitProgress('ai_request', { action: `生成${layer.title}` });
          
          const response = await this.aiProvider.callAPI([
            { role: 'system', content: '你是一个故事架构师，擅长设计多层次的悬疑故事。' },
            { role: 'user', content: prompt }
          ], { temperature: 0.7, max_tokens: 600 });

          const content = response.content || response.text || '';
          this.emitProgress('ai_response', { content: content.substring(0, 200) });
          
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            layerData = JSON.parse(jsonMatch[0]);
          }
        } catch (error) {
          console.warn('[剧本生成器] AI生成故事层失败:', error.message);
        }
      }

      if (!layerData) {
        const defaultContents = {
          surface: `${truth.victimName}在${truth.murderLocation}被发现死亡，死因初步判断为谋杀。在场的${characters.length}人都有嫌疑，每个人都声称自己有不在场证明，但没有人能完全被排除嫌疑。`,
          hidden: `随着调查深入，发现每个人都隐藏着秘密。有人在案发当晚偷偷外出，有人与受害者存在财务纠纷，还有人的证词存在明显矛盾。这些秘密交织在一起，构成了复杂的关系网。`,
          core: truth.fullTruth
        };

        layerData = {
          layerTitle: layer.title,
          layerContent: defaultContents[layer.type],
          revealCondition: layer.type === 'surface' ? '游戏开始时' : layer.type === 'hidden' ? '完成调查阶段' : '指认凶手并说明动机',
          revealChapter: layer.type === 'surface' ? 1 : layer.type === 'hidden' ? 2 : 3,
          relatedCharacters: characters.map(c => c.name),
          requiredClues: []
        };
      }

      await scriptDatabase.createStoryLayer({
        id: uuidv4(),
        scriptId,
        layerType: layer.type,
        layerTitle: layerData.layerTitle,
        layerContent: layerData.layerContent,
        revealCondition: layerData.revealCondition,
        revealChapter: layerData.revealChapter,
        relatedCharacters: layerData.relatedCharacters,
        requiredClues: layerData.requiredClues
      });
    }
  }

  /**
   * 生成角色技能
   */
  async generateCharacterSkills(scriptId, characters) {
    const skillTypes = Object.values(CHARACTER_SKILLS);
    const shuffledSkills = [...skillTypes].sort(() => Math.random() - 0.5);

    for (let i = 0; i < characters.length; i++) {
      const character = characters[i];
      const skill = shuffledSkills[i % shuffledSkills.length];

      await scriptDatabase.createCharacterSkill({
        id: uuidv4(),
        scriptId,
        characterId: character.id,
        skillName: skill.name,
        skillType: skill.type,
        skillDescription: skill.description,
        maxUses: character.isMurderer ? 2 : 1, // 凶手有额外技能使用次数
        cooldownChapters: 1,
        effectType: skill.type,
        effectDescription: skill.description,
        activationCondition: null
      });
    }
  }

  /**
   * 生成NPC人格档案
   */
  async generateNpcPersonas(scriptId, characters, truth) {
    for (const character of characters) {
      let personaData;
      if (this.aiProvider) {
        try {
          const prompt = `为剧本杀中的角色创建NPC人格档案：

角色信息：
- 姓名：${character.name}
- 职业：${character.occupation || '未知'}
- 性格：${character.publicPersonality || '待定义'}
- 秘密：${character.secretInfo || '无特殊秘密'}
- 是否凶手：${character.isMurderer ? '是' : '否'}

案件背景：
- 受害者：${truth.victimName}
- 作案动机：${truth.murderMotive}

请创建详细的NPC人格档案，用于AI扮演该角色与玩家对话。返回JSON格式：
{
  "personalityTraits": ["性格特点1", "性格特点2", "性格特点3"],
  "speakingStyle": "说话风格描述",
  "catchphrases": ["口头禅1", "口头禅2"],
  "stance": "对案件的立场和态度",
  "knownSecrets": ["知道的秘密1", "知道的秘密2"],
  "hiddenInfo": ["不愿透露的信息"],
  "revealableInfo": ["可以被套出的信息"],
  "publicBehavior": "在公开场合的行为特点",
  "privateBehavior": "私下交谈时的行为特点"
}`;

          this.emitProgress('ai_request', { action: `生成${character.name}的人格档案` });
          
          const response = await this.aiProvider.callAPI([
            { role: 'system', content: '你是一个角色设计师，擅长创建立体的人物形象。' },
            { role: 'user', content: prompt }
          ], { temperature: 0.8, max_tokens: 600 });

          const content = response.content || response.text || '';
          this.emitProgress('ai_response', { content: content.substring(0, 200) });
          
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            personaData = JSON.parse(jsonMatch[0]);
          }
        } catch (error) {
          console.warn(`[剧本生成器] AI生成${character.name}人格失败:`, error.message);
        }
      }

      if (!personaData) {
        personaData = {
          personalityTraits: character.publicPersonality?.split(/[,，、]/) || ['谨慎', '有城府'],
          speakingStyle: character.isMurderer ? '说话时偶尔有停顿，仿佛在斟酌用词' : '说话直接，情绪外露',
          catchphrases: ['这件事...', '我记得...'],
          stance: character.isMurderer ? '表面配合调查，暗中引导方向' : '急于证明自己的清白',
          knownSecrets: character.secretInfo ? [character.secretInfo] : [],
          hiddenInfo: character.alibiTruth ? [character.alibiTruth] : [],
          revealableInfo: ['关于案发时间的一些细节'],
          publicBehavior: '表现得镇定自若',
          privateBehavior: '会透露更多个人想法'
        };
      }

      await scriptDatabase.createNpcPersona({
        id: uuidv4(),
        scriptId,
        characterId: character.id,
        personalityTraits: personaData.personalityTraits,
        speakingStyle: personaData.speakingStyle,
        catchphrases: personaData.catchphrases,
        stance: personaData.stance,
        attitudesToPlayers: {},
        knownSecrets: personaData.knownSecrets,
        hiddenInfo: personaData.hiddenInfo,
        revealableInfo: personaData.revealableInfo,
        triggerResponses: {},
        publicBehavior: personaData.publicBehavior,
        privateBehavior: personaData.privateBehavior
      });
    }
  }

  /**
   * 生成情感弧线
   */
  async generateEmotionalArcs(scriptId, characters, chapterCount) {
    const emotionalStates = ['紧张', '焦虑', '愤怒', '悲伤', '恐惧', '怀疑', '释然', '绝望'];

    for (const character of characters) {
      for (let chapter = 1; chapter <= chapterCount; chapter++) {
        const stageCount = Math.min(2, chapter); // 每章1-2个情感阶段
        
        for (let stage = 1; stage <= stageCount; stage++) {
          const emotionalState = character.isMurderer
            ? (chapter < chapterCount ? '伪装镇定但内心紧张' : '感到压力逐渐增大')
            : emotionalStates[Math.floor(Math.random() * emotionalStates.length)];

          await scriptDatabase.createEmotionalArc({
            id: uuidv4(),
            scriptId,
            characterId: character.id,
            arcStage: stage,
            arcChapter: chapter,
            emotionalState,
            emotionalTrigger: chapter === 1 ? '案件发生' : `第${chapter}章的新发现`,
            innerMonologue: character.isMurderer 
              ? '必须保持冷静，不能露出破绽...' 
              : '真相到底是什么？',
            outwardBehavior: character.isMurderer
              ? '表现得关心案件进展'
              : '积极参与调查',
            emotionalInteractions: []
          });
        }
      }
    }
  }

  /**
   * 生成分支剧情和多结局
   */
  async generateBranchesAndEndings(scriptId, truth, characters, chapters) {
    const murderer = characters.find(c => c.isMurderer);

    // 创建分支点
    const branches = [
      {
        chapter: 2,
        description: '玩家是否发现关键物证',
        conditionType: 'clue_found',
        conditionValue: { clueType: 'physical', count: 2 },
        name: '证据充分路线',
        outcome: '调查方向更加明确，线索指向收窄'
      },
      {
        chapter: 2,
        description: '玩家是否与所有嫌疑人交谈',
        conditionType: 'interaction_complete',
        conditionValue: { targetType: 'suspects', percentage: 100 },
        name: '全面调查路线',
        outcome: '获得更多人物背景信息，可能发现隐藏关系'
      }
    ];

    for (const branch of branches) {
      await scriptDatabase.createPlotBranch({
        id: uuidv4(),
        scriptId,
        branchPointChapter: branch.chapter,
        branchPointDescription: branch.description,
        conditionType: branch.conditionType,
        conditionValue: branch.conditionValue,
        branchName: branch.name,
        branchOutcome: branch.outcome,
        affectedChapters: [branch.chapter + 1],
        newClues: [],
        characterChanges: [],
        leadsToEnding: null
      });
    }

    // 创建多结局
    const endings = [
      {
        name: '真相大白',
        type: 'perfect',
        description: '成功指认凶手并说明完整动机',
        conditions: { murdererIdentified: true, motiveExplained: true },
        narration: `经过缜密的推理，你们成功揭穿了${murderer?.name || '凶手'}的伪装。${truth.fullTruth}`,
        bonusScore: 100
      },
      {
        name: '部分真相',
        type: 'partial',
        description: '指认了凶手但动机不完整',
        conditions: { murdererIdentified: true, motiveExplained: false },
        narration: `虽然找到了真凶，但案件背后的完整故事仍有谜团...`,
        bonusScore: 50
      },
      {
        name: '凶手逃脱',
        type: 'bad',
        description: '错误指认或凶手成功脱罪',
        conditions: { murdererIdentified: false },
        narration: `真凶藏匿在人群中，带着秘密消失在夜色里...`,
        bonusScore: 0
      },
      {
        name: '隐藏真相',
        type: 'hidden',
        description: '发现案件背后更大的阴谋',
        conditions: { murdererIdentified: true, hiddenLayerRevealed: true },
        narration: `不仅仅是一场谋杀，背后牵涉的远比想象的更加复杂...`,
        bonusScore: 150,
        isHidden: true
      }
    ];

    for (const ending of endings) {
      await scriptDatabase.createEnding({
        id: uuidv4(),
        scriptId,
        endingName: ending.name,
        endingType: ending.type,
        endingDescription: ending.description,
        requiredConditions: ending.conditions,
        endingNarration: ending.narration,
        characterOutcomes: {},
        bonusScore: ending.bonusScore,
        isHidden: ending.isHidden || false
      });
    }
  }

  /**
   * 生成动态事件
   */
  async generateDynamicEvents(scriptId, chapterCount, framework) {
    const eventTemplates = [
      {
        name: '突发发现',
        type: 'discovery',
        description: '有人在调查时意外发现了一个隐藏的空间',
        triggerType: 'search_action',
        triggerCondition: { location: 'any', searchCount: 3 },
        effects: { newClue: true, atmosphereChange: 'tense' },
        atmosphere: 'tense'
      },
      {
        name: '神秘电话',
        type: 'interruption',
        description: '一个神秘的电话打来，透露了令人震惊的信息',
        triggerType: 'time_based',
        triggerCondition: { chapterProgress: 0.5 },
        effects: { newInfo: true },
        atmosphere: 'shocking'
      },
      {
        name: '电力中断',
        type: 'atmosphere',
        description: '突然停电，黑暗中似乎有人移动...',
        triggerType: 'random',
        triggerCondition: { probability: 0.3 },
        effects: { atmosphereChange: 'tense', suspenseIncrease: true },
        atmosphere: 'tense'
      },
      {
        name: '意外证词',
        type: 'revelation',
        description: '某人突然改变了之前的证词',
        triggerType: 'accusation',
        triggerCondition: { accusationMade: true },
        effects: { storyProgress: true },
        atmosphere: 'emotional'
      }
    ];

    for (const event of eventTemplates) {
      await scriptDatabase.createDynamicEvent({
        id: uuidv4(),
        scriptId,
        eventName: event.name,
        eventType: event.type,
        eventDescription: event.description,
        triggerType: event.triggerType,
        triggerCondition: event.triggerCondition,
        earliestChapter: 1,
        latestChapter: chapterCount,
        eventEffects: event.effects,
        atmosphereEffect: event.atmosphere,
        isOneTime: true
      });
    }
  }

  /**
   * 生成凶手引导
   */
  async generateMurdererGuide(scriptId, truth, characters, chapterCount) {
    const murderer = characters.find(c => c.isMurderer);
    const innocentChars = characters.filter(c => !c.isMurderer);

    for (let chapter = 1; chapter <= chapterCount; chapter++) {
      let guideData;
      if (this.aiProvider && chapter === 1) {
        try {
          const prompt = `为剧本杀中扮演凶手的玩家创建第${chapter}章的策略引导：

凶手信息：
- 角色：${murderer?.name || '凶手'}
- 作案动机：${truth.murderMotive}
- 作案手法：${truth.murderMethod}

其他角色：
${innocentChars.map(c => `- ${c.name}：${c.secretInfo || '有自己的秘密'}`).join('\n')}

请生成详细的凶手玩家引导，返回JSON格式：
{
  "strategyTips": ["策略建议1", "策略建议2", "策略建议3"],
  "speechSuggestions": ["话术建议1", "话术建议2"],
  "interferenceOptions": ["干扰选项1", "干扰选项2"],
  "scapegoatStrategies": ["替罪羊策略1", "替罪羊策略2"],
  "counterDetectionTips": ["反侦察技巧1", "反侦察技巧2"],
  "dangerSignals": ["危险信号1", "危险信号2"],
  "safeTopics": ["安全话题1", "安全话题2"]
}`;

          this.emitProgress('ai_request', { action: `生成第${chapter}章凶手引导` });
          
          const response = await this.aiProvider.callAPI([
            { role: 'system', content: '你是一个剧本杀游戏设计师，正在帮助凶手玩家获得更好的游戏体验。' },
            { role: 'user', content: prompt }
          ], { temperature: 0.7, max_tokens: 700 });

          const content = response.content || response.text || '';
          this.emitProgress('ai_response', { content: content.substring(0, 200) });
          
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            guideData = JSON.parse(jsonMatch[0]);
          }
        } catch (error) {
          console.warn(`[剧本生成器] AI生成凶手引导失败:`, error.message);
        }
      }

      if (!guideData) {
        const scapegoat = innocentChars[Math.floor(Math.random() * innocentChars.length)];
        guideData = {
          strategyTips: [
            '保持冷静，不要显得过于紧张或过于积极',
            '适度参与调查，但不要主导太多',
            `可以适当引导话题转向${scapegoat?.name || '其他嫌疑人'}的可疑行为`
          ],
          speechSuggestions: [
            '"我昨晚睡得很早，什么都没听到..."',
            '"这太可怕了，我们一定要找出凶手！"',
            '"让我想想...当时我好像看到了..."'
          ],
          interferenceOptions: [
            '质疑某条指向自己的线索的真实性',
            '提出一个看似合理但会误导调查的假设',
            '暗示某个无辜者有动机'
          ],
          scapegoatStrategies: [
            `强调${scapegoat?.name || '某人'}与受害者的矛盾`,
            '适时透露别人的秘密来转移注意力',
            '制造对其他人的怀疑氛围'
          ],
          counterDetectionTips: [
            '如果被质疑，保持适度的委屈而非愤怒',
            '用反问来回避直接回答敏感问题',
            '利用其他人的秘密来分散注意力'
          ],
          dangerSignals: [
            '当有人开始仔细核对时间线时',
            '当多人同时质疑你的证词时',
            '当关键证据被发现时'
          ],
          safeTopics: [
            '受害者的人际关系问题',
            '案发现场的环境细节',
            '其他人的可疑行为'
          ]
        };
      }

      await scriptDatabase.createMurdererGuide({
        id: uuidv4(),
        scriptId,
        chapterNumber: chapter,
        strategyTips: guideData.strategyTips,
        speechSuggestions: guideData.speechSuggestions,
        interferenceOptions: guideData.interferenceOptions,
        scapegoatStrategies: guideData.scapegoatStrategies,
        counterDetectionTips: guideData.counterDetectionTips,
        dangerSignals: guideData.dangerSignals,
        safeTopics: guideData.safeTopics
      });
    }
  }
}

// 导出单例
export default new ScriptGenerator();
export { ScriptGenerator, THEME_TEMPLATES, CHARACTER_ARCHETYPES, CLUE_TYPES, NARRATIVE_TRICKS, CHARACTER_SKILLS };
