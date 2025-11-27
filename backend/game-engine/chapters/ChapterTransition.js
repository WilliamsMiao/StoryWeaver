/**
 * 章节过渡器
 * AI生成章节结尾总结，提取关键信息，生成新章节开场
 */
import { v4 as uuidv4 } from 'uuid';
import AIService from '../../ai-service/AIService.js';
import { LongTermMemory } from '../../ai-service/memory/index.js';
import database from '../../storage/database.js';

export class ChapterTransition {
  constructor(storyId, options = {}) {
    this.storyId = storyId;
    this.longTermMemory = new LongTermMemory(storyId);
    this.enableRandomEvents = options.enableRandomEvents !== false;
    this.randomEventProbability = options.randomEventProbability || 0.3;
  }
  
  /**
   * 执行章节过渡
   * @param {Object} currentChapter - 当前章节
   * @param {Object} story - 完整故事对象
   * @param {Object} context - 上下文信息
   * @returns {Promise<Object>} 过渡结果 { ending, newChapterOpening, keyMemories, randomEvent }
   */
  async transitionToNewChapter(currentChapter, story, context = {}) {
    // 1. 生成章节结尾总结
    const ending = await this.generateChapterEnding(currentChapter, story);
    
    // 2. 提取关键信息进入长期记忆
    const keyMemories = await this.extractKeyMemories(currentChapter, story);
    
    // 3. 生成新章节开场
    const newChapterOpening = await this.generateNewChapterOpening(
      currentChapter,
      story,
      ending,
      keyMemories
    );
    
    // 4. 可能引入随机事件
    let randomEvent = null;
    if (this.enableRandomEvents && Math.random() < this.randomEventProbability) {
      randomEvent = await this.generateRandomEvent(story, keyMemories);
    }
    
    // 5. 完成当前章节
    await this.completeCurrentChapter(currentChapter, ending);
    
    return {
      ending,
      newChapterOpening,
      keyMemories,
      randomEvent,
      transitionTime: new Date()
    };
  }
  
  /**
   * 生成章节结尾总结
   */
  async generateChapterEnding(currentChapter, story) {
    const prompt = this.buildEndingPrompt(currentChapter, story);
    
    try {
      // 使用AI生成结尾
      const ending = await AIService.summarizeChapter(prompt);
      return ending;
    } catch (error) {
      console.error('生成章节结尾失败:', error);
      // 备用方案：简单总结
      return this.generateSimpleEnding(currentChapter);
    }
  }
  
  /**
   * 构建结尾提示词
   */
  buildEndingPrompt(currentChapter, story) {
    const keyEvents = currentChapter.keyEvents?.join('；') || '';
    const recentContent = currentChapter.content?.substring(-500) || '';
    
    return `请为当前章节生成一个总结性的结尾段落（100-150字），要求：
1. 总结本章节的主要事件和进展
2. 为下一章节留下悬念或过渡
3. 保持与故事整体风格一致

故事背景：${story.background || ''}
章节标题：第${currentChapter.number}章
关键事件：${keyEvents}
最近内容：${recentContent}

请生成章节结尾：`;
  }
  
  /**
   * 生成简单结尾（备用方案）
   */
  generateSimpleEnding(currentChapter) {
    const content = currentChapter.content || '';
    const sentences = content.split(/[。！？]/).filter(s => s.trim().length > 10);
    
    if (sentences.length === 0) {
      return '这一章的故事暂时告一段落，新的冒险即将开始...';
    }
    
    // 取最后几句作为结尾
    const ending = sentences.slice(-3).join('。');
    return ending + '。这一章的故事暂时告一段落。';
  }
  
