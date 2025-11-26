/**
 * 智能提示词构建器
 * 负责构建包含完整上下文的提示词
 */
export class PromptBuilder {
  /**
   * 构建故事生成提示词
   */
  static buildStoryPrompt(context, playerInput) {
    const {
      background,
      shortTermMemories = [],
      chapterMemories = [],
      longTermMemories = [],
      players = [],
      recentChapters = [],
      storyTitle = '',
      currentChapter = 0
    } = context;
    
    let prompt = `# 角色设定
你是一位专业的剧本杀游戏主持人（DM），负责根据玩家的行动和故事上下文，推进剧情发展。

## 游戏类型
这是一款**多人在线剧本杀游戏**，玩家需要通过探索、推理、互动来揭开谜团。

# 故事信息
`;
    
    if (storyTitle) {
      prompt += `**故事标题**: ${storyTitle}\n`;
    }
    prompt += `**当前章节**: 第 ${currentChapter + 1} 章\n\n`;
    
    // 故事背景
    if (background) {
      prompt += `## 故事背景
${background}

`;
    }
    
    // 长期记忆（关键事件和角色关系）
    if (longTermMemories.length > 0) {
      prompt += `## 重要记忆（长期）
这些是关键事件和角色关系，必须在故事中保持一致：
${longTermMemories.map((m, i) => `${i + 1}. [${m.memoryType}] ${m.content}`).join('\n')}

`;
    }
    
    // 章节记忆（章节摘要）
    if (chapterMemories.length > 0) {
      prompt += `## 章节摘要
${chapterMemories.map((m, i) => `第${m.chapterNumber}章: ${m.content}`).join('\n')}

`;
    }
    
    // 短期记忆（最近交互）
    if (shortTermMemories.length > 0) {
      prompt += `## 最近互动（短期记忆）
${shortTermMemories.map((m, i) => `${i + 1}. ${m.playerName}: "${m.input}" → ${m.response}`).join('\n')}

`;
    }
    
    // 玩家角色信息
    if (players.length > 0) {
      prompt += `## 玩家角色
${players.map(p => `- ${p.username}${p.role ? ` (${p.role})` : ''}`).join('\n')}

`;
    }
    
    // 最近章节内容（用于保持连贯性）
    if (recentChapters.length > 0) {
      prompt += `## 最近章节内容
${recentChapters.map((ch, i) => `第${ch.chapterNumber}章: ${ch.content.substring(0, 200)}...`).join('\n\n')}

`;
    }
    
    // 生成要求
    prompt += `# 剧本杀故事生成要求
1. **字数**: 200-400字
2. **悬疑元素**: 维持神秘感，适时释放线索但不要直接揭示真相
3. **连贯性**: 必须与前文内容连贯，不能出现矛盾
4. **互动反馈**: 根据玩家的行动给出合理的反馈，展示行动的后果
5. **NPC反应**: NPC应该根据玩家的行动做出符合性格的反应
6. **氛围营造**: 保持剧本杀的悬疑紧张氛围
7. **推进剧情**: 在回应玩家的同时，适当推进主线剧情
8. **NPC标记**: 当故事中出现NPC时，使用格式 [NPC:名称] 标记

# 玩家行动
${playerInput}

# 任务
请根据玩家的行动，生成故事的下一段发展：
- 描述玩家行动的结果和发现
- NPC对玩家行动的反应
- 可能发现的新线索或信息
- 保持悬疑氛围
- 为后续探索留下空间`;
    
    return prompt;
  }
  
  /**
   * 构建章节摘要提示词 - 剧本杀专用
   */
  static buildSummaryPrompt(chapterContent) {
    return `# 任务
请总结以下剧本杀章节内容，提取关键线索和事件。

# 要求
1. 总结长度：50-100字
2. 重点提取：
   - 新发现的线索或证据
   - 嫌疑人的可疑行为
   - 人物关系的变化
   - 玩家做出的重要选择
3. 格式：简洁明了，便于后续推理引用

# 章节内容
${chapterContent}

# 摘要
`;
  }
  
  /**
   * 构建故事结局提示词 - 剧本杀专用
   */
  static buildEndingPrompt(storyContext) {
    const {
      background,
      chapterMemories = [],
      longTermMemories = [],
      storyTitle = ''
    } = storyContext;
    
    let prompt = `# 任务
为这个剧本杀案件生成真相揭晓和结局。

# 案件信息
`;
    
    if (storyTitle) {
      prompt += `**案件名称**: ${storyTitle}\n`;
    }
    
    if (background) {
      prompt += `**案件背景**: ${background}\n`;
    }
    
    prompt += `\n# 调查进展\n`;
    
    if (chapterMemories.length > 0) {
      prompt += `## 各阶段调查摘要
${chapterMemories.map((m, i) => `${i + 1}. 第${m.chapterNumber}章: ${m.content}`).join('\n')}

`;
    }
    
    if (longTermMemories.length > 0) {
      prompt += `## 关键线索和发现
${longTermMemories.map((m, i) => `${i + 1}. [${m.memoryType}] ${m.content}`).join('\n')}

`;
    }
    
    prompt += `# 结局生成要求
1. **字数**: 300-500字
2. **真相揭晓**: 揭示凶手身份、作案动机、作案手法
3. **线索呼应**: 回顾之前埋下的伏笔和线索，解释其意义
4. **角色结局**: 交代主要角色的命运
5. **情感共鸣**: 营造案件告破的释然感，同时保留对人性的思考
6. **逻辑自洽**: 结局要符合案件发展逻辑，不能有漏洞

# 真相与结局
`;
    
    return prompt;
  }
  
  /**
   * 构建记忆提取提示词 - 剧本杀专用
   */
  static buildMemoryExtractionPrompt(content) {
    return `# 任务
从以下剧本杀内容中提取关键线索和信息，用于后续推理和剧情生成。

# 提取要求
识别以下类型的信息：
1. **线索证据**: 物证、书证、人证等可用于推理的线索
2. **嫌疑人信息**: 嫌疑人的动机、机会、不在场证明
3. **人物关系**: 角色之间的关系、矛盾、秘密
4. **时间线**: 关键事件的时间顺序
5. **玩家行动**: 玩家做出的重要选择和调查方向

# 内容
${content}

# 提取结果
请以JSON格式输出，格式如下：
[
  {
    "type": "clue|suspect|relationship|timeline|action",
    "content": "具体内容",
    "importance": 1-5
  }
]`;
  }
}

