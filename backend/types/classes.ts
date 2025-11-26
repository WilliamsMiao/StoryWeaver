/**
 * StoryWeaver 核心类实现
 * 提供类型安全的类封装
 */

import type {
  GameRoom,
  GameStory,
  StoryChapter,
  GameMessage,
  Player,
  PlayerStats,
  StoryMemory,
  StoryStatus,
  GameSettings,
  AIConfig,
  RoomStatus,
  StoryStatusType,
  MessageType,
  PlayerRole,
} from './index.js';

// ==================== 玩家类 ====================

/**
 * 玩家类实现
 */
export class PlayerClass implements Player {
  id: string;
  socketId: string;
  username: string;
  role: PlayerRole;
  stats: PlayerStats;
  isOnline: boolean;
  joinedAt: Date;
  lastActiveAt: Date;

  constructor(data: Partial<Player> & { id: string; username: string }) {
    this.id = data.id;
    this.socketId = data.socketId || '';
    this.username = data.username;
    this.role = data.role || 'player';
    this.stats = data.stats || {
      totalStories: 0,
      totalChapters: 0,
      totalWords: 0,
      averageResponseTime: 0,
      lastActiveAt: new Date(),
    };
    this.isOnline = data.isOnline ?? true;
    this.joinedAt = data.joinedAt || new Date();
    this.lastActiveAt = data.lastActiveAt || new Date();
  }

  /**
   * 更新在线状态
   */
  updateOnlineStatus(isOnline: boolean): void {
    this.isOnline = isOnline;
    if (isOnline) {
      this.lastActiveAt = new Date();
    }
  }

  /**
   * 更新统计数据
   */
  updateStats(updates: Partial<PlayerStats>): void {
    this.stats = { ...this.stats, ...updates };
    this.lastActiveAt = new Date();
  }

  /**
   * 转换为JSON
   */
  toJSON(): Player {
    return {
      id: this.id,
      socketId: this.socketId,
      username: this.username,
      role: this.role,
      stats: this.stats,
      isOnline: this.isOnline,
      joinedAt: this.joinedAt,
      lastActiveAt: this.lastActiveAt,
    };
  }
}

// ==================== 游戏消息类 ====================

/**
 * 游戏消息类实现
 */
export class GameMessageClass implements GameMessage {
  id: string;
  type: MessageType;
  senderId: string;
  sender: string;
  content: string;
  timestamp: Date;
  chapterNumber?: number;
  metadata?: Record<string, unknown>;

  constructor(data: Omit<GameMessage, 'id' | 'timestamp'> & { id?: string }) {
    this.id = data.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.type = data.type;
    this.senderId = data.senderId;
    this.sender = data.sender;
    this.content = data.content;
    this.timestamp = new Date();
    this.chapterNumber = data.chapterNumber;
    this.metadata = data.metadata;
  }

  /**
   * 转换为JSON
   */
  toJSON(): GameMessage {
    return {
      id: this.id,
      type: this.type,
      senderId: this.senderId,
      sender: this.sender,
      content: this.content,
      timestamp: this.timestamp,
      chapterNumber: this.chapterNumber,
      metadata: this.metadata,
    };
  }
}

// ==================== 故事记忆类 ====================

/**
 * 故事记忆类实现
 */
export class StoryMemoryClass implements StoryMemory {
  shortTerm: string[];
  chapterSummaries: string[];
  keyEvents: string[];
  characterRelations: Record<string, number>;
  worldSettings: string[];
  emotionalState: {
    tension: number;
    mystery: number;
    hope: number;
    fear: number;
  };

  constructor(data?: Partial<StoryMemory>) {
    this.shortTerm = data?.shortTerm || [];
    this.chapterSummaries = data?.chapterSummaries || [];
    this.keyEvents = data?.keyEvents || [];
    this.characterRelations = data?.characterRelations || {};
    this.worldSettings = data?.worldSettings || [];
    this.emotionalState = data?.emotionalState || {
      tension: 0.5,
      mystery: 0.5,
      hope: 0.5,
      fear: 0.5,
    };
  }

  /**
   * 添加短期记忆
   */
  addShortTermMemory(memory: string, maxSize: number = 10): void {
    this.shortTerm.push(memory);
    if (this.shortTerm.length > maxSize) {
      this.shortTerm = this.shortTerm.slice(-maxSize);
    }
  }

  /**
   * 添加章节摘要
   */
  addChapterSummary(summary: string): void {
    this.chapterSummaries.push(summary);
  }

  /**
   * 添加关键事件
   */
  addKeyEvent(event: string): void {
    this.keyEvents.push(event);
  }

  /**
   * 更新角色关系
   */
  updateCharacterRelation(characterId: string, relation: number): void {
    this.characterRelations[characterId] = Math.max(-1, Math.min(1, relation));
  }

  /**
   * 获取角色关系
   */
  getCharacterRelation(characterId: string): number {
    return this.characterRelations[characterId] || 0;
  }

