/**
 * StoryWeaver 核心类型定义
 * 提供完整的类型检查和自动补全支持
 */

// ==================== 基础类型 ====================

/**
 * 游戏房间状态
 */
export type RoomStatus = 'waiting' | 'active' | 'ended' | 'paused';

/**
 * 故事状态
 */
export type StoryStatusType = 'initializing' | 'active' | 'completed' | 'paused';

/**
 * 消息类型
 */
export type MessageType = 'global' | 'private' | 'player_to_player' | 'system' | 'ai' | 'chapter';

/**
 * 玩家角色
 */
export type PlayerRole = 'host' | 'player' | 'spectator';

/**
 * AI提供商类型
 */
export type AIProvider = 'deepseek' | 'openai' | 'qwen' | 'local';

// ==================== 玩家相关 ====================

/**
 * 玩家统计数据
 */
export interface PlayerStats {
  /** 参与的故事数量 */
  totalStories: number;
  /** 创建的章节数 */
  totalChapters: number;
  /** 总字数 */
  totalWords: number;
  /** 平均响应时间（毫秒） */
  averageResponseTime: number;
  /** 最后活跃时间 */
  lastActiveAt: Date;
}

/**
 * 玩家信息
 */
export interface Player {
  /** 玩家唯一ID */
  id: string;
  /** Socket连接ID */
  socketId: string;
  /** 用户名 */
  username: string;
  /** 玩家角色 */
  role: PlayerRole;
  /** 统计数据 */
  stats: PlayerStats;
  /** 是否在线 */
  isOnline: boolean;
  /** 加入时间 */
  joinedAt: Date;
  /** 最后活动时间 */
  lastActiveAt: Date;
}

// ==================== 消息相关 ====================

/**
 * 消息可见性类型
 */
export type MessageVisibility = 'global' | 'private' | 'direct';

/**
 * 游戏消息
 */
export interface GameMessage {
  /** 消息唯一ID */
  id: string;
  /** 消息类型 */
  type: MessageType;
  /** 消息可见性 */
  visibility: MessageVisibility;
  /** 发送者ID */
  senderId: string;
  /** 发送者用户名 */
  sender: string;
  /** 接收者ID（用于私聊） */
  recipientId?: string;
  /** 接收者名称 */
  recipientName?: string;
  /** 是否为私密消息 */
  isPrivate?: boolean;
  /** 消息内容 */
  content: string;
  /** 时间戳 */
  timestamp: Date;
  /** 关联的章节号 */
  chapterNumber?: number;
  /** 房间ID */
  roomId?: string;
  /** 故事ID */
  storyId?: string;
  /** 元数据（可选） */
  metadata?: Record<string, unknown>;
}

// ==================== 故事记忆系统 ====================

/**
 * 角色关系度（-1到1，-1为敌对，0为中立，1为友好）
 */
export type CharacterRelation = number; // -1 to 1

/**
 * 故事记忆
 */
export interface StoryMemory {
  /** 短期记忆：最近10条交互 */
  shortTerm: string[];
  /** 章节摘要：历史章节总结 */
  chapterSummaries: string[];
  /** 关键事件：重要剧情节点 */
  keyEvents: string[];
  /** 角色关系：角色ID -> 关系度 */
  characterRelations: Record<string, CharacterRelation>;
  /** 世界设定：重要设定信息 */
  worldSettings: string[];
  /** 情感状态：当前故事的情感基调 */
  emotionalState: {
    tension: number; // 0-1
    mystery: number; // 0-1
    hope: number; // 0-1
    fear: number; // 0-1
  };
}

// ==================== 故事状态 ====================

/**
 * 故事状态指标
 */
export interface StoryStatus {
  /** 紧张度 0-1 */
  tension: number;
  /** 神秘度 0-1 */
  mystery: number;
  /** 故事进度 0-1 */
  progress: number;
  /** 角色发展度 0-1 */
  characterDevelopment: number;
  /** 世界探索度 0-1 */
  worldExploration: number;
}

// ==================== 章节相关 ====================

/**
 * 故事章节
 */
export interface StoryChapter {
  /** 章节ID */
  id: string;
  /** 章节号 */
  number: number;
  /** 章节开场 */
  opening: string;
  /** 章节消息列表 */
  messages: GameMessage[];
  /** AI生成的章节总结 */
  summary: string;
  /** 关键事件列表 */
  keyEvents: string[];
  /** 章节开始时间 */
  startTime: Date;
  /** 章节结束时间（null表示进行中） */
  endTime: Date | null;
  /** 字数统计 */
  wordCount: number;
  /** 作者ID */
  authorId: string;
  /** 作者用户名 */
  authorName: string;
  /** 章节状态 */
  status: 'draft' | 'active' | 'completed';
}

// ==================== 游戏故事 ====================

/**
 * 游戏故事
 */
export interface GameStory {
  /** 故事ID */
  id: string;
  /** 所属房间ID */
  roomId: string;
  /** 故事标题 */
  title: string;
  /** 故事背景 */
  background: string;
  /** 当前章节号 */
  currentChapter: number;
  /** 章节列表 */
  chapters: StoryChapter[];
  /** 故事记忆 */
  memory: StoryMemory;
  /** 故事状态指标 */
  status: StoryStatus;
  /** 故事状态类型 */
  statusType: StoryStatusType;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
}

// ==================== 游戏设置 ====================

/**
 * AI配置
 */
export interface AIConfig {
  /** AI提供商 */
  provider: AIProvider;
  /** 模型名称 */
  model: string;
  /** 温度参数 */
  temperature: number;
  /** 最大token数 */
  maxTokens: number;
  /** 自定义提示词 */
  customPrompt?: string;
}

