export class GameStory {
  constructor({ id, roomId, title, background, chapters = [], memories = [], interactions = [] }) {
    this.id = id;
    this.roomId = roomId;
    this.title = title || '未命名故事';
    this.background = background || '';
    this.chapters = chapters;
    this.memories = memories;
    this.interactions = interactions; // 交互历史（用于短期记忆）
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }
  
  addChapter(chapter) {
    this.chapters.push(chapter);
    this.updatedAt = new Date();
  }
  
  updateChapterSummary(chapterId, summary) {
    const chapter = this.chapters.find(ch => ch.id === chapterId);
    if (chapter) {
      chapter.summary = summary;
      this.updatedAt = new Date();
    }
  }
  
  getLatestChapter() {
    return this.chapters.length > 0 
      ? this.chapters[this.chapters.length - 1] 
      : null;
  }
  
  addMemory(memory) {
    this.memories.push(memory);
    // 按重要性排序
    this.memories.sort((a, b) => {
      if (b.importance !== a.importance) {
        return b.importance - a.importance;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }
  
  addInteraction(interaction) {
    this.interactions.push(interaction);
    // 只保留最近50条交互
    if (this.interactions.length > 50) {
      this.interactions = this.interactions.slice(-50);
    }
  }
  
  getMemoriesByType(type) {
    return this.memories.filter(m => m.memoryType === type);
  }
  
  // 获取用于AI提示的记忆上下文（已废弃，使用MemoryManager）
  getMemoryContext(limit = 10) {
    // 优先选择高重要性的记忆
    return this.memories
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit)
      .map(m => `[${m.memoryType}] ${m.content}`)
      .join('\n');
  }
  
  toJSON() {
    return {
      id: this.id,
      roomId: this.roomId,
      title: this.title,
      background: this.background,
      chapters: this.chapters,
      memories: this.memories,
      interactions: this.interactions.slice(-10), // 只返回最近10条
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

