/**
 * 章节历史管理器
 * 存储完整章节记录，支持时间线浏览和章节间导航
 */
import database from '../../storage/database.js';

export class ChapterHistory {
  constructor(storyId) {
    this.storyId = storyId;
    this.chapters = []; // 内存缓存
    this.timeline = []; // 时间线数据
  }
  
  /**
   * 加载章节历史
   */
  async loadHistory() {
    const chapters = await database.getChapters(this.storyId);
    
    this.chapters = chapters.map(ch => ({
      id: ch.id,
      number: ch.chapter_number,
      content: ch.content,
      summary: ch.summary,
      authorId: ch.author_id,
      createdAt: new Date(ch.created_at),
      wordCount: ch.content?.length || 0
    }));
    
    // 构建时间线
    this.buildTimeline();
    
    return this.chapters;
  }
  
  /**
   * 构建时间线
   */
  buildTimeline() {
    this.timeline = this.chapters.map((chapter, index) => ({
      id: chapter.id,
      chapterNumber: chapter.number,
      timestamp: chapter.createdAt,
      title: `第${chapter.number}章`,
      summary: chapter.summary || chapter.content?.substring(0, 100) + '...',
      wordCount: chapter.wordCount,
      authorId: chapter.authorId,
      previousChapter: index > 0 ? this.chapters[index - 1].id : null,
      nextChapter: index < this.chapters.length - 1 ? this.chapters[index + 1].id : null
    }));
  }
  
  /**
   * 获取章节列表
   * @param {Object} options - 选项
   * @returns {Array} 章节列表
   */
  getChapters(options = {}) {
    const {
      limit = null,
      offset = 0,
      sortBy = 'number', // 'number' | 'time' | 'wordCount'
      order = 'asc' // 'asc' | 'desc'
    } = options;
    
    let chapters = [...this.chapters];
    
    // 排序
    chapters.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'number':
          comparison = a.number - b.number;
          break;
        case 'time':
          comparison = a.createdAt - b.createdAt;
          break;
        case 'wordCount':
          comparison = a.wordCount - b.wordCount;
          break;
      }
      
