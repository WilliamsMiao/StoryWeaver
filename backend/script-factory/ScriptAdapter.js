/**
 * 剧本工厂 - 游戏适配器
 * 将预制剧本转换为游戏引擎可用的格式
 */

import scriptDatabase from './database.js';

class ScriptAdapter {
  /**
   * 获取可用的已发布剧本列表（用于游戏选择）
   */
  async getAvailableScripts(filters = {}) {
    const scripts = await scriptDatabase.getPublishedScripts(filters);
    return scripts.map(s => ({
      id: s.id,
      title: s.title,
      description: s.description,
      theme: s.theme,
      minPlayers: s.min_players,
      maxPlayers: s.max_players,
      difficulty: s.difficulty,
      estimatedDuration: s.estimated_duration,
      rating: s.rating,
      playCount: s.play_count,
      tags: s.tags
    }));
  }

  /**
   * 获取完整剧本并转换为游戏格式
   */
  async loadScriptForGame(scriptId) {
    const script = await scriptDatabase.getFullScript(scriptId);
    if (!script) {
      throw new Error('剧本不存在');
    }

    if (!script.is_published) {
      throw new Error('剧本未发布，无法使用');
    }

    // 转换为游戏引擎需要的格式
    return this.convertToGameFormat(script);
  }

  /**
   * 转换剧本格式为游戏引擎格式
   */
  convertToGameFormat(script) {
    // 转换角色
    const characters = (script.characters || []).map(c => ({
      id: c.id,
      name: c.name,
      gender: c.gender,
      age: c.age,
      occupation: c.occupation,
      avatar: c.avatar,
      
      // 公开信息
      publicInfo: c.public_info,
      publicPersonality: c.public_personality,
      publicBackground: c.public_background,
      
      // 秘密信息
      secretInfo: c.secret_info,
      secretMotive: c.secret_motive,
      alibi: c.alibi,
      alibiTruth: c.alibi_truth,
      
      // 目标
      personalGoal: c.personal_goal,
      winCondition: c.win_condition,
      
      // 标记
      isMurderer: c.is_murderer === 1,
      isVictim: c.is_victim === 1,
      
      // 初始线索
      initialClues: c.initial_clues || []
    }));

    // 转换章节
    const chapters = (script.chapters || []).map(c => ({
      id: c.id,
      chapterNumber: c.chapter_number,
      title: c.title,
      subtitle: c.subtitle,
      
      // 内容
      openingNarration: c.opening_narration,
      sceneDescription: c.scene_description,
      mainContent: c.main_content,
      
      // 目标
      chapterGoal: c.chapter_goal,
      successCondition: c.success_condition,
      
      // 可用内容
      availableLocations: c.available_locations || [],
      availableNpcs: c.available_npcs || [],
      newRevelations: c.new_revelations || [],
      
      // 谜题
      puzzles: (c.puzzles || []).map(p => ({
        id: p.id,
        puzzleType: p.puzzle_type,
        question: p.question,
        correctAnswer: p.correct_answer,
        answerKeywords: p.answer_keywords || [],
        difficulty: p.difficulty,
        hints: p.hints || [],
        successMessage: p.success_message,
        failureMessage: p.failure_message,
        nextStep: p.next_step,
        isRequired: p.is_required === 1
      })),
      
      timeLimit: c.time_limit
    }));

    // 转换线索
    const clues = (script.clues || []).map(c => ({
      id: c.id,
      name: c.clue_name,
      type: c.clue_type,
      content: c.clue_content,
      image: c.clue_image,
      
      discoveryLocation: c.discovery_location,
      discoveryAction: c.discovery_action,
      discoveryKeywords: c.discovery_keywords || [],
      
      assignedToCharacterId: c.assigned_to_character_id,
      isShared: c.is_shared === 1,
      canShare: c.can_share === 1,
      
      importance: c.importance,
      isKeyEvidence: c.is_key_evidence === 1,
      pointsToTruth: c.points_to_truth,
      
      revealChapter: c.reveal_chapter
    }));

    // 转换地点
    const locations = (script.locations || []).map(l => ({
      id: l.id,
      name: l.name,
      description: l.description,
      image: l.image,
      searchableItems: l.searchable_items || [],
      hiddenInfo: l.hidden_info,
      discoveryCondition: l.discovery_condition,
      availableFromChapter: l.available_from_chapter
    }));

    // 转换关系
    const relationships = (script.relationships || []).map(r => ({
      characterAId: r.character_a_id,
      characterAName: r.character_a_name,
      characterBId: r.character_b_id,
      characterBName: r.character_b_name,
      relationshipType: r.relationship_type,
      relationshipDetail: r.relationship_detail,
      isPublic: r.is_public === 1,
      aToBDescription: r.a_to_b_description,
      bToADescription: r.b_to_a_description
    }));

    // 构建故事大纲（供AIService使用）
    const storyOutline = script.truth ? {
      caseType: script.truth.case_type,
      victimName: script.truth.victim_name,
      victimDescription: script.truth.victim_background,
      murdererName: characters.find(c => c.isMurderer)?.name || '',
      murdererMotive: script.truth.murder_motive,
      murderMethod: script.truth.murder_method,
      murderLocation: script.truth.murder_location,
      murderTime: script.truth.murder_time,
      fullTruth: script.truth.full_truth,
      timeline: script.truth.timeline || [],
      redHerrings: script.truth.red_herrings || [],
      
      // 章节目标（从chapters提取）
      chapterGoals: chapters.map(c => ({
        chapter: c.chapterNumber,
        title: c.title,
        mainObjective: c.chapterGoal,
        successCondition: c.successCondition,
        puzzleQuestion: c.puzzles[0]?.question || '',
        puzzleAnswer: c.puzzles[0]?.correctAnswer || '',
        puzzleKeywords: c.puzzles[0]?.answerKeywords || []
      })),
      
      // 关键证据
      keyEvidence: clues.filter(c => c.isKeyEvidence).map(c => ({
        name: c.name,
        location: c.discoveryLocation,
        description: c.content
      })),
      
      // 地点
      locations: locations.map(l => ({
        name: l.name,
        description: l.description,
        items: l.searchableItems
      })),
      
      // 可交互物品
      interactableItems: clues.map(c => ({
        name: c.name,
        location: c.discoveryLocation,
        description: c.content,
        keywords: c.discoveryKeywords
      })),
      
      // NPC（从角色中提取）
      npcs: characters.map(c => ({
        name: c.name,
        role: c.occupation,
        personality: c.publicPersonality,
        secret: c.secretInfo,
        alibi: c.alibi,
        suspicionLevel: c.isMurderer ? 8 : Math.floor(Math.random() * 5) + 3
      }))
    } : null;

    return {
      // 基本信息
      id: script.id,
      title: script.title,
      subtitle: script.subtitle,
      description: script.description,
      theme: script.theme,
      
      // 游戏参数
      minPlayers: script.min_players,
      maxPlayers: script.max_players,
      difficulty: script.difficulty,
      estimatedDuration: script.estimated_duration,
      
      // 核心内容
      characters,
      chapters,
      clues,
      locations,
      relationships,
      
      // 故事大纲（供AI使用）
      storyOutline,
      
      // 案件真相（仅用于验证）
      truth: script.truth ? {
        victimName: script.truth.victim_name,
        murdererCharacterId: script.truth.murderer_character_id,
        murderMotive: script.truth.murder_motive,
        murderMethod: script.truth.murder_method,
        fullTruth: script.truth.full_truth
      } : null,
      
      // 标记为预制剧本
      isPrebuilt: true,
      scriptVersion: script.version
    };
  }

