/**
 * 剧本工厂 - 独立数据库
 * 管理预制剧本的存储和检索
 */

import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ScriptDatabase {
  constructor() {
    this.db = null;
    this.dbPath = join(__dirname, 'data', 'scripts.db');
  }

  async connect() {
    return new Promise((resolve, reject) => {
      // 确保数据目录存在
      const dbDir = dirname(this.dbPath);
      if (!existsSync(dbDir)) {
        mkdirSync(dbDir, { recursive: true });
      }

      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('[剧本工厂] 数据库连接成功:', this.dbPath);
          this.initTables().then(resolve).catch(reject);
        }
      });

      // Promise化
      this.db.run = promisify(this.db.run.bind(this.db));
      this.db.get = promisify(this.db.get.bind(this.db));
      this.db.all = promisify(this.db.all.bind(this.db));

      // 启用WAL模式
      this.db.run('PRAGMA journal_mode = WAL;').catch(() => {});
      this.db.run('PRAGMA foreign_keys = ON;').catch(() => {});
    });
  }

  async initTables() {
    // ==================== 剧本主表 ====================
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS scripts (
        id TEXT PRIMARY KEY,
        
        -- 基本信息
        title TEXT NOT NULL,
        subtitle TEXT,
        description TEXT,
        cover_image TEXT,
        
        -- 游戏参数
        min_players INTEGER NOT NULL DEFAULT 3,
        max_players INTEGER NOT NULL DEFAULT 6,
        recommended_players INTEGER DEFAULT 4,
        difficulty INTEGER NOT NULL DEFAULT 3,
        estimated_duration INTEGER DEFAULT 120,
        
        -- 分类标签
        theme TEXT NOT NULL,
        tags JSON,
        age_rating TEXT DEFAULT 'PG-13',
        
        -- 叙事复杂度配置
        narrative_complexity INTEGER DEFAULT 3,
        has_narrative_tricks INTEGER DEFAULT 0,
        trick_types JSON,
        
        -- 多结局配置
        has_multiple_endings INTEGER DEFAULT 0,
        ending_count INTEGER DEFAULT 1,
        
        -- 角色技能配置
        has_character_skills INTEGER DEFAULT 0,
        
        -- 状态
        status TEXT DEFAULT 'draft',
        version TEXT DEFAULT '1.0.0',
        is_published INTEGER DEFAULT 0,
        published_at DATETIME,
        
        -- 统计
        play_count INTEGER DEFAULT 0,
        rating REAL DEFAULT 0,
        rating_count INTEGER DEFAULT 0,
        
        -- 元数据
        author TEXT DEFAULT 'AI生成',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ==================== 剧本核心真相表 ====================
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS script_truth (
        id TEXT PRIMARY KEY,
        script_id TEXT NOT NULL UNIQUE,
        
        -- 案件核心
        case_type TEXT NOT NULL,
        victim_name TEXT NOT NULL,
        victim_background TEXT,
        
        -- 凶手信息
        murderer_character_id TEXT NOT NULL,
        murder_motive TEXT NOT NULL,
        murder_method TEXT NOT NULL,
        murder_time TEXT,
        murder_location TEXT NOT NULL,
        
        -- 完整真相
        full_truth TEXT NOT NULL,
        timeline JSON,
        
        -- 红鲱鱼（误导线索）
        red_herrings JSON,
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
      )
    `);

    // ==================== 角色表 ====================
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS script_characters (
        id TEXT PRIMARY KEY,
        script_id TEXT NOT NULL,
        
        -- 基本信息
        name TEXT NOT NULL,
        gender TEXT,
        age INTEGER,
        occupation TEXT,
        avatar TEXT,
        
        -- 角色类型
        character_type TEXT NOT NULL DEFAULT 'suspect',
        is_murderer INTEGER DEFAULT 0,
        is_victim INTEGER DEFAULT 0,
        
        -- 隐藏身份（真实身份可能与表面不同）
        hidden_identity TEXT,
        identity_reveal_condition TEXT,
        
        -- 公开信息（所有玩家可见）
        public_info TEXT NOT NULL,
        public_personality TEXT,
        public_background TEXT,
        
        -- 秘密信息（仅该玩家可见）
        secret_info TEXT,
        secret_motive TEXT,
        alibi TEXT,
        alibi_truth TEXT,
        
        -- 个人目标
        personal_goal TEXT,
        win_condition TEXT,
        
        -- 情感弧线起点
        emotional_start_state TEXT,
        
        -- 线索持有
        initial_clues JSON,
        
        -- 角色重要性权重（确保每个角色都有戏份）
        importance_weight INTEGER DEFAULT 5,
        
        -- 显示顺序
        display_order INTEGER DEFAULT 0,
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
      )
    `);

    // ==================== 人物关系表 ====================
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS script_relationships (
        id TEXT PRIMARY KEY,
        script_id TEXT NOT NULL,
        
        character_a_id TEXT NOT NULL,
        character_b_id TEXT NOT NULL,
        
        -- 关系类型
        relationship_type TEXT NOT NULL,
        relationship_detail TEXT,
        
        -- 关系是否公开
        is_public INTEGER DEFAULT 1,
        
        -- 双向关系描述
        a_to_b_description TEXT,
        b_to_a_description TEXT,
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE,
        FOREIGN KEY (character_a_id) REFERENCES script_characters(id) ON DELETE CASCADE,
        FOREIGN KEY (character_b_id) REFERENCES script_characters(id) ON DELETE CASCADE
      )
    `);

    // ==================== 章节表 ====================
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS script_chapters (
        id TEXT PRIMARY KEY,
        script_id TEXT NOT NULL,
        
        -- 章节信息
        chapter_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        subtitle TEXT,
        
        -- 内容
        opening_narration TEXT NOT NULL,
        scene_description TEXT,
        main_content TEXT NOT NULL,
        
        -- 章节目标
        chapter_goal TEXT NOT NULL,
        success_condition TEXT,
        
        -- 可交互地点
        available_locations JSON,
        
        -- 可交互NPC
        available_npcs JSON,
        
        -- 新揭示的信息
        new_revelations JSON,
        
        -- 时间限制（分钟）
        time_limit INTEGER,
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
      )
    `);

    // ==================== 线索表 ====================
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS script_clues (
        id TEXT PRIMARY KEY,
        script_id TEXT NOT NULL,
        chapter_id TEXT,
        
        -- 线索信息
        clue_name TEXT NOT NULL,
        clue_type TEXT NOT NULL,
        clue_content TEXT NOT NULL,
        clue_image TEXT,
        
        -- 发现条件
        discovery_location TEXT,
        discovery_action TEXT,
        discovery_keywords JSON,
        
        -- 分配规则
        assigned_to_character_id TEXT,
        is_shared INTEGER DEFAULT 0,
        can_share INTEGER DEFAULT 1,
        
        -- 重要性
        importance INTEGER DEFAULT 3,
        is_key_evidence INTEGER DEFAULT 0,
        points_to_truth TEXT,
        
        -- 显示时机
        reveal_chapter INTEGER DEFAULT 1,
        reveal_condition TEXT,
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE,
        FOREIGN KEY (chapter_id) REFERENCES script_chapters(id) ON DELETE SET NULL
      )
    `);

    // ==================== 谜题表 ====================
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS script_puzzles (
        id TEXT PRIMARY KEY,
        script_id TEXT NOT NULL,
        chapter_id TEXT NOT NULL,
        
        -- 谜题信息
        puzzle_type TEXT NOT NULL DEFAULT 'deduction',
        question TEXT NOT NULL,
        
        -- 答案
        correct_answer TEXT NOT NULL,
        answer_keywords JSON NOT NULL,
        partial_answers JSON,
        
        -- 难度
        difficulty INTEGER DEFAULT 3,
        
        -- 提示
        hints JSON,
        max_hints INTEGER DEFAULT 3,
        
        -- 反馈
        success_message TEXT NOT NULL,
        failure_message TEXT,
        partial_message TEXT,
        
        -- 下一步指引
        next_step TEXT,
        
        -- 是否必须解开才能推进
        is_required INTEGER DEFAULT 1,
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE,
        FOREIGN KEY (chapter_id) REFERENCES script_chapters(id) ON DELETE CASCADE
      )
    `);

    // ==================== 地点表 ====================
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS script_locations (
        id TEXT PRIMARY KEY,
        script_id TEXT NOT NULL,
        
        -- 地点信息
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        image TEXT,
        
        -- 可检查物品
        searchable_items JSON,
        
        -- 隐藏信息
        hidden_info TEXT,
        discovery_condition TEXT,
        
        -- 可用章节
        available_from_chapter INTEGER DEFAULT 1,
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
      )
    `);

    // ==================== 叙事诡计表 ====================
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS script_narrative_tricks (
        id TEXT PRIMARY KEY,
        script_id TEXT NOT NULL,
        
        -- 诡计类型: physical(物理诡计), narrative(叙述诡计), cognitive(认知诡计)
        trick_type TEXT NOT NULL,
        trick_name TEXT NOT NULL,
        
        -- 诡计详情
        trick_description TEXT NOT NULL,
        -- 真相揭示：玩家发现诡计后的真相
        revelation TEXT NOT NULL,
        
        -- 触发条件
        trigger_condition TEXT,
        trigger_chapter INTEGER DEFAULT 2,
        
        -- 涉及角色
        involved_characters JSON,
        -- 相关线索
        related_clues JSON,
        
        -- 难度评级 1-5
        difficulty_rating INTEGER DEFAULT 3,
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
      )
    `);

    // ==================== 多层故事结构表 ====================
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS script_story_layers (
        id TEXT PRIMARY KEY,
        script_id TEXT NOT NULL,
        
        -- 故事层级: surface(表层), hidden(暗层), core(核心)
        layer_type TEXT NOT NULL,
        
        -- 层级标题
        layer_title TEXT NOT NULL,
        -- 层级内容
        layer_content TEXT NOT NULL,
        
        -- 揭示条件
        reveal_condition TEXT,
        -- 揭示章节
        reveal_chapter INTEGER,
        
        -- 相关人物
        related_characters JSON,
        -- 相关线索
        required_clues JSON,
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
      )
    `);

    // ==================== NPC人格档案表 ====================
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS script_npc_personas (
        id TEXT PRIMARY KEY,
        script_id TEXT NOT NULL,
        character_id TEXT NOT NULL,
        
        -- 人格特征
        personality_traits JSON NOT NULL,
        -- 说话风格
        speaking_style TEXT,
        -- 口头禅
        catchphrases JSON,
        
        -- 立场和态度
        stance TEXT,
        -- 对各玩家的初始态度 (character_id -> attitude)
        attitudes_to_players JSON,
        
        -- 知道的秘密
        known_secrets JSON,
        -- 不愿透露的信息
        hidden_info JSON,
        -- 可以被套出的信息
        revealable_info JSON,
        
        -- 触发条件映射 (condition -> response)
        trigger_responses JSON,
        
        -- 公聊和私聊的差异化行为
        public_behavior TEXT,
        private_behavior TEXT,
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE,
        FOREIGN KEY (character_id) REFERENCES script_characters(id) ON DELETE CASCADE
      )
    `);

    // ==================== 角色技能表 ====================
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS script_character_skills (
        id TEXT PRIMARY KEY,
        script_id TEXT NOT NULL,
        character_id TEXT NOT NULL,
        
        -- 技能信息
        skill_name TEXT NOT NULL,
        skill_type TEXT NOT NULL,
        skill_description TEXT NOT NULL,
        skill_icon TEXT,
        
        -- 使用限制
        max_uses INTEGER DEFAULT 1,
        cooldown_chapters INTEGER DEFAULT 1,
        
        -- 效果
        effect_type TEXT NOT NULL,
        effect_description TEXT NOT NULL,
        effect_target TEXT,
        
        -- 触发条件
        activation_condition TEXT,
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE,
        FOREIGN KEY (character_id) REFERENCES script_characters(id) ON DELETE CASCADE
      )
    `);

    // ==================== 分支剧情表 ====================
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS script_plot_branches (
        id TEXT PRIMARY KEY,
        script_id TEXT NOT NULL,
        
        -- 分支点
        branch_point_chapter INTEGER NOT NULL,
        branch_point_description TEXT NOT NULL,
        
        -- 分支条件
        condition_type TEXT NOT NULL,
        condition_value JSON NOT NULL,
        
        -- 分支结果
        branch_name TEXT NOT NULL,
        branch_outcome TEXT NOT NULL,
        
        -- 后续影响
        affected_chapters JSON,
        new_clues JSON,
        character_changes JSON,
        
        -- 通向的结局
        leads_to_ending TEXT,
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
      )
    `);

    // ==================== 多结局表 ====================
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS script_endings (
        id TEXT PRIMARY KEY,
        script_id TEXT NOT NULL,
        
        -- 结局信息
        ending_name TEXT NOT NULL,
        ending_type TEXT NOT NULL,
        ending_description TEXT NOT NULL,
        
        -- 达成条件
        required_conditions JSON NOT NULL,
        
        -- 结局叙述
        ending_narration TEXT NOT NULL,
        
        -- 各角色的结局
        character_outcomes JSON,
        
        -- 评分加成
        bonus_score INTEGER DEFAULT 0,
        
        -- 是否为隐藏结局
        is_hidden INTEGER DEFAULT 0,
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
      )
    `);

    // ==================== 情感弧线表 ====================
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS script_emotional_arcs (
        id TEXT PRIMARY KEY,
        script_id TEXT NOT NULL,
        character_id TEXT NOT NULL,
        
        -- 情感阶段
        arc_stage INTEGER NOT NULL,
        arc_chapter INTEGER NOT NULL,
        
        -- 情感状态
        emotional_state TEXT NOT NULL,
        emotional_trigger TEXT,
        
        -- 内心独白
        inner_monologue TEXT,
        
        -- 外在表现
        outward_behavior TEXT,
        
        -- 与其他角色的情感互动
        emotional_interactions JSON,
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE,
        FOREIGN KEY (character_id) REFERENCES script_characters(id) ON DELETE CASCADE
      )
    `);

    // ==================== 动态事件表 ====================
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS script_dynamic_events (
        id TEXT PRIMARY KEY,
        script_id TEXT NOT NULL,
        
        -- 事件信息
        event_name TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_description TEXT NOT NULL,
        
        -- 触发条件
        trigger_type TEXT NOT NULL,
        trigger_condition JSON NOT NULL,
        
        -- 触发时机
        earliest_chapter INTEGER DEFAULT 1,
        latest_chapter INTEGER DEFAULT 3,
        
        -- 事件效果
        event_effects JSON NOT NULL,
        
        -- 氛围调节: tense, relaxed, shocking, emotional
        atmosphere_effect TEXT,
        
        -- 是否为一次性事件
        is_one_time INTEGER DEFAULT 1,
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
      )
    `);

    // ==================== 凶手专属引导表 ====================
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS script_murderer_guide (
        id TEXT PRIMARY KEY,
        script_id TEXT NOT NULL,
        
        -- 章节
        chapter_number INTEGER NOT NULL,
        
        -- 策略建议
        strategy_tips JSON NOT NULL,
        -- 话术建议
        speech_suggestions JSON,
        -- 干扰选项
        interference_options JSON,
        -- 替罪羊策略
        scapegoat_strategies JSON,
        -- 反侦察技巧
        counter_detection_tips JSON,
        
        -- 危险信号警告
        danger_signals JSON,
        -- 安全话题
        safe_topics JSON,
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
      )
    `);

    // ==================== 剧本使用记录表 ====================
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS script_usage_logs (
        id TEXT PRIMARY KEY,
        script_id TEXT NOT NULL,
        room_id TEXT,
        
        -- 使用信息
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME,
        
        -- 结果
        completed INTEGER DEFAULT 0,
        winner_found INTEGER DEFAULT 0,
        
        -- 玩家反馈
        rating INTEGER,
        feedback TEXT,
        
        FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
      )
    `);

    // 创建索引
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_scripts_status ON scripts(status)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_scripts_theme ON scripts(theme)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_scripts_published ON scripts(is_published)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_characters_script ON script_characters(script_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_chapters_script ON script_chapters(script_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_clues_script ON script_clues(script_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_puzzles_chapter ON script_puzzles(chapter_id)`);
    
    // 新增索引
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_narrative_tricks ON script_narrative_tricks(script_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_story_layers ON script_story_layers(script_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_npc_personas ON script_npc_personas(script_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_character_skills ON script_character_skills(script_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_plot_branches ON script_plot_branches(script_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_endings ON script_endings(script_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_emotional_arcs ON script_emotional_arcs(script_id, character_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_dynamic_events ON script_dynamic_events(script_id)`);
    await this.db.run(`CREATE INDEX IF NOT EXISTS idx_murderer_guide ON script_murderer_guide(script_id)`);

    console.log('[剧本工厂] 数据库表初始化完成');
  }

  // ==================== 剧本 CRUD ====================

  /**
   * 创建剧本
   */
  async createScript(script) {
    const {
      id, title, subtitle, description, coverImage,
      minPlayers, maxPlayers, recommendedPlayers, difficulty, estimatedDuration,
      theme, tags, ageRating, author
    } = script;

    await this.db.run(
      `INSERT INTO scripts (
        id, title, subtitle, description, cover_image,
        min_players, max_players, recommended_players, difficulty, estimated_duration,
        theme, tags, age_rating, author
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, title, subtitle || null, description || null, coverImage || null,
        minPlayers || 3, maxPlayers || 6, recommendedPlayers || 4, difficulty || 3, estimatedDuration || 120,
        theme, JSON.stringify(tags || []), ageRating || 'PG-13', author || 'AI生成'
      ]
    );

    return await this.getScript(id);
  }

  /**
   * 获取剧本详情
   */
  async getScript(scriptId) {
    const script = await this.db.get('SELECT * FROM scripts WHERE id = ?', [scriptId]);
    if (script) {
      script.tags = JSON.parse(script.tags || '[]');
    }
    return script;
  }

  /**
   * 获取剧本列表
   */
  async getScripts(filters = {}) {
    const { status, theme, isPublished, limit = 50, offset = 0 } = filters;
    
    let query = 'SELECT * FROM scripts WHERE 1=1';
    const params = [];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (theme) {
      query += ' AND theme = ?';
      params.push(theme);
    }
    if (isPublished !== undefined) {
      query += ' AND is_published = ?';
      params.push(isPublished ? 1 : 0);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const scripts = await this.db.all(query, params);
    return scripts.map(s => ({
      ...s,
      tags: JSON.parse(s.tags || '[]')
    }));
  }

  /**
   * 更新剧本
   */
  async updateScript(scriptId, updates) {
    const fields = [];
    const values = [];

    const fieldMap = {
      title: 'title',
      subtitle: 'subtitle',
      description: 'description',
      coverImage: 'cover_image',
      minPlayers: 'min_players',
      maxPlayers: 'max_players',
      difficulty: 'difficulty',
      theme: 'theme',
      status: 'status',
      version: 'version'
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (updates[key] !== undefined) {
        fields.push(`${dbField} = ?`);
        values.push(key === 'tags' ? JSON.stringify(updates[key]) : updates[key]);
      }
    }

    if (updates.tags) {
      fields.push('tags = ?');
      values.push(JSON.stringify(updates.tags));
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');

    await this.db.run(
      `UPDATE scripts SET ${fields.join(', ')} WHERE id = ?`,
      [...values, scriptId]
    );

    return await this.getScript(scriptId);
  }

  /**
   * 删除剧本
   */
  async deleteScript(scriptId) {
    await this.db.run('DELETE FROM scripts WHERE id = ?', [scriptId]);
  }

  /**
   * 发布剧本
   */
  async publishScript(scriptId) {
    await this.db.run(
      `UPDATE scripts SET 
        is_published = 1, 
        status = 'published',
        published_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [scriptId]
    );
    return await this.getScript(scriptId);
  }

  // ==================== 真相 CRUD ====================

  async createScriptTruth(truth) {
    const {
      id, scriptId, caseType, victimName, victimBackground,
      murdererCharacterId, murderMotive, murderMethod, murderTime, murderLocation,
      fullTruth, timeline, redHerrings
    } = truth;

    await this.db.run(
      `INSERT INTO script_truth (
        id, script_id, case_type, victim_name, victim_background,
        murderer_character_id, murder_motive, murder_method, murder_time, murder_location,
        full_truth, timeline, red_herrings
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, scriptId, caseType, victimName, victimBackground || null,
        murdererCharacterId, murderMotive, murderMethod, murderTime || null, murderLocation,
        fullTruth, JSON.stringify(timeline || []), JSON.stringify(redHerrings || [])
      ]
    );
  }

  async getScriptTruth(scriptId) {
    const truth = await this.db.get('SELECT * FROM script_truth WHERE script_id = ?', [scriptId]);
    if (truth) {
      truth.timeline = JSON.parse(truth.timeline || '[]');
      truth.red_herrings = JSON.parse(truth.red_herrings || '[]');
    }
    return truth;
  }

  // ==================== 角色 CRUD ====================

  async createCharacter(character) {
    const {
      id, scriptId, name, gender, age, occupation, avatar,
      characterType, isMurderer, isVictim,
      publicInfo, publicPersonality, publicBackground,
      secretInfo, secretMotive, alibi, alibiTruth,
      personalGoal, winCondition, initialClues, displayOrder
    } = character;

    await this.db.run(
      `INSERT INTO script_characters (
        id, script_id, name, gender, age, occupation, avatar,
        character_type, is_murderer, is_victim,
        public_info, public_personality, public_background,
        secret_info, secret_motive, alibi, alibi_truth,
        personal_goal, win_condition, initial_clues, display_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, scriptId, name, gender || null, age || null, occupation || null, avatar || null,
        characterType || 'suspect', isMurderer ? 1 : 0, isVictim ? 1 : 0,
        publicInfo, publicPersonality || null, publicBackground || null,
        secretInfo || null, secretMotive || null, alibi || null, alibiTruth || null,
        personalGoal || null, winCondition || null, JSON.stringify(initialClues || []), displayOrder || 0
      ]
    );
  }

  async getScriptCharacters(scriptId) {
    const characters = await this.db.all(
      'SELECT * FROM script_characters WHERE script_id = ? ORDER BY display_order ASC',
      [scriptId]
    );
    return characters.map(c => ({
      ...c,
      initial_clues: JSON.parse(c.initial_clues || '[]')
    }));
  }

  // ==================== 章节 CRUD ====================

  async createChapter(chapter) {
    const {
      id, scriptId, chapterNumber, title, subtitle,
      openingNarration, sceneDescription, mainContent,
      chapterGoal, successCondition,
      availableLocations, availableNpcs, newRevelations, timeLimit
    } = chapter;

    await this.db.run(
      `INSERT INTO script_chapters (
        id, script_id, chapter_number, title, subtitle,
        opening_narration, scene_description, main_content,
        chapter_goal, success_condition,
        available_locations, available_npcs, new_revelations, time_limit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, scriptId, chapterNumber, title, subtitle || null,
        openingNarration, sceneDescription || null, mainContent,
        chapterGoal, successCondition || null,
        JSON.stringify(availableLocations || []), JSON.stringify(availableNpcs || []),
        JSON.stringify(newRevelations || []), timeLimit || null
      ]
    );
  }

  async getScriptChapters(scriptId) {
    const chapters = await this.db.all(
      'SELECT * FROM script_chapters WHERE script_id = ? ORDER BY chapter_number ASC',
      [scriptId]
    );
    return chapters.map(c => ({
      ...c,
      available_locations: JSON.parse(c.available_locations || '[]'),
      available_npcs: JSON.parse(c.available_npcs || '[]'),
      new_revelations: JSON.parse(c.new_revelations || '[]')
    }));
  }

  // ==================== 线索 CRUD ====================

  async createClue(clue) {
    const {
      id, scriptId, chapterId, clueName, clueType, clueContent, clueImage,
      discoveryLocation, discoveryAction, discoveryKeywords,
      assignedToCharacterId, isShared, canShare,
      importance, isKeyEvidence, pointsToTruth,
      revealChapter, revealCondition
    } = clue;

    await this.db.run(
      `INSERT INTO script_clues (
        id, script_id, chapter_id, clue_name, clue_type, clue_content, clue_image,
        discovery_location, discovery_action, discovery_keywords,
        assigned_to_character_id, is_shared, can_share,
        importance, is_key_evidence, points_to_truth,
        reveal_chapter, reveal_condition
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, scriptId, chapterId || null, clueName, clueType, clueContent, clueImage || null,
        discoveryLocation || null, discoveryAction || null, JSON.stringify(discoveryKeywords || []),
        assignedToCharacterId || null, isShared ? 1 : 0, canShare !== false ? 1 : 0,
        importance || 3, isKeyEvidence ? 1 : 0, pointsToTruth || null,
        revealChapter || 1, revealCondition || null
      ]
    );
  }

  async getScriptClues(scriptId, chapterId = null) {
    let query = 'SELECT * FROM script_clues WHERE script_id = ?';
    const params = [scriptId];

    if (chapterId) {
      query += ' AND (chapter_id = ? OR chapter_id IS NULL)';
      params.push(chapterId);
    }

    query += ' ORDER BY importance DESC, reveal_chapter ASC';

    const clues = await this.db.all(query, params);
    return clues.map(c => ({
      ...c,
      discovery_keywords: JSON.parse(c.discovery_keywords || '[]')
    }));
  }

  // ==================== 谜题 CRUD ====================

  async createPuzzle(puzzle) {
    const {
      id, scriptId, chapterId, puzzleType, question,
      correctAnswer, answerKeywords, partialAnswers,
      difficulty, hints, maxHints,
      successMessage, failureMessage, partialMessage,
      nextStep, isRequired
    } = puzzle;

    await this.db.run(
      `INSERT INTO script_puzzles (
        id, script_id, chapter_id, puzzle_type, question,
        correct_answer, answer_keywords, partial_answers,
        difficulty, hints, max_hints,
        success_message, failure_message, partial_message,
        next_step, is_required
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, scriptId, chapterId, puzzleType || 'deduction', question,
        correctAnswer, JSON.stringify(answerKeywords), JSON.stringify(partialAnswers || []),
        difficulty || 3, JSON.stringify(hints || []), maxHints || 3,
        successMessage, failureMessage || null, partialMessage || null,
        nextStep || null, isRequired !== false ? 1 : 0
      ]
    );
  }

  async getChapterPuzzles(chapterId) {
    const puzzles = await this.db.all(
      'SELECT * FROM script_puzzles WHERE chapter_id = ? ORDER BY difficulty ASC',
      [chapterId]
    );
    return puzzles.map(p => ({
      ...p,
      answer_keywords: JSON.parse(p.answer_keywords || '[]'),
      partial_answers: JSON.parse(p.partial_answers || '[]'),
      hints: JSON.parse(p.hints || '[]')
    }));
  }

  // ==================== 地点 CRUD ====================

  async createLocation(location) {
    const {
      id, scriptId, name, description, image,
      searchableItems, hiddenInfo, discoveryCondition, availableFromChapter
    } = location;

    await this.db.run(
      `INSERT INTO script_locations (
        id, script_id, name, description, image,
        searchable_items, hidden_info, discovery_condition, available_from_chapter
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, scriptId, name, description, image || null,
        JSON.stringify(searchableItems || []), hiddenInfo || null,
        discoveryCondition || null, availableFromChapter || 1
      ]
    );
  }

  async getScriptLocations(scriptId) {
    const locations = await this.db.all(
      'SELECT * FROM script_locations WHERE script_id = ? ORDER BY available_from_chapter ASC',
      [scriptId]
    );
    return locations.map(l => ({
      ...l,
      searchable_items: JSON.parse(l.searchable_items || '[]')
    }));
  }

  // ==================== 关系 CRUD ====================

  async createRelationship(relationship) {
    const {
      id, scriptId, characterAId, characterBId,
      relationshipType, relationshipDetail, isPublic,
      aToBDescription, bToADescription
    } = relationship;

    await this.db.run(
      `INSERT INTO script_relationships (
        id, script_id, character_a_id, character_b_id,
        relationship_type, relationship_detail, is_public,
        a_to_b_description, b_to_a_description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, scriptId, characterAId, characterBId,
        relationshipType, relationshipDetail || null, isPublic !== false ? 1 : 0,
        aToBDescription || null, bToADescription || null
      ]
    );
  }

  async getScriptRelationships(scriptId) {
    return await this.db.all(
      `SELECT r.*, 
        ca.name as character_a_name, 
        cb.name as character_b_name
       FROM script_relationships r
       JOIN script_characters ca ON r.character_a_id = ca.id
       JOIN script_characters cb ON r.character_b_id = cb.id
       WHERE r.script_id = ?`,
      [scriptId]
    );
  }

  // ==================== 完整剧本导出 ====================

  /**
   * 获取完整剧本（包含所有关联数据）
   */
  async getFullScript(scriptId) {
    const script = await this.getScript(scriptId);
    if (!script) return null;

    const [truth, characters, chapters, clues, locations, relationships] = await Promise.all([
      this.getScriptTruth(scriptId),
      this.getScriptCharacters(scriptId),
      this.getScriptChapters(scriptId),
      this.getScriptClues(scriptId),
      this.getScriptLocations(scriptId),
      this.getScriptRelationships(scriptId)
    ]);

    // 获取每章的谜题
    const chaptersWithPuzzles = await Promise.all(
      chapters.map(async (chapter) => {
        const puzzles = await this.getChapterPuzzles(chapter.id);
        return { ...chapter, puzzles };
      })
    );

    return {
      ...script,
      truth,
      characters,
      chapters: chaptersWithPuzzles,
      clues,
      locations,
      relationships
    };
  }

  /**
   * 获取已发布的剧本列表（用于游戏选择）
   */
  async getPublishedScripts(filters = {}) {
    const { theme, minPlayers, maxPlayers, difficulty, limit = 20 } = filters;

    let query = 'SELECT * FROM scripts WHERE is_published = 1';
    const params = [];

    if (theme) {
      query += ' AND theme = ?';
      params.push(theme);
    }
    if (minPlayers) {
      query += ' AND max_players >= ?';
      params.push(minPlayers);
    }
    if (maxPlayers) {
      query += ' AND min_players <= ?';
      params.push(maxPlayers);
    }
    if (difficulty) {
      query += ' AND difficulty = ?';
      params.push(difficulty);
    }

    query += ' ORDER BY rating DESC, play_count DESC LIMIT ?';
    params.push(limit);

    const scripts = await this.db.all(query, params);
    return scripts.map(s => ({
      ...s,
      tags: JSON.parse(s.tags || '[]')
    }));
  }

  /**
   * 记录剧本使用
   */
  async logScriptUsage(scriptId, roomId) {
    const { v4: uuidv4 } = await import('uuid');
    await this.db.run(
      `INSERT INTO script_usage_logs (id, script_id, room_id) VALUES (?, ?, ?)`,
      [uuidv4(), scriptId, roomId]
    );

    // 更新使用次数
    await this.db.run(
      'UPDATE scripts SET play_count = play_count + 1 WHERE id = ?',
      [scriptId]
    );
  }

  /**
   * 更新剧本评分
   */
  async rateScript(scriptId, rating, feedback = null) {
    const script = await this.getScript(scriptId);
    if (!script) return;

    const newRatingCount = script.rating_count + 1;
    const newRating = ((script.rating * script.rating_count) + rating) / newRatingCount;

    await this.db.run(
      'UPDATE scripts SET rating = ?, rating_count = ? WHERE id = ?',
      [newRating, newRatingCount, scriptId]
    );
  }

  async close() {
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

  // ==================== 叙事诡计 CRUD ====================

  async createNarrativeTrick(trick) {
    const {
      id, scriptId, trickType, trickName, trickDescription, revelation,
      triggerCondition, triggerChapter, involvedCharacters, relatedClues, difficultyRating
    } = trick;

    await this.db.run(
      `INSERT INTO script_narrative_tricks (
        id, script_id, trick_type, trick_name, trick_description, revelation,
        trigger_condition, trigger_chapter, involved_characters, related_clues, difficulty_rating
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, scriptId, trickType, trickName, trickDescription, revelation,
        triggerCondition || null, triggerChapter || 2,
        JSON.stringify(involvedCharacters || []), JSON.stringify(relatedClues || []),
        difficultyRating || 3
      ]
    );
  }

  async getNarrativeTricks(scriptId) {
    const tricks = await this.db.all(
      'SELECT * FROM script_narrative_tricks WHERE script_id = ? ORDER BY trigger_chapter ASC',
      [scriptId]
    );
    return tricks.map(t => ({
      ...t,
      involved_characters: JSON.parse(t.involved_characters || '[]'),
      related_clues: JSON.parse(t.related_clues || '[]')
    }));
  }

  // ==================== 故事层级 CRUD ====================

  async createStoryLayer(layer) {
    const {
      id, scriptId, layerType, layerTitle, layerContent,
      revealCondition, revealChapter, relatedCharacters, requiredClues
    } = layer;

    await this.db.run(
      `INSERT INTO script_story_layers (
        id, script_id, layer_type, layer_title, layer_content,
        reveal_condition, reveal_chapter, related_characters, required_clues
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, scriptId, layerType, layerTitle, layerContent,
        revealCondition || null, revealChapter || null,
        JSON.stringify(relatedCharacters || []), JSON.stringify(requiredClues || [])
      ]
    );
  }

  async getStoryLayers(scriptId) {
    const layers = await this.db.all(
      'SELECT * FROM script_story_layers WHERE script_id = ? ORDER BY layer_type ASC',
      [scriptId]
    );
    return layers.map(l => ({
      ...l,
      related_characters: JSON.parse(l.related_characters || '[]'),
      required_clues: JSON.parse(l.required_clues || '[]')
    }));
  }

  // ==================== NPC人格 CRUD ====================

  async createNpcPersona(persona) {
    const {
      id, scriptId, characterId, personalityTraits, speakingStyle, catchphrases,
      stance, attitudesToPlayers, knownSecrets, hiddenInfo, revealableInfo,
      triggerResponses, publicBehavior, privateBehavior
    } = persona;

    await this.db.run(
      `INSERT INTO script_npc_personas (
        id, script_id, character_id, personality_traits, speaking_style, catchphrases,
        stance, attitudes_to_players, known_secrets, hidden_info, revealable_info,
        trigger_responses, public_behavior, private_behavior
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, scriptId, characterId, JSON.stringify(personalityTraits),
        speakingStyle || null, JSON.stringify(catchphrases || []),
        stance || null, JSON.stringify(attitudesToPlayers || {}),
        JSON.stringify(knownSecrets || []), JSON.stringify(hiddenInfo || []),
        JSON.stringify(revealableInfo || []), JSON.stringify(triggerResponses || {}),
        publicBehavior || null, privateBehavior || null
      ]
    );
  }

  async getNpcPersona(characterId) {
    const persona = await this.db.get(
      'SELECT * FROM script_npc_personas WHERE character_id = ?',
      [characterId]
    );
    if (persona) {
      persona.personality_traits = JSON.parse(persona.personality_traits || '[]');
      persona.catchphrases = JSON.parse(persona.catchphrases || '[]');
      persona.attitudes_to_players = JSON.parse(persona.attitudes_to_players || '{}');
      persona.known_secrets = JSON.parse(persona.known_secrets || '[]');
      persona.hidden_info = JSON.parse(persona.hidden_info || '[]');
      persona.revealable_info = JSON.parse(persona.revealable_info || '[]');
      persona.trigger_responses = JSON.parse(persona.trigger_responses || '{}');
    }
    return persona;
  }

  async getScriptNpcPersonas(scriptId) {
    const personas = await this.db.all(
      'SELECT * FROM script_npc_personas WHERE script_id = ?',
      [scriptId]
    );
    return personas.map(p => ({
      ...p,
      personality_traits: JSON.parse(p.personality_traits || '[]'),
      catchphrases: JSON.parse(p.catchphrases || '[]'),
      attitudes_to_players: JSON.parse(p.attitudes_to_players || '{}'),
      known_secrets: JSON.parse(p.known_secrets || '[]'),
      hidden_info: JSON.parse(p.hidden_info || '[]'),
      revealable_info: JSON.parse(p.revealable_info || '[]'),
      trigger_responses: JSON.parse(p.trigger_responses || '{}')
    }));
  }

  // ==================== 角色技能 CRUD ====================

  async createCharacterSkill(skill) {
    const {
      id, scriptId, characterId, skillName, skillType, skillDescription, skillIcon,
      maxUses, cooldownChapters, effectType, effectDescription, effectTarget,
      activationCondition
    } = skill;

    await this.db.run(
      `INSERT INTO script_character_skills (
        id, script_id, character_id, skill_name, skill_type, skill_description, skill_icon,
        max_uses, cooldown_chapters, effect_type, effect_description, effect_target,
        activation_condition
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, scriptId, characterId, skillName, skillType, skillDescription, skillIcon || null,
        maxUses || 1, cooldownChapters || 1, effectType, effectDescription, effectTarget || null,
        activationCondition || null
      ]
    );
  }

  async getCharacterSkills(characterId) {
    return await this.db.all(
      'SELECT * FROM script_character_skills WHERE character_id = ?',
      [characterId]
    );
  }

  async getScriptSkills(scriptId) {
    return await this.db.all(
      'SELECT * FROM script_character_skills WHERE script_id = ?',
      [scriptId]
    );
  }

  // ==================== 分支剧情 CRUD ====================

  async createPlotBranch(branch) {
    const {
      id, scriptId, branchPointChapter, branchPointDescription,
      conditionType, conditionValue, branchName, branchOutcome,
      affectedChapters, newClues, characterChanges, leadsToEnding
    } = branch;

    await this.db.run(
      `INSERT INTO script_plot_branches (
        id, script_id, branch_point_chapter, branch_point_description,
        condition_type, condition_value, branch_name, branch_outcome,
        affected_chapters, new_clues, character_changes, leads_to_ending
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, scriptId, branchPointChapter, branchPointDescription,
        conditionType, JSON.stringify(conditionValue), branchName, branchOutcome,
        JSON.stringify(affectedChapters || []), JSON.stringify(newClues || []),
        JSON.stringify(characterChanges || []), leadsToEnding || null
      ]
    );
  }

  async getPlotBranches(scriptId) {
    const branches = await this.db.all(
      'SELECT * FROM script_plot_branches WHERE script_id = ? ORDER BY branch_point_chapter ASC',
      [scriptId]
    );
    return branches.map(b => ({
      ...b,
      condition_value: JSON.parse(b.condition_value || '{}'),
      affected_chapters: JSON.parse(b.affected_chapters || '[]'),
      new_clues: JSON.parse(b.new_clues || '[]'),
      character_changes: JSON.parse(b.character_changes || '[]')
    }));
  }

  // ==================== 多结局 CRUD ====================

  async createEnding(ending) {
    const {
      id, scriptId, endingName, endingType, endingDescription,
      requiredConditions, endingNarration, characterOutcomes, bonusScore, isHidden
    } = ending;

    await this.db.run(
      `INSERT INTO script_endings (
        id, script_id, ending_name, ending_type, ending_description,
        required_conditions, ending_narration, character_outcomes, bonus_score, is_hidden
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, scriptId, endingName, endingType, endingDescription,
        JSON.stringify(requiredConditions), endingNarration,
        JSON.stringify(characterOutcomes || {}), bonusScore || 0, isHidden ? 1 : 0
      ]
    );
  }

  async getEndings(scriptId) {
    const endings = await this.db.all(
      'SELECT * FROM script_endings WHERE script_id = ?',
      [scriptId]
    );
    return endings.map(e => ({
      ...e,
      required_conditions: JSON.parse(e.required_conditions || '[]'),
      character_outcomes: JSON.parse(e.character_outcomes || '{}')
    }));
  }

  // ==================== 情感弧线 CRUD ====================

  async createEmotionalArc(arc) {
    const {
      id, scriptId, characterId, arcStage, arcChapter,
      emotionalState, emotionalTrigger, innerMonologue, outwardBehavior,
      emotionalInteractions
    } = arc;

    await this.db.run(
      `INSERT INTO script_emotional_arcs (
        id, script_id, character_id, arc_stage, arc_chapter,
        emotional_state, emotional_trigger, inner_monologue, outward_behavior,
        emotional_interactions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, scriptId, characterId, arcStage, arcChapter,
        emotionalState, emotionalTrigger || null, innerMonologue || null,
        outwardBehavior || null, JSON.stringify(emotionalInteractions || [])
      ]
    );
  }

  async getEmotionalArcs(scriptId, characterId = null) {
    let query = 'SELECT * FROM script_emotional_arcs WHERE script_id = ?';
    const params = [scriptId];
    
    if (characterId) {
      query += ' AND character_id = ?';
      params.push(characterId);
    }
    query += ' ORDER BY arc_chapter ASC, arc_stage ASC';

    const arcs = await this.db.all(query, params);
    return arcs.map(a => ({
      ...a,
      emotional_interactions: JSON.parse(a.emotional_interactions || '[]')
    }));
  }

  // ==================== 动态事件 CRUD ====================

  async createDynamicEvent(event) {
    const {
      id, scriptId, eventName, eventType, eventDescription,
      triggerType, triggerCondition, earliestChapter, latestChapter,
      eventEffects, atmosphereEffect, isOneTime
    } = event;

    await this.db.run(
      `INSERT INTO script_dynamic_events (
        id, script_id, event_name, event_type, event_description,
        trigger_type, trigger_condition, earliest_chapter, latest_chapter,
        event_effects, atmosphere_effect, is_one_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, scriptId, eventName, eventType, eventDescription,
        triggerType, JSON.stringify(triggerCondition), earliestChapter || 1, latestChapter || 3,
        JSON.stringify(eventEffects), atmosphereEffect || null, isOneTime !== false ? 1 : 0
      ]
    );
  }

  async getDynamicEvents(scriptId) {
    const events = await this.db.all(
      'SELECT * FROM script_dynamic_events WHERE script_id = ? ORDER BY earliest_chapter ASC',
      [scriptId]
    );
    return events.map(e => ({
      ...e,
      trigger_condition: JSON.parse(e.trigger_condition || '{}'),
      event_effects: JSON.parse(e.event_effects || '{}')
    }));
  }

  // ==================== 凶手引导 CRUD ====================

  async createMurdererGuide(guide) {
    const {
      id, scriptId, chapterNumber, strategyTips, speechSuggestions,
      interferenceOptions, scapegoatStrategies, counterDetectionTips,
      dangerSignals, safeTopics
    } = guide;

    await this.db.run(
      `INSERT INTO script_murderer_guide (
        id, script_id, chapter_number, strategy_tips, speech_suggestions,
        interference_options, scapegoat_strategies, counter_detection_tips,
        danger_signals, safe_topics
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, scriptId, chapterNumber, JSON.stringify(strategyTips),
        JSON.stringify(speechSuggestions || []), JSON.stringify(interferenceOptions || []),
        JSON.stringify(scapegoatStrategies || []), JSON.stringify(counterDetectionTips || []),
        JSON.stringify(dangerSignals || []), JSON.stringify(safeTopics || [])
      ]
    );
  }

  async getMurdererGuide(scriptId, chapterNumber = null) {
    let query = 'SELECT * FROM script_murderer_guide WHERE script_id = ?';
    const params = [scriptId];
    
    if (chapterNumber !== null) {
      query += ' AND chapter_number = ?';
      params.push(chapterNumber);
    }
    query += ' ORDER BY chapter_number ASC';

    const guides = await this.db.all(query, params);
    return guides.map(g => ({
      ...g,
      strategy_tips: JSON.parse(g.strategy_tips || '[]'),
      speech_suggestions: JSON.parse(g.speech_suggestions || '[]'),
      interference_options: JSON.parse(g.interference_options || '[]'),
      scapegoat_strategies: JSON.parse(g.scapegoat_strategies || '[]'),
      counter_detection_tips: JSON.parse(g.counter_detection_tips || '[]'),
      danger_signals: JSON.parse(g.danger_signals || '[]'),
      safe_topics: JSON.parse(g.safe_topics || '[]')
    }));
  }

  // ==================== 增强的完整剧本导出 ====================

  /**
   * 获取完整增强剧本（包含所有新功能的数据）
   */
  async getFullEnhancedScript(scriptId) {
    const baseScript = await this.getFullScript(scriptId);
    if (!baseScript) return null;

    const [
      narrativeTricks, storyLayers, npcPersonas, skills, 
      plotBranches, endings, emotionalArcs, dynamicEvents, murdererGuide
    ] = await Promise.all([
      this.getNarrativeTricks(scriptId),
      this.getStoryLayers(scriptId),
      this.getScriptNpcPersonas(scriptId),
      this.getScriptSkills(scriptId),
      this.getPlotBranches(scriptId),
      this.getEndings(scriptId),
      this.getEmotionalArcs(scriptId),
      this.getDynamicEvents(scriptId),
      this.getMurdererGuide(scriptId)
    ]);

    return {
      ...baseScript,
      narrativeTricks,
      storyLayers,
      npcPersonas,
      skills,
      plotBranches,
      endings,
      emotionalArcs,
      dynamicEvents,
      murdererGuide
    };
  }
}

// 单例导出
const scriptDatabase = new ScriptDatabase();
export default scriptDatabase;