  /**
   * 更新情感状态
   */
  updateEmotionalState(updates: Partial<StoryMemory['emotionalState']>): void {
    this.emotionalState = {
      ...this.emotionalState,
      ...updates,
    };
    // 确保值在0-1范围内
    Object.keys(this.emotionalState).forEach(key => {
      const value = this.emotionalState[key as keyof typeof this.emotionalState];
      this.emotionalState[key as keyof typeof this.emotionalState] = Math.max(0, Math.min(1, value));
    });
  }

  /**
   * 转换为JSON
   */
  toJSON(): StoryMemory {
    return {
      shortTerm: [...this.shortTerm],
      chapterSummaries: [...this.chapterSummaries],
      keyEvents: [...this.keyEvents],
      characterRelations: { ...this.characterRelations },
      worldSettings: [...this.worldSettings],
      emotionalState: { ...this.emotionalState },
    };
  }
}

// ==================== 故事状态类 ====================

/**
 * 故事状态类实现
 */
export class StoryStatusClass implements StoryStatus {
  tension: number;
  mystery: number;
  progress: number;
  characterDevelopment: number;
  worldExploration: number;

  constructor(data?: Partial<StoryStatus>) {
    this.tension = this.clamp(data?.tension ?? 0.5);
    this.mystery = this.clamp(data?.mystery ?? 0.5);
    this.progress = this.clamp(data?.progress ?? 0);
    this.characterDevelopment = this.clamp(data?.characterDevelopment ?? 0);
    this.worldExploration = this.clamp(data?.worldExploration ?? 0);
  }

  /**
   * 限制值在0-1范围内
   */
  private clamp(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  /**
   * 更新状态
   */
  update(updates: Partial<StoryStatus>): void {
    if (updates.tension !== undefined) this.tension = this.clamp(updates.tension);
    if (updates.mystery !== undefined) this.mystery = this.clamp(updates.mystery);
    if (updates.progress !== undefined) this.progress = this.clamp(updates.progress);
    if (updates.characterDevelopment !== undefined) {
      this.characterDevelopment = this.clamp(updates.characterDevelopment);
    }
    if (updates.worldExploration !== undefined) {
      this.worldExploration = this.clamp(updates.worldExploration);
    }
  }

  /**
   * 转换为JSON
   */
  toJSON(): StoryStatus {
    return {
      tension: this.tension,
      mystery: this.mystery,
      progress: this.progress,
      characterDevelopment: this.characterDevelopment,
      worldExploration: this.worldExploration,
    };
  }
}

// ==================== 故事章节类 ====================

/**
 * 故事章节类实现
 */
export class StoryChapterClass implements StoryChapter {
  id: string;
  number: number;
  opening: string;
  messages: GameMessage[];
  summary: string;
  keyEvents: string[];
  startTime: Date;
  endTime: Date | null;
  wordCount: number;
  authorId: string;
  authorName: string;
  status: 'draft' | 'active' | 'completed';