      return order === 'asc' ? comparison : -comparison;
    });
    
    // 分页
    if (limit) {
      chapters = chapters.slice(offset, offset + limit);
    }
    
    return chapters;
  }
  
  /**
   * 获取章节详情
   * @param {string} chapterId - 章节ID
   * @returns {Object|null} 章节详情
   */
  getChapter(chapterId) {
    return this.chapters.find(ch => ch.id === chapterId) || null;
  }
  
  /**
   * 根据章节号获取章节
   * @param {number} chapterNumber - 章节号
   * @returns {Object|null} 章节详情
   */
  getChapterByNumber(chapterNumber) {
    return this.chapters.find(ch => ch.number === chapterNumber) || null;
  }
  
  /**
   * 获取时间线
   * @param {Object} options - 选项
   * @returns {Array} 时间线数据
   */
  getTimeline(options = {}) {
    const {
      startDate = null,
      endDate = null,
      limit = null
    } = options;
    
    let timeline = [...this.timeline];
    
    // 时间过滤
    if (startDate) {
      timeline = timeline.filter(item => item.timestamp >= startDate);
    }
    if (endDate) {
      timeline = timeline.filter(item => item.timestamp <= endDate);
    }
    
    // 限制数量
    if (limit) {
      timeline = timeline.slice(0, limit);
    }
    
    return timeline;
  }
  
  /**
   * 获取相邻章节
   * @param {string} chapterId - 当前章节ID
   * @returns {Object} { previous, current, next }
   */
  getAdjacentChapters(chapterId) {
    const current = this.getChapter(chapterId);
    if (!current) {
      return { previous: null, current: null, next: null };
    }
    
    const index = this.chapters.findIndex(ch => ch.id === chapterId);
    
    return {
      previous: index > 0 ? this.chapters[index - 1] : null,
      current: current,
      next: index < this.chapters.length - 1 ? this.chapters[index + 1] : null
    };
  }
  
  /**
   * 搜索章节
   * @param {string} query - 搜索关键词
   * @returns {Array} 匹配的章节
   */
  searchChapters(query) {
    if (!query || query.trim().length === 0) {
      return [];
    }
    
    const lowerQuery = query.toLowerCase();
    
    return this.chapters.filter(chapter => {
      const content = (chapter.content || '').toLowerCase();
      const summary = (chapter.summary || '').toLowerCase();
      
      return content.includes(lowerQuery) || summary.includes(lowerQuery);
    });
  }
  
  /**
   * 获取章节统计信息
   * @returns {Object} 统计信息
   */
  getStatistics() {
    if (this.chapters.length === 0) {
      return {
        totalChapters: 0,
        totalWords: 0,
        averageWords: 0,
        longestChapter: null,
        shortestChapter: null,
        averageChapterLength: 0
      };
    }
    
    const totalWords = this.chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
    const averageWords = totalWords / this.chapters.length;
    
    const sortedByLength = [...this.chapters].sort((a, b) => b.wordCount - a.wordCount);
    
    const timeSpans = [];
    for (let i = 1; i < this.chapters.length; i++) {
      const span = this.chapters[i].createdAt - this.chapters[i - 1].createdAt;
      timeSpans.push(span);
    }
    const averageChapterLength = timeSpans.length > 0
      ? timeSpans.reduce((sum, span) => sum + span, 0) / timeSpans.length
      : 0;
    
    return {
      totalChapters: this.chapters.length,
      totalWords,
      averageWords: Math.round(averageWords),
      longestChapter: sortedByLength[0] ? {
        number: sortedByLength[0].number,
        wordCount: sortedByLength[0].wordCount
      } : null,
      shortestChapter: sortedByLength[sortedByLength.length - 1] ? {
        number: sortedByLength[sortedByLength.length - 1].number,
        wordCount: sortedByLength[sortedByLength.length - 1].wordCount
      } : null,
      averageChapterLength: Math.round(averageChapterLength / (1000 * 60)) // 分钟
    };
  }
  
  /**
   * 获取章节范围
   * @param {number} startChapter - 起始章节号
   * @param {number} endChapter - 结束章节号
   * @returns {Array} 章节列表
   */
  getChapterRange(startChapter, endChapter) {
    return this.chapters.filter(ch => 
      ch.number >= startChapter && ch.number <= endChapter
    );
  }
  
  /**
   * 导出章节历史（用于备份或分享）
   * @param {Object} options - 选项
   * @returns {Object} 导出的数据
   */
  exportHistory(options = {}) {
    const {
      includeContent = true,
      includeSummary = true,
      format = 'json' // 'json' | 'markdown' | 'text'
    } = options;
    
    const data = {
      storyId: this.storyId,
      exportedAt: new Date(),
      totalChapters: this.chapters.length,
      chapters: this.chapters.map(ch => ({
        number: ch.number,
        createdAt: ch.createdAt,
        wordCount: ch.wordCount,
        authorId: ch.authorId,
        ...(includeSummary && ch.summary ? { summary: ch.summary } : {}),
        ...(includeContent ? { content: ch.content } : {})
      }))
    };
    
    if (format === 'markdown') {
      return this.formatAsMarkdown(data);
    } else if (format === 'text') {
      return this.formatAsText(data);
    }
    
    return data;
  }
  
  /**
   * 格式化为Markdown
   */
  formatAsMarkdown(data) {
    let markdown = `# 故事章节历史\n\n`;
    markdown += `**导出时间**: ${data.exportedAt.toLocaleString()}\n`;
    markdown += `**总章节数**: ${data.totalChapters}\n\n`;
    
    data.chapters.forEach(ch => {
      markdown += `## 第${ch.number}章\n\n`;
      if (ch.summary) {
        markdown += `**摘要**: ${ch.summary}\n\n`;
      }
      if (ch.content) {
        markdown += `${ch.content}\n\n`;
      }
      markdown += `---\n\n`;
    });
    
    return markdown;
  }
  
  /**
   * 格式化为纯文本
   */
  formatAsText(data) {
    let text = `故事章节历史\n`;
    text += `导出时间: ${data.exportedAt.toLocaleString()}\n`;
    text += `总章节数: ${data.totalChapters}\n\n`;
    
    data.chapters.forEach(ch => {
      text += `第${ch.number}章\n`;
      if (ch.summary) {
        text += `摘要: ${ch.summary}\n`;
      }
      if (ch.content) {
        text += `${ch.content}\n\n`;
      }
      text += `---\n\n`;
    });
    
    return text;
  }
  
  /**
   * 添加章节到历史
   */
  addChapter(chapter) {
    this.chapters.push({
      id: chapter.id,
      number: chapter.number,
      content: chapter.content,
      summary: chapter.summary,
      authorId: chapter.authorId,
      createdAt: chapter.createdAt || new Date(),
      wordCount: chapter.wordCount || chapter.content?.length || 0
    });
    
    // 重新构建时间线
    this.buildTimeline();
  }
  
  /**
   * 更新章节
   */
  updateChapter(chapterId, updates) {
    const index = this.chapters.findIndex(ch => ch.id === chapterId);
    if (index !== -1) {
      this.chapters[index] = { ...this.chapters[index], ...updates };
      this.buildTimeline();
    }
  }
}

export default ChapterHistory;