/**
 * 游戏设置
 */
export interface GameSettings {
  /** 最大玩家数 */
  maxPlayers: number;
  /** 最小玩家数 */
  minPlayers: number;
  /** 章节字数限制 */
  chapterWordLimit: {
    min: number;
    max: number;
  };
  /** AI配置 */
  aiConfig: AIConfig;
  /** 是否允许观众 */
  allowSpectators: boolean;
  /** 房间密码（可选） */
  password?: string;
  /** 是否公开房间 */
  isPublic: boolean;
  /** 自动保存间隔（秒） */
  autoSaveInterval: number;
}

// ==================== 游戏房间 ====================

/**
 * 游戏房间
 */
export interface GameRoom {
  /** 房间ID */
  roomId: string;
  /** 房间名称 */
  name: string;
  /** 创建者ID */
  creator: string;
  /** 创建者用户名 */
  creatorName: string;
  /** 玩家映射表 */
  players: Map<string, Player>;
  /** 游戏故事 */
  story: GameStory | null;
  /** 房间状态 */
  status: RoomStatus;
  /** 游戏设置 */
  settings: GameSettings;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
  /** 开始时间（null表示未开始） */
  startedAt: Date | null;
  /** 结束时间（null表示未结束） */
  endedAt: Date | null;
}

// ==================== AI服务相关 ====================

/**
 * AI响应
 */
export interface AIResponse {
  /** 故事更新内容 */
  storyUpdate: string;
  /** 状态更新 */
  statusUpdate: Partial<StoryStatus>;
  /** 建议的下一步行动 */
  nextActions: string[];
  /** 记忆更新 */
  memoryUpdates?: string[];
  /** 使用的模型 */
  model: string;
  /** 消耗的token数 */
  tokensUsed: number;
  /** 生成时间（毫秒） */
  generationTime: number;
}

/**
 * AI生成上下文
 */
export interface AIContext {
  /** 故事背景 */
  background: string;
  /** 当前章节号 */
  currentChapter: number;
  /** 最近章节内容 */
  recentChapters: StoryChapter[];
  /** 故事记忆 */
  memory: StoryMemory;
  /** 当前故事状态 */
  storyStatus: StoryStatus;
  /** 玩家列表 */
  players: Player[];
  /** 玩家输入 */
  playerInput: string;
  /** 玩家ID */
  playerId: string;
}

// ==================== Socket事件类型 ====================

/**
 * Socket事件数据
 */
export interface SocketEvents {
  // 客户端 -> 服务器
  'create_room': {
    name: string;
    playerId: string;
    username: string;
    settings?: Partial<GameSettings>;
  };
  
  'join_room': {
    roomId: string;
    playerId: string;
    username: string;
    password?: string;
  };
  
  'send_message': {
    message: string;
  };
  
  'initialize_story': {
    title: string;
    background: string;
  };
  
  'get_room_status': {
    roomId?: string;
  };
  
  'leave_room': Record<string, never>;
  
  'update_settings': {
    settings: Partial<GameSettings>;
  };
  
  // 服务器 -> 客户端
  'room_updated': GameRoom;
  
  'new_chapter': {
    chapter: StoryChapter;
    author: Player;
    room: GameRoom;
  };
  
  'story_initialized': {
    story: GameStory;
    room: GameRoom;
  };
  
  'player_joined': {
    player: Player;
    room: GameRoom;
  };
  
  'player_left': {
    playerId: string;
    room: GameRoom;
  };
  
  'error': {
    error: string;
    code?: string;
  };
}

// ==================== 数据库实体类型 ====================

/**
 * 数据库玩家实体
 */
export interface PlayerEntity {
  id: string;
  username: string;
  created_at: string;
  total_stories: number;
  total_chapters: number;
}

/**
 * 数据库房间实体
 */
export interface RoomEntity {
  id: string;
  name: string;
  host_id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

/**
 * 数据库故事实体
 */
export interface StoryEntity {
  id: string;
  room_id: string;
  title: string;
  background: string;
  created_at: string;
  updated_at: string;
}

/**
 * 数据库章节实体
 */
export interface ChapterEntity {
  id: string;
  story_id: string;
  chapter_number: number;
  content: string;
  summary: string | null;
  author_id: string;
  created_at: string;
}

/**
 * 数据库记忆实体
 */
export interface MemoryEntity {
  id: string;
  story_id: string;
  memory_type: string;
  content: string;
  importance: number;
  created_at: string;
}

/**
 * 数据库交互实体
 */
export interface InteractionEntity {
  id: string;
  story_id: string;
  player_id: string;
  player_name: string;
  input: string;
  response: string | null;
  created_at: string;
}

// ==================== API响应类型 ====================

/**
 * API标准响应
 */
export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

/**
 * 房间列表响应
 */
export interface RoomListResponse {
  rooms: Array<{
    roomId: string;
    name: string;
    playerCount: number;
    status: RoomStatus;
    createdAt: Date;
  }>;
  total: number;
}

// ==================== 工具类型 ====================

/**
 * 部分更新类型
 */
export type PartialUpdate<T> = Partial<T> & { id: string };

/**
 * 创建类型（排除ID和时间戳）
 */
export type CreateType<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * 更新类型（只包含可更新字段）
 */
export type UpdateType<T> = Partial<Omit<T, 'id' | 'createdAt'>> & { id: string };

// ==================== 导出所有类型 ====================

export type {
  RoomStatus,
  StoryStatusType,
  MessageType,
  PlayerRole,
  AIProvider,
  CharacterRelation,
};

