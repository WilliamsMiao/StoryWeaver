import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import config from '../config/index.js';
import { getFeedbackSystemConfig } from '../config/gameConfig.js';

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
        FOREIGN KEY (story_id) REFERENCES stories(id)
      )
    `);
    
    // 章节TODO表 - 包含预期答案/线索用于引导玩家
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS chapter_todos (
        id TEXT PRIMARY KEY,
        chapter_id TEXT NOT NULL,
        story_id TEXT NOT NULL,
        content TEXT NOT NULL,
        expected_answer TEXT,
        hint TEXT,
        status TEXT DEFAULT 'pending',
        priority INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chapter_id) REFERENCES chapters(id),
        FOREIGN KEY (story_id) REFERENCES stories(id)
      )
    `);
    
    // 章节谜题表 - 每个章节的核心谜题
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS chapter_puzzles (
        id TEXT PRIMARY KEY,
        chapter_id TEXT NOT NULL,
        story_id TEXT NOT NULL,
        puzzle_question TEXT NOT NULL,
        correct_answer TEXT NOT NULL,
        answer_keywords TEXT,
        difficulty INTEGER DEFAULT 3,
        success_message TEXT,
        next_step TEXT,
        solved INTEGER DEFAULT 0,
        solved_by TEXT,
        solved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chapter_id) REFERENCES chapters(id),
        FOREIGN KEY (story_id) REFERENCES stories(id)
      )
    `);
    
    // 玩家专属线索表 - 每个玩家获得的独特线索
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS player_clues (
        id TEXT PRIMARY KEY,
        chapter_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        clue_type TEXT NOT NULL,
        clue_content TEXT NOT NULL,
        clue_source TEXT,
        is_revealed INTEGER DEFAULT 0,
        revealed_at DATETIME,
        relevance_to_puzzle TEXT,
        can_share INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chapter_id) REFERENCES chapters(id),
        FOREIGN KEY (player_id) REFERENCES players(id)
      )
    `);
    
    // 玩家解谜进度表 - 记录每个玩家的解谜状态
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS player_puzzle_progress (
        id TEXT PRIMARY KEY,
        puzzle_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        is_solved INTEGER DEFAULT 0,
        last_answer TEXT,
        solved_at DATETIME,
        hints_used INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (puzzle_id) REFERENCES chapter_puzzles(id),
        FOREIGN KEY (player_id) REFERENCES players(id)
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
    
    // 故事角色表 - 存储NPC和玩家角色信息
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS story_characters (
        id TEXT PRIMARY KEY,
        story_id TEXT NOT NULL,
        name TEXT NOT NULL,
        character_type TEXT NOT NULL DEFAULT 'npc',
        player_id TEXT,
        avatar TEXT,
        age TEXT,
        occupation TEXT,
        personality TEXT,
        background TEXT,
        secret TEXT,
        relationships JSON,
        first_appearance_chapter INTEGER DEFAULT 1,
        is_alive INTEGER DEFAULT 1,
        is_suspect INTEGER DEFAULT 0,
        suspicion_level INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (story_id) REFERENCES stories(id),
        FOREIGN KEY (player_id) REFERENCES players(id)
      )
    `);
    
    // 角色线索卡片表 - 每个角色在每章的线索信息
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS character_clue_cards (
        id TEXT PRIMARY KEY,
        character_id TEXT NOT NULL,
        chapter_id TEXT NOT NULL,
        story_id TEXT NOT NULL,
        clue_category TEXT NOT NULL,
        clue_title TEXT NOT NULL,
        clue_content TEXT NOT NULL,
        clue_importance INTEGER DEFAULT 1,
        is_hidden INTEGER DEFAULT 0,
        discovered_by JSON DEFAULT '[]',
        discovery_condition TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (character_id) REFERENCES story_characters(id),
        FOREIGN KEY (chapter_id) REFERENCES chapters(id),
        FOREIGN KEY (story_id) REFERENCES stories(id)
      )
    `);
    
    // 玩家角色分配表 - 记录玩家在故事中扮演的角色
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS player_roles (
        id TEXT PRIMARY KEY,
        story_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        character_id TEXT NOT NULL,
        role_type TEXT DEFAULT 'detective',
        special_ability TEXT,
        personal_goal TEXT,
        secret_info TEXT,
        discovered_clues JSON DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (story_id) REFERENCES stories(id),
        FOREIGN KEY (player_id) REFERENCES players(id),
        FOREIGN KEY (character_id) REFERENCES story_characters(id)
      )
    `);
    
    // 玩家互动记录表 - 用于AI参考生成剧情
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS player_interactions (
        id TEXT PRIMARY KEY,
        story_id TEXT NOT NULL,
        chapter_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        interaction_type TEXT NOT NULL,
        target_character TEXT,
        action_description TEXT,
        result TEXT,
        impact_on_story TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (story_id) REFERENCES stories(id),
        FOREIGN KEY (chapter_id) REFERENCES chapters(id),
        FOREIGN KEY (player_id) REFERENCES players(id)
      )
    `);
    
    // ==================== 故事大纲系统 ====================
    
    // 故事大纲表 - 存储完整的案件真相和故事走向
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS story_outlines (
        id TEXT PRIMARY KEY,
        story_id TEXT NOT NULL UNIQUE,
        
        -- 案件核心信息
        case_type TEXT NOT NULL,
        victim_name TEXT NOT NULL,
        victim_description TEXT,
        murderer_name TEXT NOT NULL,
        murderer_motive TEXT NOT NULL,
        murder_method TEXT NOT NULL,
        murder_location TEXT NOT NULL,
        murder_time TEXT,
        
        -- 真相和结局
        full_truth TEXT NOT NULL,
        key_evidence JSON NOT NULL,
        red_herrings JSON,
        
        -- 章节规划
        total_chapters INTEGER DEFAULT 3,
        chapter_goals JSON NOT NULL,
        
        -- 可交互地点和物品
        locations JSON NOT NULL,
        interactable_items JSON NOT NULL,
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (story_id) REFERENCES stories(id)
      )
    `);
    
    // 玩家任务表 - 每个玩家的具体任务
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS player_tasks (
        id TEXT PRIMARY KEY,
        story_id TEXT NOT NULL,
        chapter_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        
        -- 任务信息
        task_type TEXT NOT NULL,
        task_title TEXT NOT NULL,
        task_description TEXT NOT NULL,
        task_target TEXT NOT NULL,
        target_type TEXT NOT NULL,
        
        -- 完成条件
        required_action TEXT NOT NULL,
        required_keywords JSON,
        
        -- 奖励
        reward_clue TEXT,
        reward_info TEXT,
        
        -- 状态
        status TEXT DEFAULT 'active',
        completed_at DATETIME,
        completion_message TEXT,
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (story_id) REFERENCES stories(id),
        FOREIGN KEY (chapter_id) REFERENCES chapters(id),
        FOREIGN KEY (player_id) REFERENCES players(id)
      )
    `);
    
    // 创建索引以提高查询性能
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_player_clues_player ON player_clues(player_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_player_clues_chapter ON player_clues(chapter_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_chapter_puzzles_chapter ON chapter_puzzles(chapter_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_messages_recipient_id ON messages(recipient_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_chapter_todos_chapter_id ON chapter_todos(chapter_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_player_feedback_chapter_id ON player_feedback_progress(chapter_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_player_feedback_player_id ON player_feedback_progress(player_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_story_characters_story ON story_characters(story_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_character_clue_cards_character ON character_clue_cards(character_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_character_clue_cards_chapter ON character_clue_cards(chapter_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_player_roles_story ON player_roles(story_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_player_interactions_story ON player_interactions(story_id)`);
    
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
  
  async deleteRoom(roomId) {
    if (!roomId) {
      return;
    }
    try {
      const story = await this.getStory(roomId);
      if (story) {
        await this.deleteStory(story.id);
      }
      await this.db.run('DELETE FROM room_players WHERE room_id = ?', [roomId]);
      await this.db.run('DELETE FROM messages WHERE room_id = ?', [roomId]);
      await this.db.run('DELETE FROM rooms WHERE id = ?', [roomId]);
    } catch (error) {
      console.error(`删除房间 ${roomId} 失败:`, error);
      throw error;
    }
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

  async deleteStory(id) {
    if (!id) return;
    try {
      // Use a transaction for atomic deletion of all related data
      await this.transaction(async () => {
        // Delete in order respecting foreign key constraints
        // First, delete records that reference other tables
        await this.db.run(
          `DELETE FROM player_puzzle_progress 
           WHERE puzzle_id IN (SELECT id FROM chapter_puzzles WHERE story_id = ?)`,
          [id]
        );
        await this.db.run(
          `DELETE FROM player_feedback_progress 
           WHERE chapter_id IN (SELECT id FROM chapters WHERE story_id = ?)`,
          [id]
        );
        await this.db.run(
          'DELETE FROM player_clues WHERE chapter_id IN (SELECT id FROM chapters WHERE story_id = ?)',
          [id]
        );
        
        // Then delete the main story-related tables
        await Promise.all([
          this.db.run('DELETE FROM player_tasks WHERE story_id = ?', [id]),
          this.db.run('DELETE FROM player_interactions WHERE story_id = ?', [id]),
          this.db.run('DELETE FROM character_clue_cards WHERE story_id = ?', [id]),
          this.db.run('DELETE FROM player_roles WHERE story_id = ?', [id]),
          this.db.run('DELETE FROM story_characters WHERE story_id = ?', [id]),
          this.db.run('DELETE FROM chapter_puzzles WHERE story_id = ?', [id]),
          this.db.run('DELETE FROM chapter_todos WHERE story_id = ?', [id]),
          this.db.run('DELETE FROM story_outlines WHERE story_id = ?', [id]),
          this.db.run('DELETE FROM messages WHERE story_id = ?', [id]),
          this.db.run('DELETE FROM interactions WHERE story_id = ?', [id]),
          this.db.run('DELETE FROM memories WHERE story_id = ?', [id])
        ]);
        
        // Finally delete chapters and story
        await this.db.run('DELETE FROM chapters WHERE story_id = ?', [id]);
        await this.db.run('DELETE FROM stories WHERE id = ?', [id]);
      });
    } catch (error) {
      console.error(`删除故事 ${id} 失败:`, error);
      throw error;
    }
  }
  
  // 章节相关操作
  async createChapter(idOrObj, storyId, chapterNumber, content, authorId, summary = null) {
    // 支持对象参数和位置参数两种方式
    let id, finalStoryId, finalChapterNumber, finalContent, finalAuthorId, finalSummary;
    
    if (typeof idOrObj === 'object' && idOrObj !== null) {
      // 对象参数方式
      id = idOrObj.id;
      finalStoryId = idOrObj.storyId;
      finalChapterNumber = idOrObj.chapterNumber;
      finalContent = idOrObj.content;
      finalAuthorId = idOrObj.authorId;
      finalSummary = idOrObj.summary || null;
    } else {
      // 位置参数方式
      id = idOrObj;
      finalStoryId = storyId;
      finalChapterNumber = chapterNumber;
      finalContent = content;
      finalAuthorId = authorId;
      finalSummary = summary;
    }
    
    // 验证必要参数
    if (!id || !finalStoryId) {
      throw new Error(`createChapter: 缺少必要参数 id=${id}, storyId=${finalStoryId}`);
    }
    
    await this.db.run(
      'INSERT INTO chapters (id, story_id, chapter_number, content, summary, author_id) VALUES (?, ?, ?, ?, ?, ?)',
      [id, finalStoryId, finalChapterNumber, finalContent, finalSummary, finalAuthorId]
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
   * @param {Array} todos - TODO项数组 [{id, content, expected_answer, hint, priority}]
   */
  async createChapterTodos(chapterId, todos) {
    // 先获取story_id
    const chapter = await this.db.get('SELECT story_id FROM chapters WHERE id = ?', [chapterId]);
    if (!chapter) {
      throw new Error('章节不存在');
    }
    
    for (const todo of todos) {
      await this.db.run(
        'INSERT INTO chapter_todos (id, chapter_id, story_id, content, expected_answer, hint, status, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [todo.id, chapterId, chapter.story_id, todo.content, todo.expected_answer || null, todo.hint || null, 'pending', todo.priority || 1]
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
    
  const COMPLETION_THRESHOLD = getFeedbackSystemConfig().progressionThreshold;
    
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

  // ==================== 章节谜题相关操作 ====================

  /**
   * 创建章节谜题
   * @param {Object} puzzle - 谜题数据
   */
  async createChapterPuzzle(puzzle) {
    const { 
      id, chapterId, storyId, puzzleQuestion, correctAnswer, 
      answerKeywords, difficulty = 3, successMessage, nextStep 
    } = puzzle;
    await this.db.run(
      `INSERT INTO chapter_puzzles (id, chapter_id, story_id, puzzle_question, correct_answer, answer_keywords, difficulty, success_message, next_step)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, chapterId, storyId, puzzleQuestion, correctAnswer, answerKeywords, difficulty, successMessage || '✅ 正确！', nextStep || '继续调查...']
    );
  }

  /**
   * 获取章节谜题
   * @param {string} chapterId - 章节ID
   */
  async getChapterPuzzle(chapterId) {
    return await this.db.get(
      'SELECT * FROM chapter_puzzles WHERE chapter_id = ?',
      [chapterId]
    );
  }

  /**
   * 更新谜题解决状态
   * @param {string} puzzleId - 谜题ID
   * @param {string} solvedBy - 解决者玩家ID
   */
  async solvePuzzle(puzzleId, solvedBy) {
    await this.db.run(
      `UPDATE chapter_puzzles SET solved = 1, solved_by = ?, solved_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [solvedBy, puzzleId]
    );
  }

  /**
   * 检查玩家是否解开谜题
   * @param {string} puzzleId - 谜题ID
   * @param {string} playerId - 玩家ID
   */
  async getPlayerPuzzleProgress(puzzleId, playerId) {
    return await this.db.get(
      'SELECT * FROM player_puzzle_progress WHERE puzzle_id = ? AND player_id = ?',
      [puzzleId, playerId]
    );
  }

  /**
   * 更新玩家解谜进度
   * @param {Object} progress - 进度数据
   */
  async updatePlayerPuzzleProgress(progress) {
    const { puzzleId, playerId, lastAnswer, isSolved, hintsUsed = 0 } = progress;
    
    const existing = await this.getPlayerPuzzleProgress(puzzleId, playerId);
    
    if (existing) {
      await this.db.run(
        `UPDATE player_puzzle_progress 
         SET attempts = attempts + 1, last_answer = ?, is_solved = ?, hints_used = ?, solved_at = ?
         WHERE puzzle_id = ? AND player_id = ?`,
        [lastAnswer, isSolved ? 1 : 0, hintsUsed, isSolved ? new Date().toISOString() : null, puzzleId, playerId]
      );
    } else {
      const { v4: uuidv4 } = await import('uuid');
      await this.db.run(
        `INSERT INTO player_puzzle_progress (id, puzzle_id, player_id, attempts, last_answer, is_solved, hints_used, solved_at)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?)`,
        [uuidv4(), puzzleId, playerId, lastAnswer, isSolved ? 1 : 0, hintsUsed, isSolved ? new Date().toISOString() : null]
      );
    }
  }

  /**
   * 获取所有玩家的解谜状态
   * @param {string} puzzleId - 谜题ID
   * @param {string} roomId - 房间ID
   */
  async getAllPlayersPuzzleStatus(puzzleId, roomId) {
    const players = await this.getRoomPlayers(roomId);
    const results = await Promise.all(
      players.map(async (player) => {
        const progress = await this.getPlayerPuzzleProgress(puzzleId, player.id);
        return {
          playerId: player.id,
          username: player.username,
          isSolved: progress?.is_solved === 1,
          attempts: progress?.attempts || 0
        };
      })
    );
    return results;
  }

  // ==================== 玩家线索相关操作 ====================

  /**
   * 创建玩家专属线索
   * @param {Object} clue - 线索数据
   */
  async createPlayerClue(clue) {
    const { id, chapterId, playerId, clueType, clueContent, clueSource, relevanceToPuzzle, canShare = 1 } = clue;
    await this.db.run(
      `INSERT INTO player_clues (id, chapter_id, player_id, clue_type, clue_content, clue_source, relevance_to_puzzle, can_share)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, chapterId, playerId, clueType, clueContent, clueSource || null, relevanceToPuzzle || null, canShare]
    );
  }

  /**
   * 获取玩家的所有线索
   * @param {string} chapterId - 章节ID
   * @param {string} playerId - 玩家ID
   */
  async getPlayerClues(chapterId, playerId) {
    return await this.db.all(
      'SELECT * FROM player_clues WHERE chapter_id = ? AND player_id = ? ORDER BY created_at ASC',
      [chapterId, playerId]
    );
  }

  /**
   * 获取玩家已揭示的线索
   * @param {string} chapterId - 章节ID
   * @param {string} playerId - 玩家ID
   */
  async getRevealedClues(chapterId, playerId) {
    return await this.db.all(
      'SELECT * FROM player_clues WHERE chapter_id = ? AND player_id = ? AND is_revealed = 1 ORDER BY revealed_at ASC',
      [chapterId, playerId]
    );
  }

  /**
   * 揭示玩家线索
   * @param {string} clueId - 线索ID
   */
  async revealClue(clueId) {
    await this.db.run(
      'UPDATE player_clues SET is_revealed = 1, revealed_at = CURRENT_TIMESTAMP WHERE id = ?',
      [clueId]
    );
  }

  /**
   * 获取玩家未揭示的线索
   * @param {string} chapterId - 章节ID
   * @param {string} playerId - 玩家ID
   */
  async getUnrevealedClues(chapterId, playerId) {
    return await this.db.all(
      'SELECT * FROM player_clues WHERE chapter_id = ? AND player_id = ? AND is_revealed = 0 ORDER BY created_at ASC',
      [chapterId, playerId]
    );
  }

  /**
   * 检查章节是否所有玩家都解开谜题
   * @param {string} chapterId - 章节ID
   * @param {string} roomId - 房间ID
   */
  async checkAllPlayersSolvedPuzzle(chapterId, roomId) {
    const puzzle = await this.getChapterPuzzle(chapterId);
    if (!puzzle) {
      return { allSolved: false, reason: '没有谜题' };
    }

    const players = await this.getRoomPlayers(roomId);
    const solvedPlayers = [];
    const unsolvedPlayers = [];

    for (const player of players) {
      const progress = await this.getPlayerPuzzleProgress(puzzle.id, player.id);
      if (progress?.is_solved === 1) {
        solvedPlayers.push(player);
      } else {
        unsolvedPlayers.push(player);
      }
    }

    return {
      allSolved: unsolvedPlayers.length === 0,
      solvedPlayers,
      unsolvedPlayers,
      puzzle
    };
  }

  /**
   * 获取所有玩家的谜题进度（用于广播）
   * @param {string} chapterId - 章节ID
   * @param {string} roomId - 房间ID
   */
  async getAllPlayerPuzzleProgress(chapterId, roomId) {
    const puzzle = await this.getChapterPuzzle(chapterId);
    if (!puzzle) {
      return [];
    }

    const players = await this.getRoomPlayers(roomId);
    const results = await Promise.all(
      players.map(async (player) => {
        const progress = await this.getPlayerPuzzleProgress(puzzle.id, player.id);
        return {
          player_id: player.id,
          username: player.username,
          is_solved: progress?.is_solved === 1,
          attempts: progress?.attempts || 0,
          hints_used: progress?.hints_used || 0
        };
      })
    );
    return results;
  }

  // ==================== 角色卡片相关操作 ====================

  /**
   * 创建故事角色（NPC或玩家角色）
   */
  async createCharacter(character) {
    const { 
      id, storyId, name, characterType = 'npc', playerId = null,
      avatar, age, occupation, personality, background, secret,
      relationships = {}, firstAppearanceChapter = 1, isSuspect = 0, suspicionLevel = 0
    } = character;
    
    await this.db.run(
      `INSERT INTO story_characters 
       (id, story_id, name, character_type, player_id, avatar, age, occupation, 
        personality, background, secret, relationships, first_appearance_chapter, 
        is_suspect, suspicion_level)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, storyId, name, characterType, playerId, avatar, age, occupation, 
       personality, background, secret, JSON.stringify(relationships), 
       firstAppearanceChapter, isSuspect, suspicionLevel]
    );
    
    return { id, ...character };
  }

  /**
   * 获取故事中的所有角色
   */
  async getStoryCharacters(storyId) {
    const characters = await this.db.all(
      'SELECT * FROM story_characters WHERE story_id = ? ORDER BY first_appearance_chapter ASC',
      [storyId]
    );
    return characters.map(c => ({
      ...c,
      relationships: c.relationships ? JSON.parse(c.relationships) : {}
    }));
  }

  /**
   * 获取单个角色信息
   */
  async getCharacter(characterId) {
    const character = await this.db.get(
      'SELECT * FROM story_characters WHERE id = ?',
      [characterId]
    );
    if (character) {
      character.relationships = character.relationships ? JSON.parse(character.relationships) : {};
    }
    return character;
  }

  /**
   * 根据名称查找角色
   */
  async findCharacterByName(storyId, name) {
    return await this.db.get(
      'SELECT * FROM story_characters WHERE story_id = ? AND name = ?',
      [storyId, name]
    );
  }

  /**
   * 更新角色信息
   */
  async updateCharacter(characterId, updates) {
    const fields = [];
    const values = [];
    
    for (const [key, value] of Object.entries(updates)) {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      fields.push(`${dbKey} = ?`);
      values.push(typeof value === 'object' ? JSON.stringify(value) : value);
    }
    
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(characterId);
    
    await this.db.run(
      `UPDATE story_characters SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
  }

  /**
   * 创建角色线索卡片
   */
  async createCharacterClueCard(clueCard) {
    const {
      id, characterId, chapterId, storyId, clueCategory, clueTitle,
      clueContent, clueImportance = 1, isHidden = 0, discoveryCondition = null
    } = clueCard;
    
    await this.db.run(
      `INSERT INTO character_clue_cards 
       (id, character_id, chapter_id, story_id, clue_category, clue_title,
        clue_content, clue_importance, is_hidden, discovery_condition)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, characterId, chapterId, storyId, clueCategory, clueTitle,
       clueContent, clueImportance, isHidden, discoveryCondition]
    );
  }

  /**
   * 获取角色的所有线索卡片
   */
  async getCharacterClueCards(characterId, playerId = null) {
    let query = `
      SELECT * FROM character_clue_cards 
      WHERE character_id = ?
    `;
    const params = [characterId];
    
    // 如果提供了playerId，过滤掉该玩家未发现的隐藏线索
    if (playerId) {
      query += ` AND (is_hidden = 0 OR discovered_by LIKE ?)`;
      params.push(`%"${playerId}"%`);
    } else {
      query += ` AND is_hidden = 0`;
    }
    
    query += ` ORDER BY clue_importance DESC, created_at ASC`;
    
    const cards = await this.db.all(query, params);
    return cards.map(c => ({
      ...c,
      discovered_by: c.discovered_by ? JSON.parse(c.discovered_by) : []
    }));
  }

  /**
   * 获取章节中所有角色的线索卡片
   */
  async getChapterCharacterClues(chapterId) {
    const clues = await this.db.all(
      `SELECT cc.*, sc.name as character_name, sc.character_type
       FROM character_clue_cards cc
       JOIN story_characters sc ON cc.character_id = sc.id
       WHERE cc.chapter_id = ?
       ORDER BY sc.name, cc.clue_importance DESC`,
      [chapterId]
    );
    return clues.map(c => ({
      ...c,
      discovered_by: c.discovered_by ? JSON.parse(c.discovered_by) : []
    }));
  }

  /**
   * 玩家发现线索
   */
  async discoverClue(clueCardId, playerId) {
    const card = await this.db.get(
      'SELECT discovered_by FROM character_clue_cards WHERE id = ?',
      [clueCardId]
    );
    
    if (card) {
      const discoveredBy = card.discovered_by ? JSON.parse(card.discovered_by) : [];
      if (!discoveredBy.includes(playerId)) {
        discoveredBy.push(playerId);
        await this.db.run(
          'UPDATE character_clue_cards SET discovered_by = ? WHERE id = ?',
          [JSON.stringify(discoveredBy), clueCardId]
        );
      }
    }
  }

  // ==================== 玩家角色分配相关 ====================

  /**
   * 为玩家分配角色
   */
  async assignPlayerRole(assignment) {
    const {
      id, storyId, playerId, characterId, roleType = 'detective',
      specialAbility = null, personalGoal = null, secretInfo = null
    } = assignment;
    
    await this.db.run(
      `INSERT OR REPLACE INTO player_roles 
       (id, story_id, player_id, character_id, role_type, special_ability, personal_goal, secret_info)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, storyId, playerId, characterId, roleType, specialAbility, personalGoal, secretInfo]
    );
  }

  /**
   * 获取玩家在故事中的角色
   */
  async getPlayerRole(storyId, playerId) {
    const role = await this.db.get(
      `SELECT pr.*, sc.name as character_name, sc.avatar, sc.occupation, sc.personality
       FROM player_roles pr
       JOIN story_characters sc ON pr.character_id = sc.id
       WHERE pr.story_id = ? AND pr.player_id = ?`,
      [storyId, playerId]
    );
    if (role && role.discovered_clues) {
      role.discovered_clues = JSON.parse(role.discovered_clues);
    }
    return role;
  }

  /**
   * 更新玩家发现的线索
   */
  async updatePlayerDiscoveredClues(storyId, playerId, clueId) {
    const role = await this.getPlayerRole(storyId, playerId);
    if (role) {
      const discoveredClues = role.discovered_clues || [];
      if (!discoveredClues.includes(clueId)) {
        discoveredClues.push(clueId);
        await this.db.run(
          'UPDATE player_roles SET discovered_clues = ? WHERE story_id = ? AND player_id = ?',
          [JSON.stringify(discoveredClues), storyId, playerId]
        );
      }
    }
  }

  // ==================== 玩家互动记录相关 ====================

  /**
   * 记录玩家互动
   */
  async recordPlayerInteraction(interaction) {
    const {
      id, storyId, chapterId, playerId, interactionType,
      targetCharacter = null, actionDescription, result = null, impactOnStory = null
    } = interaction;
    
    await this.db.run(
      `INSERT INTO player_interactions 
       (id, story_id, chapter_id, player_id, interaction_type, target_character, 
        action_description, result, impact_on_story)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, storyId, chapterId, playerId, interactionType, targetCharacter,
       actionDescription, result, impactOnStory]
    );
  }

  /**
   * 获取章节中的玩家互动记录
   */
  async getChapterInteractions(chapterId) {
    return await this.db.all(
      `SELECT pi.*, p.username as player_name
       FROM player_interactions pi
       LEFT JOIN players p ON pi.player_id = p.id
       WHERE pi.chapter_id = ?
       ORDER BY pi.created_at ASC`,
      [chapterId]
    );
  }

  /**
   * 获取故事中的所有玩家互动摘要（用于AI生成剧情参考）
   */
  async getStoryInteractionsSummary(storyId) {
    return await this.db.all(
      `SELECT player_id, interaction_type, COUNT(*) as count,
              GROUP_CONCAT(DISTINCT target_character) as targets
       FROM player_interactions
       WHERE story_id = ?
       GROUP BY player_id, interaction_type`,
      [storyId]
    );
  }

  // ==================== 故事大纲系统 ====================

  /**
   * 创建故事大纲
   */
  async createStoryOutline(outline) {
    const {
      id, storyId, caseType, victimName, victimDescription,
      murdererName, murdererMotive, murderMethod, murderLocation, murderTime,
      fullTruth, keyEvidence, redHerrings, totalChapters, chapterGoals,
      locations, interactableItems,
      // 兼容旧字段名
      culpritId, truthSummary
    } = outline;
    
    // 使用兼容逻辑，支持两种字段名
    const finalMurdererName = murdererName || culpritId || '未知';
    const finalFullTruth = fullTruth || truthSummary || '';
    const finalMurdererMotive = murdererMotive || '未知动机';
    const finalMurderMethod = murderMethod || '未知手法';
    const finalMurderLocation = murderLocation || '未知地点';
    
    await this.db.run(
      `INSERT INTO story_outlines (
        id, story_id, case_type, victim_name, victim_description,
        murderer_name, murderer_motive, murder_method, murder_location, murder_time,
        full_truth, key_evidence, red_herrings, total_chapters, chapter_goals,
        locations, interactable_items
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, storyId, caseType || '谋杀案', victimName || '受害者', victimDescription,
        finalMurdererName, finalMurdererMotive, finalMurderMethod, finalMurderLocation, murderTime,
        finalFullTruth, JSON.stringify(keyEvidence || []), JSON.stringify(redHerrings || []),
        totalChapters || 3, JSON.stringify(chapterGoals || []),
        JSON.stringify(locations || []), JSON.stringify(interactableItems || [])
      ]
    );
  }

  /**
   * 获取故事大纲
   */
  async getStoryOutline(storyId) {
    const outline = await this.db.get(
      'SELECT * FROM story_outlines WHERE story_id = ?',
      [storyId]
    );
    if (outline) {
      outline.key_evidence = JSON.parse(outline.key_evidence || '[]');
      outline.red_herrings = JSON.parse(outline.red_herrings || '[]');
      outline.chapter_goals = JSON.parse(outline.chapter_goals || '[]');
      outline.locations = JSON.parse(outline.locations || '[]');
      outline.interactable_items = JSON.parse(outline.interactable_items || '[]');
    }
    return outline;
  }

  // ==================== 任务系统 ====================

  /**
   * 创建玩家任务
   */
  async createPlayerTask(task) {
    const {
      id, storyId, chapterId, playerId, taskType, taskTitle, taskDescription,
      taskTarget, targetType, requiredAction, requiredKeywords,
      rewardClue, rewardInfo
    } = task;
    
    await this.db.run(
      `INSERT INTO player_tasks (
        id, story_id, chapter_id, player_id, task_type, task_title, task_description,
        task_target, target_type, required_action, required_keywords,
        reward_clue, reward_info
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, storyId, chapterId, playerId, taskType, taskTitle, taskDescription,
        taskTarget, targetType, requiredAction, JSON.stringify(requiredKeywords || []),
        rewardClue, rewardInfo
      ]
    );
  }

  /**
   * 获取玩家当前任务（按章节）
   */
  async getPlayerTasks(chapterId, playerId, status = 'active') {
    const tasks = await this.db.all(
      `SELECT * FROM player_tasks 
       WHERE chapter_id = ? AND player_id = ? AND status = ?
       ORDER BY created_at ASC`,
      [chapterId, playerId, status]
    );
    return tasks.map(t => ({
      ...t,
      required_keywords: JSON.parse(t.required_keywords || '[]')
    }));
  }

  /**
   * 获取玩家所有任务（包括已完成）
   */
  async getAllPlayerTasks(storyId, playerId) {
    const tasks = await this.db.all(
      `SELECT * FROM player_tasks 
       WHERE story_id = ? AND player_id = ?
       ORDER BY created_at ASC`,
      [storyId, playerId]
    );
    return tasks.map(t => ({
      ...t,
      required_keywords: JSON.parse(t.required_keywords || '[]')
    }));
  }

  /**
   * 完成任务
   */
  async completeTask(taskId, completionMessage) {
    await this.db.run(
      `UPDATE player_tasks 
       SET status = 'completed', completed_at = CURRENT_TIMESTAMP, completion_message = ?
       WHERE id = ?`,
      [completionMessage, taskId]
    );
  }

  /**
   * 检查任务是否可以完成
   */
  async checkTaskCompletion(taskId, playerAction, keywords) {
    const task = await this.db.get('SELECT * FROM player_tasks WHERE id = ?', [taskId]);
    if (!task) return { canComplete: false, reason: '任务不存在' };
    
    const requiredKeywords = JSON.parse(task.required_keywords || '[]');
    const actionLower = playerAction.toLowerCase();
    
    // 检查是否包含必需的关键词
    const matchedKeywords = requiredKeywords.filter(kw => 
      actionLower.includes(kw.toLowerCase())
    );
    
    if (matchedKeywords.length >= Math.ceil(requiredKeywords.length * 0.5)) {
      return { 
        canComplete: true, 
        task,
        matchedKeywords 
      };
    }
    
    return { 
      canComplete: false, 
      reason: '行动不符合任务要求',
      hint: `提示：尝试 ${task.required_action}`
    };
  }
}

export default new Database();