  constructor(data: Omit<StoryChapter, 'id' | 'startTime' | 'endTime' | 'wordCount'> & { id?: string }) {
    this.id = data.id || `chapter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.number = data.number;
    this.opening = data.opening;
    this.messages = data.messages || [];
    this.summary = data.summary || '';
    this.keyEvents = data.keyEvents || [];
    this.startTime = new Date();
    this.endTime = null;
    this.wordCount = this.calculateWordCount();
    this.authorId = data.authorId;
    this.authorName = data.authorName;
    this.status = data.status || 'draft';
  }

  /**
   * 计算字数
   */
  private calculateWordCount(): number {
    const allText = this.opening + this.messages.map(m => m.content).join(' ');
    return allText.length;
  }

  /**
   * 添加消息
   */
  addMessage(message: GameMessage): void {
    this.messages.push(message);
    this.wordCount = this.calculateWordCount();
  }

  /**
   * 完成章节
   */
  complete(summary?: string): void {
    this.endTime = new Date();
    this.status = 'completed';
    if (summary) {
      this.summary = summary;
    }
  }

  /**
   * 转换为JSON
   */
  toJSON(): StoryChapter {
    return {
      id: this.id,
      number: this.number,
      opening: this.opening,
      messages: this.messages.map(m => m.toJSON ? m.toJSON() : m),
      summary: this.summary,
      keyEvents: [...this.keyEvents],
      startTime: this.startTime,
      endTime: this.endTime,
      wordCount: this.wordCount,
      authorId: this.authorId,
      authorName: this.authorName,
      status: this.status,
    };
  }
}

// ==================== 游戏设置类 ====================

/**
 * 游戏设置类实现
 */
export class GameSettingsClass implements GameSettings {
  maxPlayers: number;
  minPlayers: number;
  chapterWordLimit: { min: number; max: number };
  aiConfig: AIConfig;
  allowSpectators: boolean;
  password?: string;
  isPublic: boolean;
  autoSaveInterval: number;

  constructor(data?: Partial<GameSettings>) {
    this.maxPlayers = data?.maxPlayers ?? 10;
    this.minPlayers = data?.minPlayers ?? 1;
    this.chapterWordLimit = data?.chapterWordLimit || { min: 200, max: 500 };
    this.aiConfig = data?.aiConfig || {
      provider: 'deepseek',
      model: 'deepseek-chat',
      temperature: 0.8,
      maxTokens: 2000,
    };
    this.allowSpectators = data?.allowSpectators ?? false;
    this.password = data?.password;
    this.isPublic = data?.isPublic ?? true;
    this.autoSaveInterval = data?.autoSaveInterval ?? 60;
  }

  /**
   * 更新设置
   */
  update(updates: Partial<GameSettings>): void {
    Object.assign(this, updates);
  }

  /**
   * 转换为JSON
   */
  toJSON(): GameSettings {
    return {
      maxPlayers: this.maxPlayers,
      minPlayers: this.minPlayers,
      chapterWordLimit: { ...this.chapterWordLimit },
      aiConfig: { ...this.aiConfig },
      allowSpectators: this.allowSpectators,
      password: this.password,
      isPublic: this.isPublic,
      autoSaveInterval: this.autoSaveInterval,
    };
  }
}

// ==================== 游戏故事类 ====================

/**
 * 游戏故事类实现
 */
export class GameStoryClass implements GameStory {
  id: string;
  roomId: string;
  title: string;
  background: string;
  currentChapter: number;
  chapters: StoryChapter[];
  memory: StoryMemory;
  status: StoryStatus;
  statusType: StoryStatusType;
  createdAt: Date;
  updatedAt: Date;

  constructor(data: Omit<GameStory, 'id' | 'createdAt' | 'updatedAt' | 'currentChapter' | 'chapters' | 'memory' | 'status'> & { id?: string }) {
    this.id = data.id || `story_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.roomId = data.roomId;
    this.title = data.title;
    this.background = data.background;
    this.currentChapter = 0;
    this.chapters = [];
    this.memory = new StoryMemoryClass(data.memory);
    this.status = new StoryStatusClass(data.status);
    this.statusType = data.statusType || 'initializing';
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  /**
   * 添加章节
   */
  addChapter(chapter: StoryChapter): void {
    this.chapters.push(chapter);
    this.currentChapter = chapter.number;
    this.updatedAt = new Date();
  }

  /**
   * 获取当前章节
   */
  getCurrentChapter(): StoryChapter | null {
    return this.chapters.find(ch => ch.number === this.currentChapter) || null;
  }

  /**
   * 更新状态
   */
  updateStatus(updates: Partial<StoryStatus>): void {
    this.status.update(updates);
    this.updatedAt = new Date();
  }

  /**
   * 转换为JSON
   */
  toJSON(): GameStory {
    return {
      id: this.id,
      roomId: this.roomId,
      title: this.title,
      background: this.background,
      currentChapter: this.currentChapter,
      chapters: this.chapters.map(ch => ch.toJSON ? ch.toJSON() : ch),
      memory: this.memory.toJSON(),
      status: this.status.toJSON(),
      statusType: this.statusType,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

// ==================== 游戏房间类 ====================

/**
 * 游戏房间类实现
 */
export class GameRoomClass implements GameRoom {
  roomId: string;
  name: string;
  creator: string;
  creatorName: string;
  players: Map<string, Player>;
  story: GameStory | null;
  status: RoomStatus;
  settings: GameSettings;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;

  constructor(data: Omit<GameRoom, 'roomId' | 'createdAt' | 'updatedAt' | 'players' | 'story' | 'startedAt' | 'endedAt'> & { roomId?: string }) {
    this.roomId = data.roomId || `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.name = data.name;
    this.creator = data.creator;
    this.creatorName = data.creatorName;
    this.players = new Map();
    this.story = null;
    this.status = data.status || 'waiting';
    this.settings = new GameSettingsClass(data.settings);
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.startedAt = null;
    this.endedAt = null;
  }

  /**
   * 添加玩家
   */
  addPlayer(player: Player): void {
    this.players.set(player.id, player);
    this.updatedAt = new Date();
  }

  /**
   * 移除玩家
   */
  removePlayer(playerId: string): boolean {
    const removed = this.players.delete(playerId);
    if (removed) {
      this.updatedAt = new Date();
    }
    return removed;
  }

  /**
   * 获取玩家
   */
  getPlayer(playerId: string): Player | undefined {
    return this.players.get(playerId);
  }

  /**
   * 获取玩家列表
   */
  getPlayersList(): Player[] {
    return Array.from(this.players.values());
  }

  /**
   * 设置故事
   */
  setStory(story: GameStory): void {
    this.story = story;
    if (this.status === 'waiting') {
      this.status = 'active';
      this.startedAt = new Date();
    }
    this.updatedAt = new Date();
  }

  /**
   * 更新状态
   */
  updateStatus(status: RoomStatus): void {
    this.status = status;
    if (status === 'ended') {
      this.endedAt = new Date();
    }
    this.updatedAt = new Date();
  }

  /**
   * 转换为JSON（将Map转换为数组）
   */
  toJSON(): Omit<GameRoom, 'players'> & { players: Player[] } {
    return {
      roomId: this.roomId,
      name: this.name,
      creator: this.creator,
      creatorName: this.creatorName,
      players: this.getPlayersList(),
      story: this.story?.toJSON ? this.story.toJSON() : this.story,
      status: this.status,
      settings: this.settings.toJSON(),
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
    };
  }
}

