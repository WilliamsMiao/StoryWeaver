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
你是一位专业的创意写作助手，擅长根据玩家的输入和故事上下文，生成连贯、有趣、引人入胜的故事内容。

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
    prompt += `# 生成要求
1. **字数**: 200-300字
2. **风格**: 保持与之前章节一致的叙事风格
3. **连贯性**: 必须与前文内容连贯，不能出现矛盾
4. **创新性**: 在保持连贯的基础上，适当推进剧情发展
5. **互动性**: 回应玩家的输入，但不要完全按照玩家意图，要有创意和惊喜
6. **细节**: 适当添加环境描写和细节，增强沉浸感
7. **NPC标记**: 当故事中出现NPC（非玩家角色）时，请使用格式 [NPC:名称] 来标记NPC名称，例如："[NPC:张老师]走了过来" 或 "遇到了[NPC:神秘商人]"。玩家名称不需要标记，系统会自动识别。

# 玩家输入
${playerInput}

# 任务
请根据以上信息，生成下一段故事内容。确保：
- 与前文保持连贯
- 回应玩家的输入
- 推进剧情发展
- 保持风格一致
- 字数控制在200-300字之间
- NPC名称使用 [NPC:名称] 格式标记`;
    
    return prompt;
  }
  
  /**
   * 构建章节摘要提示词
   */
  static buildSummaryPrompt(chapterContent) {
    return `# 任务
请总结以下章节内容，提取关键信息。

# 要求
1. 总结长度：50-100字
2. 包含：主要事件、关键角色、重要发现或决定
3. 格式：简洁明了，便于后续引用

# 章节内容
${chapterContent}

# 摘要
`;
  }
  
  /**
   * 构建故事结局提示词
   */
  static buildEndingPrompt(storyContext) {
    const {
      background,
      chapterMemories = [],
      longTermMemories = [],
      storyTitle = ''
    } = storyContext;
    
    let prompt = `# 任务
为这个故事生成一个令人满意的结局。

# 故事信息
`;
    
    if (storyTitle) {
      prompt += `**标题**: ${storyTitle}\n`;
    }
    
    if (background) {
      prompt += `**背景**: ${background}\n`;
    }
    
    prompt += `\n# 故事发展脉络\n`;
    
    if (chapterMemories.length > 0) {
      prompt += `## 章节摘要
${chapterMemories.map((m, i) => `${i + 1}. 第${m.chapterNumber}章: ${m.content}`).join('\n')}

`;
    }
    
    if (longTermMemories.length > 0) {
      prompt += `## 关键事件和关系
${longTermMemories.map((m, i) => `${i + 1}. [${m.memoryType}] ${m.content}`).join('\n')}

`;
    }
    
    prompt += `# 生成要求
1. **字数**: 300-500字
2. **完整性**: 解决主要冲突和悬念
3. **合理性**: 结局要符合故事发展逻辑
4. **情感**: 要有情感共鸣，可以是圆满、遗憾或开放式结局
5. **风格**: 保持与故事整体风格一致

# 结局
`;
    
    return prompt;
  }
  
  /**
   * 构建记忆提取提示词
   */
  static buildMemoryExtractionPrompt(content) {
    return `# 任务
从以下故事内容中提取重要信息，用于后续故事生成。

# 提取要求
识别以下类型的信息：
1. **角色信息**: 新出现的角色、角色关系变化
2. **关键事件**: 重要决定、发现、冲突
3. **世界设定**: 新地点、规则、设定
4. **情感线索**: 角色情感状态、关系变化

# 内容
${content}

# 提取结果
请以JSON格式输出，格式如下：
[
  {
    "type": "character|event|world|emotion",
    "content": "具体内容",
    "importance": 1-5
  }
]`;
  }
}

