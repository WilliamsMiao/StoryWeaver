import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import config from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 数据库操作类
 * 提供SQLite数据库操作、游戏状态序列化和恢复
 */
class Database {
  constructor() {
    this.db = null;
    this.autoSaveInterval = null;
    this.autoSaveEnabled = true;
    this.autoSaveIntervalMs = 60000; // 60秒自动保存
  }
  
  async connect() {
    return new Promise((resolve, reject) => {
      // 确保数据目录存在
      const dbDir = dirname(config.dbPath);
      if (!existsSync(dbDir)) {
        mkdirSync(dbDir, { recursive: true });
      }
      
      this.db = new sqlite3.Database(config.dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('数据库连接成功:', config.dbPath);
          this.initTables().then(resolve).catch(reject);
        }
      });
      
      // 启用Promise支持
      this.db.run = promisify(this.db.run.bind(this.db));
      this.db.get = promisify(this.db.get.bind(this.db));
      this.db.all = promisify(this.db.all.bind(this.db));
      
      // SQLite 生产环境优化
      const isProduction = process.env.NODE_ENV === 'production';
      
      // 启用WAL模式（提高并发性能）
      this.db.run('PRAGMA journal_mode = WAL;').catch(() => {});
      
      // 启用外键约束
      this.db.run('PRAGMA foreign_keys = ON;').catch(() => {});
      
      // 生产环境性能优化
      if (isProduction) {
        // 设置忙等待超时（5秒）
        this.db.run('PRAGMA busy_timeout = 5000;').catch(() => {});
        
        // 设置缓存大小（64MB，负值表示以KB为单位）
        this.db.run('PRAGMA cache_size = -64000;').catch(() => {});
        
        // 设置同步模式（NORMAL 平衡性能和安全性）
        this.db.run('PRAGMA synchronous = NORMAL;').catch(() => {});
        
        // 设置临时存储模式（内存）
        this.db.run('PRAGMA temp_store = MEMORY;').catch(() => {});
        
        // 设置页面大小（如果数据库是新创建的）
        this.db.run('PRAGMA page_size = 4096;').catch(() => {});
      }
    });
    
    // 启动自动保存
    if (this.autoSaveEnabled) {
      this.startAutoSave();
    }
  }
  
  /**
   * 启动自动保存
   */
  startAutoSave() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    
    this.autoSaveInterval = setInterval(async () => {
      try {
        // 执行WAL检查点（将WAL文件合并到主数据库）
        if (this.db) {
          await this.db.run('PRAGMA wal_checkpoint(TRUNCATE);');
        }
      } catch (error) {
        console.error('自动保存失败:', error);
      }
    }, this.autoSaveIntervalMs);
  }
  
  /**
   * 停止自动保存
   */
  stopAutoSave() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }
  
  async initTables() {
    // 玩家表
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        total_stories INTEGER DEFAULT 0,
        total_chapters INTEGER DEFAULT 0
      )
    `);
    
    // 房间表
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        host_id TEXT NOT NULL,
        status TEXT DEFAULT 'waiting',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (host_id) REFERENCES players(id)
      )
    `);
    
    // 故事表
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS stories (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        title TEXT,
        background TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES rooms(id)
      )
    `);
    
    // 章节表
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS chapters (
        id TEXT PRIMARY KEY,
        story_id TEXT NOT NULL,
        chapter_number INTEGER NOT NULL,
        content TEXT NOT NULL,
        summary TEXT,
        author_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (story_id) REFERENCES stories(id),
        FOREIGN KEY (author_id) REFERENCES players(id)
      )
    `);
    
    // 交互历史表（用于短期记忆）
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS interactions (
        id TEXT PRIMARY KEY,
        story_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        input TEXT NOT NULL,
        response TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (story_id) REFERENCES stories(id),
        FOREIGN KEY (player_id) REFERENCES players(id)
      )
    `);
    
    // 记忆表（分层记忆系统）
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        story_id TEXT NOT NULL,
        memory_type TEXT NOT NULL,
        content TEXT NOT NULL,
        importance INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (story_id) REFERENCES stories(id)
      )
    `);
    
    // 房间玩家关联表
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS room_players (
        room_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        role TEXT DEFAULT 'player',
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (room_id, player_id),
        FOREIGN KEY (room_id) REFERENCES rooms(id),
        FOREIGN KEY (player_id) REFERENCES players(id)
      )
    `);
    
    // 消息表
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        story_id TEXT,
        sender_id TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        recipient_id TEXT,
        recipient_name TEXT,
        message_type TEXT NOT NULL,
        visibility TEXT NOT NULL,
        content TEXT NOT NULL,
        chapter_number INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES rooms(id),
        FOREIGN KEY (story_id) REFERENCES stories(id),
        FOREIGN KEY (sender_id) REFERENCES players(id)
      )
    `);
    
    // 章节TODO表
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS chapter_todos (
        id TEXT PRIMARY KEY,
        chapter_id TEXT NOT NULL,
        story_id TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        priority INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chapter_id) REFERENCES chapters(id),
        FOREIGN KEY (story_id) REFERENCES stories(id)
      )
    `);
    
    // 玩家反馈进度表
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS player_feedback_progress (
        id TEXT PRIMARY KEY,
        chapter_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        todo_id TEXT,
        feedback_count INTEGER DEFAULT 0,
        completion_rate REAL DEFAULT 0.0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        timeout_at DATETIME,
        FOREIGN KEY (chapter_id) REFERENCES chapters(id),
        FOREIGN KEY (player_id) REFERENCES players(id),
        FOREIGN KEY (todo_id) REFERENCES chapter_todos(id)
      )
    `);
    
    // 创建索引以提高查询性能
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_messages_recipient_id ON messages(recipient_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_chapter_todos_chapter_id ON chapter_todos(chapter_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_player_feedback_chapter_id ON player_feedback_progress(chapter_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_player_feedback_player_id ON player_feedback_progress(player_id)`);
    
    console.log('数据库表初始化完成');
  }
  
  async close() {
    // 停止自动保存
    this.stopAutoSave();
    
    // 执行最终检查点
    if (this.db) {
      try {
        await this.db.run('PRAGMA wal_checkpoint(TRUNCATE);');
      } catch (error) {
        console.error('最终检查点失败:', error);
      }
    }
    
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  }
  
  /**
   * 开始事务
   */
  async beginTransaction() {
    await this.db.run('BEGIN TRANSACTION');
  }
  
  /**
   * 提交事务
   */
  async commit() {
    await this.db.run('COMMIT');
  }
  
  /**
   * 回滚事务
   */
  async rollback() {
    await this.db.run('ROLLBACK');
  }
  
  /**
   * 执行事务操作
   * @param {Function} fn - 事务函数
   */
  async transaction(fn) {
    try {
      await this.beginTransaction();
      const result = await fn();
      await this.commit();
      return result;
    } catch (error) {
      await this.rollback();
      throw error;
    }
  }
  
  // 玩家相关操作
  async createPlayer(id, username) {
    await this.db.run(
      'INSERT INTO players (id, username) VALUES (?, ?)',
      [id, username]
    );
  }
  
  async getPlayer(id) {
    return await this.db.get('SELECT * FROM players WHERE id = ?', [id]);
  }
  
  // 房间相关操作
  async createRoom(id, name, hostId) {
    await this.db.run(
      'INSERT INTO rooms (id, name, host_id, status) VALUES (?, ?, ?, ?)',
      [id, name, hostId, 'waiting']
    );
  }
  
  async getRoom(id) {
    return await this.db.get('SELECT * FROM rooms WHERE id = ?', [id]);
  }
  
  async updateRoomStatus(id, status) {
    await this.db.run(
      'UPDATE rooms SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, id]
    );
  }
  
  async addPlayerToRoom(roomId, playerId, role = 'player') {
    await this.db.run(
      'INSERT OR REPLACE INTO room_players (room_id, player_id, role) VALUES (?, ?, ?)',
      [roomId, playerId, role]
    );
  }
  
  async getRoomPlayers(roomId) {
    return await this.db.all(
      `SELECT p.*, rp.role, rp.joined_at 
       FROM players p 
       JOIN room_players rp ON p.id = rp.player_id 
       WHERE rp.room_id = ?`,
      [roomId]
    );
  }
  
  // 故事相关操作
  async createStory(id, roomId, title, background) {
    await this.db.run(
      'INSERT INTO stories (id, room_id, title, background) VALUES (?, ?, ?, ?)',
      [id, roomId, title, background]
    );
  }
  
  async getStory(roomId) {
    return await this.db.get('SELECT * FROM stories WHERE room_id = ?', [roomId]);
  }
  
  async updateStory(id, updates) {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    await this.db.run(
      `UPDATE stories SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...values, id]
    );
  }
  
  // 章节相关操作
  async createChapter(id, storyId, chapterNumber, content, authorId, summary = null) {
    await this.db.run(
      'INSERT INTO chapters (id, story_id, chapter_number, content, summary, author_id) VALUES (?, ?, ?, ?, ?, ?)',
      [id, storyId, chapterNumber, content, summary, authorId]
    );
  }
  
  async updateChapterSummary(id, summary) {
    await this.db.run(
      'UPDATE chapters SET summary = ? WHERE id = ?',
      [summary, id]
    );
  }
  
  async getChapters(storyId) {
    return await this.db.all(
      'SELECT * FROM chapters WHERE story_id = ? ORDER BY chapter_number ASC',
      [storyId]
    );
  }
  
  // 记忆相关操作
  async createMemory(id, storyId, memoryType, content, importance = 1) {
    await this.db.run(
      'INSERT INTO memories (id, story_id, memory_type, content, importance) VALUES (?, ?, ?, ?, ?)',
      [id, storyId, memoryType, content, importance]
    );
  }
  
  async getMemories(storyId, memoryType = null) {
    let query = 'SELECT * FROM memories WHERE story_id = ?';
    const params = [storyId];
    
    if (memoryType) {
      query += ' AND memory_type = ?';
      params.push(memoryType);
    }
    
    query += ' ORDER BY importance DESC, created_at DESC';
    return await this.db.all(query, params);
  }
  
  async deleteMemory(id) {
    await this.db.run('DELETE FROM memories WHERE id = ?', [id]);
  }
  
  async updateMemoryImportance(id, importance) {
    await this.db.run(
      'UPDATE memories SET importance = ? WHERE id = ?',
      [importance, id]
    );
  }
  
  // 交互相关操作
  async createInteraction(id, storyId, playerId, playerName, input, response = null) {
    await this.db.run(
      'INSERT INTO interactions (id, story_id, player_id, player_name, input, response) VALUES (?, ?, ?, ?, ?, ?)',
      [id, storyId, playerId, playerName, input, response]
    );
  }
  
  async updateInteractionResponse(id, response) {
    await this.db.run(
      'UPDATE interactions SET response = ? WHERE id = ?',
      [response, id]
    );
  }
  
  async getInteractions(storyId, limit = 50) {
    return await this.db.all(
      'SELECT * FROM interactions WHERE story_id = ? ORDER BY created_at DESC LIMIT ?',
      [storyId, limit]
    );
  }
  
  // ==================== 游戏状态序列化和恢复 ====================
  
  /**
   * 序列化游戏状态
   * @param {string} roomId - 房间ID
   * @returns {Promise<Object>} 序列化的游戏状态
   */
  async serializeGameState(roomId) {
    const room = await this.getRoom(roomId);
    if (!room) {
      throw new Error('房间不存在');
    }
    
    const story = await this.getStory(roomId);
    const players = await this.getRoomPlayers(roomId);
    
    let gameState = {
      room: {
        id: room.id,
        name: room.name,
        hostId: room.host_id,
        status: room.status,
        createdAt: room.created_at,
        updatedAt: room.updated_at
      },
      players: players.map(p => ({
        id: p.id,
        username: p.username,
        role: p.role,
        joinedAt: p.joined_at
      })),
      story: null,
      serializedAt: new Date().toISOString(),
      version: '1.0'
    };
    
    if (story) {
      const chapters = await this.getChapters(story.id);
      const memories = await this.getMemories(story.id);
      const interactions = await this.getInteractions(story.id, 50);
      
      gameState.story = {
        id: story.id,
        roomId: story.room_id,
        title: story.title,
        background: story.background,
        createdAt: story.created_at,
        updatedAt: story.updated_at,
        chapters: chapters.map(ch => ({
          id: ch.id,
          chapterNumber: ch.chapter_number,
          content: ch.content,
          summary: ch.summary,
          authorId: ch.author_id,
          createdAt: ch.created_at
        })),
        memories: memories.map(m => ({
          id: m.id,
          memoryType: m.memory_type,
          content: m.content,
          importance: m.importance,
          createdAt: m.created_at
        })),
        interactions: interactions.map(i => ({
          id: i.id,
          playerId: i.player_id,
          playerName: i.player_name,
          input: i.input,
          response: i.response,
          createdAt: i.created_at
        }))
      };
    }
    
    return gameState;
  }
  
  /**
   * 恢复游戏状态
   * @param {Object} gameState - 序列化的游戏状态
   * @returns {Promise<Object>} 恢复的房间对象
   */
  async restoreGameState(gameState) {
    return await this.transaction(async () => {
      // 恢复房间
      await this.db.run(
        'INSERT OR REPLACE INTO rooms (id, name, host_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [
          gameState.room.id,
          gameState.room.name,
          gameState.room.hostId,
          gameState.room.status,
          gameState.room.createdAt,
          gameState.room.updatedAt
        ]
      );
      
      // 恢复玩家
      for (const player of gameState.players) {
        await this.db.run(
          'INSERT OR IGNORE INTO players (id, username) VALUES (?, ?)',
          [player.id, player.username]
        );
        
        await this.db.run(
          'INSERT OR REPLACE INTO room_players (room_id, player_id, role) VALUES (?, ?, ?)',
          [gameState.room.id, player.id, player.role]
        );
      }
      
      // 恢复故事
      if (gameState.story) {
        await this.db.run(
          'INSERT OR REPLACE INTO stories (id, room_id, title, background, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          [
            gameState.story.id,
            gameState.story.roomId,
            gameState.story.title,
            gameState.story.background,
            gameState.story.createdAt,
            gameState.story.updatedAt
          ]
        );
        
        // 恢复章节
        for (const chapter of gameState.story.chapters) {
          await this.db.run(
            'INSERT OR REPLACE INTO chapters (id, story_id, chapter_number, content, summary, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
              chapter.id,
              gameState.story.id,
              chapter.chapterNumber,
              chapter.content,
              chapter.summary,
              chapter.authorId,
              chapter.createdAt
            ]
          );
        }
        
        // 恢复记忆
        for (const memory of gameState.story.memories) {
          await this.db.run(
            'INSERT OR REPLACE INTO memories (id, story_id, memory_type, content, importance, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [
              memory.id,
              gameState.story.id,
              memory.memoryType,
              memory.content,
              memory.importance,
              memory.createdAt
            ]
          );
        }
        
        // 恢复交互
        for (const interaction of gameState.story.interactions) {
          await this.db.run(
            'INSERT OR REPLACE INTO interactions (id, story_id, player_id, player_name, input, response, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
              interaction.id,
              gameState.story.id,
              interaction.playerId,
              interaction.playerName,
              interaction.input,
              interaction.response,
              interaction.createdAt
            ]
          );
        }
      }
      
      return gameState;
    });
  }
  
  /**
   * 批量保存游戏状态（用于定期备份）
   * @param {Array} roomIds - 房间ID列表
   * @returns {Promise<Array>} 序列化的状态列表
   */
  async batchSerializeGameStates(roomIds) {
    const states = [];
    for (const roomId of roomIds) {
      try {
        const state = await this.serializeGameState(roomId);
        states.push(state);
      } catch (error) {
        console.error(`序列化房间 ${roomId} 失败:`, error);
      }
    }
    return states;
  }
  
  /**
   * 更新章节内容（用于章节追加）
   */
  async updateChapter(id, updates) {
    // 字段名映射（camelCase -> snake_case）
    const fieldMap = {
      content: 'content',
      summary: 'summary',
      wordCount: 'word_count',
      status: 'status'
    };
    
    const fields = [];
    const values = [];
    
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id') continue;
      
      const dbField = fieldMap[key] || key;
      fields.push(`${dbField} = ?`);
      values.push(value);
    }
    
    if (fields.length === 0) {
      return;
    }
    
    // 注意：wordCount不是数据库字段，需要特殊处理
    // 如果传入wordCount，我们计算content的长度
    if (updates.wordCount !== undefined && !updates.content) {
      // 如果只更新wordCount，需要先获取当前content
      const chapter = await this.db.get('SELECT content FROM chapters WHERE id = ?', [id]);
      if (chapter) {
        // wordCount由content长度决定，不需要单独存储
        // 这里只更新content（如果需要）
      }
    }
    
    await this.db.run(
      `UPDATE chapters SET ${fields.join(', ')} WHERE id = ?`,
      [...values, id]
    );
  }
  
  /**
   * 创建消息
   */
  async createMessage(messageData) {
    const {
      id,
      roomId,
      storyId,
      senderId,
      senderName,
      recipientId,
      recipientName,
      messageType,
      visibility,
      content,
      chapterNumber
    } = messageData;
    
    await this.db.run(
      `INSERT INTO messages (
        id, room_id, story_id, sender_id, sender_name,
        recipient_id, recipient_name, message_type, visibility,
        content, chapter_number, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        id,
        roomId,
        storyId || null,
        senderId,
        senderName,
        recipientId || null,
        recipientName || null,
        messageType,
        visibility,
        content,
        chapterNumber || null
      ]
    );
    
    return await this.getMessage(id);
  }
  
  /**
   * 获取单条消息
   */
  async getMessage(messageId) {
    return await this.db.get('SELECT * FROM messages WHERE id = ?', [messageId]);
  }
  
  /**
   * 获取消息列表（根据可见性过滤）
   */
  async getMessages(roomId, playerId, filters = {}) {
    const { limit = 100, offset = 0, messageType, visibility } = filters;
    
    let query = `
      SELECT * FROM messages 
      WHERE room_id = ?
    `;
    const params = [roomId];
    
    // 根据可见性过滤
    // global: 所有玩家可见
    // private: 只有发送者可见
    // direct: 发送者和接收者可见
    query += ` AND (
      visibility = 'global' 
      OR (visibility = 'private' AND sender_id = ?)
      OR (visibility = 'direct' AND (sender_id = ? OR recipient_id = ?))
    )`;
    params.push(playerId, playerId, playerId);
    
    if (messageType) {
      query += ` AND message_type = ?`;
      params.push(messageType);
    }
    
    if (visibility) {
      query += ` AND visibility = ?`;
      params.push(visibility);
    }
    
    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    return await this.db.all(query, params);
  }
  
  /**
   * 获取私聊消息
   */
  async getPrivateMessages(playerId, recipientId, roomId) {
    return await this.db.all(
      `SELECT * FROM messages 
       WHERE room_id = ? 
       AND visibility = 'direct' 
       AND ((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?))
       ORDER BY created_at ASC`,
      [roomId, playerId, recipientId, recipientId, playerId]
    );
  }
  
  /**
   * 获取房间内所有可见消息（用于AI上下文）
   */
  async getAllMessagesForAI(storyId) {
    return await this.db.all(
      `SELECT * FROM messages 
       WHERE story_id = ? 
       ORDER BY created_at ASC`,
      [storyId]
    );
  }
  
  /**
   * 获取当前章节内的最近全局消息（用于触发判断）
   * @param {string} storyId - 故事ID
   * @param {string} chapterId - 章节ID（可选）
   * @returns {Promise<Array>} 消息列表
   */
  async getRecentGlobalMessages(storyId, chapterId = null) {
    let query = `
      SELECT * FROM messages 
      WHERE story_id = ? 
        AND (message_type = 'global' OR message_type = 'chapter' OR sender_id = 'ai')
    `;
    const params = [storyId];
    
    if (chapterId) {
      // 如果有章节ID，只获取该章节的消息
      query += ` AND (chapter_number = (SELECT chapter_number FROM chapters WHERE id = ?) OR chapter_number IS NULL)`;
      params.push(chapterId);
    }
    
    query += ` ORDER BY created_at DESC LIMIT 20`;
    
    return await this.db.all(query, params);
  }
  
  // ==================== 章节TODO相关操作 ====================
  
  /**
   * 创建章节TODO列表
   * @param {string} chapterId - 章节ID
   * @param {Array} todos - TODO项数组 [{id, content, priority}]
   */
  async createChapterTodos(chapterId, todos) {
    // 先获取story_id
    const chapter = await this.db.get('SELECT story_id FROM chapters WHERE id = ?', [chapterId]);
    if (!chapter) {
      throw new Error('章节不存在');
    }
    
    for (const todo of todos) {
      await this.db.run(
        'INSERT INTO chapter_todos (id, chapter_id, story_id, content, status, priority) VALUES (?, ?, ?, ?, ?, ?)',
        [todo.id, chapterId, chapter.story_id, todo.content, 'pending', todo.priority || 1]
      );
    }
  }
  
  /**
   * 获取章节TODO列表
   * @param {string} chapterId - 章节ID
   * @returns {Promise<Array>} TODO列表
   */
  async getChapterTodos(chapterId) {
    return await this.db.all(
      'SELECT * FROM chapter_todos WHERE chapter_id = ? ORDER BY priority DESC, created_at ASC',
      [chapterId]
    );
  }
  
  /**
   * 更新TODO状态
   * @param {string} todoId - TODO ID
   * @param {string} status - 新状态 ('pending', 'completed', 'skipped')
   */
  async updateTodoStatus(todoId, status) {
    await this.db.run(
      'UPDATE chapter_todos SET status = ? WHERE id = ?',
      [status, todoId]
    );
  }
  
  // ==================== 玩家反馈进度相关操作 ====================
  
  /**
   * 创建或更新玩家反馈进度
   * @param {string} chapterId - 章节ID
   * @param {string} playerId - 玩家ID
   * @param {string} todoId - TODO ID（可选）
   * @param {Object} feedback - 反馈数据 {feedbackCount, completionRate}
   */
  async createOrUpdatePlayerProgress(chapterId, playerId, todoId = null, feedback = {}) {
    const { feedbackCount = 0, completionRate = 0.0 } = feedback;
    
    // 检查是否已存在
    const existing = await this.db.get(
      'SELECT id FROM player_feedback_progress WHERE chapter_id = ? AND player_id = ? AND (todo_id = ? OR (? IS NULL AND todo_id IS NULL))',
      [chapterId, playerId, todoId, todoId]
    );
    
    if (existing) {
      // 更新
      await this.db.run(
        'UPDATE player_feedback_progress SET feedback_count = ?, completion_rate = ?, last_updated = CURRENT_TIMESTAMP, todo_id = ? WHERE id = ?',
        [feedbackCount, completionRate, todoId, existing.id]
      );
      return existing.id;
    } else {
      // 创建
      const id = `progress_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await this.db.run(
        'INSERT INTO player_feedback_progress (id, chapter_id, player_id, todo_id, feedback_count, completion_rate) VALUES (?, ?, ?, ?, ?, ?)',
        [id, chapterId, playerId, todoId, feedbackCount, completionRate]
      );
      return id;
    }
  }
  
  /**
   * 获取玩家反馈进度
   * @param {string} chapterId - 章节ID
   * @param {string} playerId - 玩家ID
   * @returns {Promise<Object>} 进度信息
   */
  async getPlayerProgress(chapterId, playerId) {
    const progress = await this.db.all(
      'SELECT * FROM player_feedback_progress WHERE chapter_id = ? AND player_id = ?',
      [chapterId, playerId]
    );
    
    // 计算总体完成度
    const todos = await this.getChapterTodos(chapterId);
    const totalTodos = todos.length;
    const completedTodos = todos.filter(t => t.status === 'completed').length;
    const overallCompletionRate = totalTodos > 0 ? completedTodos / totalTodos : 0;
    
    return {
      progress,
      overallCompletionRate,
      totalTodos,
      completedTodos
    };
  }
  
  /**
   * 获取所有玩家的反馈进度
   * @param {string} chapterId - 章节ID
   * @returns {Promise<Array>} 所有玩家的进度列表
   */
  async getAllPlayersProgress(chapterId) {
    const allProgress = await this.db.all(
      `SELECT pfp.*, p.username 
       FROM player_feedback_progress pfp
       JOIN players p ON pfp.player_id = p.id
       WHERE pfp.chapter_id = ?
       GROUP BY pfp.player_id`,
      [chapterId]
    );
    
    // 为每个玩家计算总体完成度
    const todos = await this.getChapterTodos(chapterId);
    const totalTodos = todos.length;
    
    const playersProgress = await Promise.all(
      allProgress.map(async (pfp) => {
        const playerTodos = await this.db.all(
          'SELECT * FROM chapter_todos WHERE id IN (SELECT todo_id FROM player_feedback_progress WHERE chapter_id = ? AND player_id = ?)',
          [chapterId, pfp.player_id]
        );
        const completedTodos = playerTodos.filter(t => t.status === 'completed').length;
        const overallCompletionRate = totalTodos > 0 ? completedTodos / totalTodos : 0;
        
        return {
          ...pfp,
          overallCompletionRate,
          totalTodos,
          completedTodos
        };
      })
    );
    
    return playersProgress;
  }
  
  /**
   * 检查章节是否准备就绪（所有玩家都达到80%完成度）
   * @param {string} chapterId - 章节ID
   * @param {string} roomId - 房间ID
   * @returns {Promise<Object>} {ready: boolean, playersProgress: Array}
   */
  async checkChapterReady(chapterId, roomId) {
    // 获取房间内所有玩家
    const players = await this.getRoomPlayers(roomId);
    const todos = await this.getChapterTodos(chapterId);
    const totalTodos = todos.length;
    
    if (totalTodos === 0) {
      return { ready: false, playersProgress: [], reason: '没有TODO项' };
    }
    
    const COMPLETION_THRESHOLD = 0.8; // 80%阈值
    
    // 获取每个玩家的进度
    const playersProgress = await Promise.all(
      players.map(async (player) => {
        const progress = await this.getPlayerProgress(chapterId, player.id);
        return {
          playerId: player.id,
          username: player.username,
          completionRate: progress.overallCompletionRate,
          completedTodos: progress.completedTodos,
          totalTodos: progress.totalTodos,
          ready: progress.overallCompletionRate >= COMPLETION_THRESHOLD
        };
      })
    );
    
    // 单玩家模式：只需要一个玩家达到80%
    // 多玩家模式：所有玩家都需要达到80%
    const isSinglePlayer = players.length === 1;
    const ready = isSinglePlayer
      ? playersProgress[0]?.ready === true
      : playersProgress.every(p => p.ready === true);
    
    return {
      ready,
      playersProgress,
      isSinglePlayer,
      totalTodos
    };
  }
  
  /**
   * 设置玩家反馈超时时间
   * @param {string} chapterId - 章节ID
   * @param {string} playerId - 玩家ID
   * @param {Date} timeoutAt - 超时时间
   */
  async setPlayerTimeout(chapterId, playerId, timeoutAt) {
    await this.db.run(
      'UPDATE player_feedback_progress SET timeout_at = ? WHERE chapter_id = ? AND player_id = ?',
      [timeoutAt.toISOString(), chapterId, playerId]
    );
  }
  
  /**
   * 标记超时玩家为完成
   * @param {string} chapterId - 章节ID
   */
  async markTimeoutPlayersAsComplete(chapterId) {
    const now = new Date().toISOString();
    // 将所有超时的TODO标记为完成
    await this.db.run(
      `UPDATE chapter_todos 
       SET status = 'completed' 
       WHERE id IN (
         SELECT todo_id FROM player_feedback_progress 
         WHERE chapter_id = ? AND timeout_at IS NOT NULL AND timeout_at < ?
       )`,
      [chapterId, now]
    );
  }
}

export default new Database();