  /**
   * 为玩家分配角色
   */
  assignCharactersToPlayers(script, players) {
    const playableCharacters = script.characters.filter(c => !c.isVictim);
    
    if (players.length > playableCharacters.length) {
      throw new Error(`玩家数量(${players.length})超过可用角色数量(${playableCharacters.length})`);
    }

    const assignments = [];
    const shuffledCharacters = [...playableCharacters].sort(() => Math.random() - 0.5);

    players.forEach((player, index) => {
      const character = shuffledCharacters[index];
      assignments.push({
        playerId: player.id,
        playerName: player.username,
        characterId: character.id,
        characterName: character.name,
        character: character
      });
    });

    return assignments;
  }

  /**
   * 获取玩家的角色信息（过滤秘密信息）
   */
  getPlayerCharacterInfo(character, isOwner = false) {
    const baseInfo = {
      id: character.id,
      name: character.name,
      gender: character.gender,
      age: character.age,
      occupation: character.occupation,
      avatar: character.avatar,
      publicInfo: character.publicInfo,
      publicPersonality: character.publicPersonality,
      publicBackground: character.publicBackground
    };

    if (isOwner) {
      // 玩家自己可以看到完整信息
      return {
        ...baseInfo,
        secretInfo: character.secretInfo,
        secretMotive: character.secretMotive,
        alibi: character.alibi,
        alibiTruth: character.alibiTruth,
        personalGoal: character.personalGoal,
        winCondition: character.winCondition,
        initialClues: character.initialClues,
        isMurderer: character.isMurderer
      };
    }

    // 其他玩家只能看到公开信息
    return baseInfo;
  }

  /**
   * 获取章节内容（根据进度过滤）
   */
  getChapterContent(script, chapterNumber) {
    const chapter = script.chapters.find(c => c.chapterNumber === chapterNumber);
    if (!chapter) {
      return null;
    }

    // 获取该章节可用的线索
    const availableClues = script.clues.filter(c => c.revealChapter <= chapterNumber);

    // 获取该章节可用的地点
    const availableLocations = script.locations.filter(l => l.availableFromChapter <= chapterNumber);

    return {
      ...chapter,
      availableClues,
      availableLocations
    };
  }

  /**
   * 记录剧本使用
   */
  async logUsage(scriptId, roomId) {
    await scriptDatabase.logScriptUsage(scriptId, roomId);
  }

  /**
   * 评价剧本
   */
  async rateScript(scriptId, rating, feedback) {
    await scriptDatabase.rateScript(scriptId, rating, feedback);
  }
}

export default new ScriptAdapter();