  /**
   * 提取关键信息进入长期记忆
   */
  async extractKeyMemories(currentChapter, story) {
    const memories = [];
    const content = currentChapter.content || '';
    
    // 提取关键事件
    const keyEvents = currentChapter.keyEvents || [];
    for (const event of keyEvents) {
      await this.longTermMemory.addKeyEvent(event, 4);
      memories.push({ type: 'event', content: event });
    }
    
    // 从内容中提取记忆
    const extracted = await this.longTermMemory.extractAndSaveMemories(content);
    memories.push(...extracted);
    
    // 提取角色关系变化
    const relationPatterns = [
      /([^，。！？]+)(和|与)([^，。！？]+)(成为|变成|是)(朋友|敌人|恋人|伙伴)/g,
      /([^，。！？]+)(对|向)([^，。！？]+)(表示|说|告诉)([^，。！？]+)/g
    ];
    
    relationPatterns.forEach(pattern => {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[3]) {
          // 简单判断关系变化
          let relation = 0;
          if (match[4]?.includes('朋友') || match[4]?.includes('伙伴')) {
            relation = 0.7;
          } else if (match[4]?.includes('敌人')) {
            relation = -0.7;
          }
          
          if (relation !== 0) {
            this.longTermMemory.updateCharacterRelation(
              match[1].trim(),
              match[3].trim(),
              relation,
              match[0]
            );
            memories.push({
              type: 'relation',
              character1: match[1].trim(),
              character2: match[3].trim(),
              relation
            });
          }
        }
      }
    });
    
    return memories;
  }
  
  /**
   * 生成新章节开场
   */
  async generateNewChapterOpening(currentChapter, story, ending, keyMemories) {
    const prompt = this.buildOpeningPrompt(currentChapter, story, ending, keyMemories);
    
    try {
      // 使用AI生成开场
      const context = {
        title: story.title,
        background: story.background,
        currentChapter: currentChapter.number + 1,
        chapters: story.chapters || [],
        memories: keyMemories,
        previousChapterEnding: ending
      };
      
      const opening = await AIService.generateStoryResponse(
        context,
        `请为新章节（第${currentChapter.number + 1}章）生成一个开场段落（150-200字），要求：
1. 与上一章节的结尾自然衔接
2. 引入新的场景或情节
3. 保持故事连贯性和风格一致
4. 可以适当引入悬念或新元素`
      );
      
      return opening.content;
    } catch (error) {
      console.error('生成新章节开场失败:', error);
      return this.generateSimpleOpening(currentChapter, ending);
    }
  }
  
  /**
   * 构建开场提示词
   */
  buildOpeningPrompt(currentChapter, story, ending, keyMemories) {
    const recentChapters = story.chapters?.slice(-3) || [];
    const chapterSummaries = recentChapters
      .filter(ch => ch.summary)
      .map(ch => `第${ch.number}章: ${ch.summary}`)
      .join('\n');
    
    return `请为当前章节生成一个总结，并基于以下关键事件开始新章节：

故事背景：${story.background || ''}
上一章节结尾：${ending}
章节摘要：${chapterSummaries}
关键记忆：${keyMemories.map(m => m.content || JSON.stringify(m)).join('；')}

请生成新章节开场：`;
  }
  
  /**
   * 生成简单开场（备用方案）
   */
  generateSimpleOpening(currentChapter, ending) {
    return `时间流逝，故事继续发展。${ending}新的篇章即将展开...`;
  }
  
  /**
   * 生成随机事件
   */
  async generateRandomEvent(story, keyMemories) {
    const eventTypes = [
      '意外发现',
      '神秘访客',
      '环境变化',
      '角色冲突',
      '新线索出现',
      '时间跳跃'
    ];
    
    const randomType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    
    try {
      const context = {
        title: story.title,
        background: story.background,
        currentChapter: story.chapters?.length || 0,
        memories: keyMemories
      };
      
      const prompt = `在故事中引入一个"${randomType}"类型的随机事件（50-100字），要求：
1. 与当前故事发展相关
2. 增加故事的趣味性和不可预测性
3. 不要过于突兀，保持逻辑性
4. 为后续情节留下发展空间`;
      
      const response = await AIService.generateStoryResponse(context, prompt);
      
      return {
        type: randomType,
        description: response.content,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('生成随机事件失败:', error);
      return {
        type: randomType,
        description: `一个${randomType}改变了故事的走向...`,
        timestamp: new Date()
      };
    }
  }
  
  /**
   * 完成当前章节
   */
  async completeCurrentChapter(chapter, ending) {
    // 更新章节内容，添加结尾
    const updatedContent = (chapter.content || '') + '\n\n' + ending;
    
    // 更新数据库
    await database.updateChapterSummary(chapter.id, ending);
    
    // 标记章节为已完成
    // 注意：这里假设有updateChapter方法，如果没有需要添加
    // await database.updateChapter(chapter.id, {
    //   content: updatedContent,
    //   endTime: new Date(),
    //   status: 'completed'
    // });
  }
  
  /**
   * 创建新章节
   */
  async createNewChapter(story, opening, randomEvent = null) {
    const chapterId = uuidv4();
    const chapterNumber = (story.chapters?.length || 0) + 1;
    
    let chapterContent = opening;
    
    // 如果有随机事件，添加到开场
    if (randomEvent) {
      chapterContent += `\n\n[${randomEvent.type}] ${randomEvent.description}`;
    }
    
    const chapter = {
      id: chapterId,
      storyId: story.id,
      chapterNumber,
      opening,
      content: chapterContent,
      messages: [],
      summary: null,
      keyEvents: [],
      startTime: new Date(),
      endTime: null,
      wordCount: chapterContent.length,
      authorId: null,  // 系统生成的章节不关联玩家
      authorName: '系统',
      status: 'active'
    };
    
    // 保存到数据库
    await database.createChapter(
      chapterId,
      story.id,
      chapterNumber,
      chapterContent,
      null,  // 系统生成的章节不关联玩家
      null
    );
    
    return chapter;
  }
}

export default ChapterTransition;

