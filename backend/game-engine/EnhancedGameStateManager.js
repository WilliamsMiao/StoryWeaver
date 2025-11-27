/**
 * 增强游戏状态管理器
 * 管理分支剧情、角色技能、游戏节奏和多结局系统
 */

import { v4 as uuidv4 } from 'uuid';
import scriptDatabase from '../script-factory/database.js';

class EnhancedGameStateManager {
  constructor() {
    // 游戏状态缓存 roomId -> GameState
    this.gameStates = new Map();
  }

  /**
   * 初始化游戏状态
   */
  async initializeGameState(roomId, scriptId, players) {
    const script = await scriptDatabase.getFullEnhancedScript(scriptId);
    if (!script) {
      throw new Error('剧本不存在');
    }

    const gameState = {
      roomId,
      scriptId,
      currentChapter: 1,
      startTime: Date.now(),
      
      // 玩家状态
      players: this.initializePlayerStates(players, script),
      
      // 剧情进度
      plotProgress: {
        discoveredClues: [],
        revealedLayers: ['surface'], // 已揭示的故事层
        activeBranches: [],
        completedBranches: [],
        triggeredEvents: [],
        currentAtmosphere: 'neutral' // neutral, tense, relaxed, shocking
      },
      
      // 技能使用记录
      skillUsage: {},
      
      // 分支选择记录
      branchChoices: [],
      
      // 结局条件跟踪
      endingConditions: {
        murdererIdentified: false,
        motiveExplained: false,
        hiddenLayerRevealed: false,
        allCluesFound: false
      },
      
      // 互动记录
      interactions: [],
      
      // 凶手玩家ID
      murdererPlayerId: null
    };

    // 找出凶手玩家
    const murdererCharacter = script.characters?.find(c => c.is_murderer);
    if (murdererCharacter) {
      const murdererPlayer = gameState.players.find(p => p.characterId === murdererCharacter.id);
      if (murdererPlayer) {
        gameState.murdererPlayerId = murdererPlayer.id;
      }
    }

    this.gameStates.set(roomId, gameState);
    return gameState;
  }

  /**
   * 初始化玩家状态
   */
  initializePlayerStates(players, script) {
    const characters = script.characters || [];
    const skills = script.skills || [];
    
    return players.map((player, index) => {
      const character = characters[index % characters.length];
      const characterSkills = skills.filter(s => s.character_id === character?.id);
      
      return {
        id: player.id || player.playerId,
        username: player.username,
        characterId: character?.id,
        characterName: character?.name,
        isMurderer: character?.is_murderer || false,
        
        // 技能状态
        skills: characterSkills.map(s => ({
          id: s.id,
          name: s.skill_name,
          type: s.skill_type,
          description: s.skill_description,
          maxUses: s.max_uses,
          remainingUses: s.max_uses,
          cooldownChapters: s.cooldown_chapters,
          lastUsedChapter: 0,
          isAvailable: true
        })),
        
        // 已发现线索
        discoveredClues: [],
        
        // 情感状态
        emotionalState: character?.emotional_start_state || 'normal',
        
        // 私密信息访问权限
        accessibleSecrets: [character?.secret_info].filter(Boolean)
      };
    });
  }

  /**
   * 获取游戏状态
   */
  getGameState(roomId) {
    return this.gameStates.get(roomId);
  }

  /**
   * 使用技能
   */
  async useSkill(roomId, playerId, skillId, targetInfo = {}) {
    const gameState = this.getGameState(roomId);
    if (!gameState) {
      return { success: false, error: '游戏状态不存在' };
    }

    const player = gameState.players.find(p => p.id === playerId);
    if (!player) {
      return { success: false, error: '玩家不存在' };
    }

    const skill = player.skills.find(s => s.id === skillId);
    if (!skill) {
      return { success: false, error: '技能不存在' };
    }

    // 检查技能是否可用
    if (skill.remainingUses <= 0) {
      return { success: false, error: '技能使用次数已耗尽' };
    }

    if (!skill.isAvailable) {
      const cooldownRemaining = skill.lastUsedChapter + skill.cooldownChapters - gameState.currentChapter;
      return { success: false, error: `技能冷却中，还需${cooldownRemaining}章` };
    }

    // 执行技能效果
    const result = await this.executeSkillEffect(gameState, player, skill, targetInfo);
    
    // 更新技能状态
    skill.remainingUses--;
    skill.lastUsedChapter = gameState.currentChapter;
    skill.isAvailable = false;

    // 记录技能使用
    if (!gameState.skillUsage[playerId]) {
      gameState.skillUsage[playerId] = [];
    }
    gameState.skillUsage[playerId].push({
      skillId,
      skillName: skill.name,
      chapter: gameState.currentChapter,
      timestamp: Date.now(),
      target: targetInfo,
      result: result.effect
    });

    return {
      success: true,
      skillName: skill.name,
      effect: result.effect,
      message: result.message
    };
  }

  /**
   * 执行技能效果
   */
  async executeSkillEffect(gameState, player, skill, targetInfo) {
    const script = await scriptDatabase.getFullEnhancedScript(gameState.scriptId);
    
    switch (skill.type) {
      case 'investigation':
        // 侦探直觉 - 获取关于某人的隐藏信息
        if (targetInfo.targetCharacterId) {
          const targetChar = script.characters?.find(c => c.id === targetInfo.targetCharacterId);
          const targetPersona = script.npcPersonas?.find(p => p.character_id === targetInfo.targetCharacterId);
          const revealableInfo = targetPersona?.revealable_info?.[0] || targetChar?.secret_info?.substring(0, 50);
          
          return {
            effect: 'reveal_info',
            message: `你的直觉告诉你，关于${targetChar?.name}：${revealableInfo || '此人似乎有所隐瞒...'}`,
            data: { revealedInfo: revealableInfo }
          };
        }
        break;

      case 'information':
        // 信息入侵 - 获取额外线索
        const unrevealedClues = script.clues?.filter(c => 
          !gameState.plotProgress.discoveredClues.includes(c.id) &&
          c.reveal_chapter <= gameState.currentChapter
        );
        if (unrevealedClues?.length > 0) {
          const clue = unrevealedClues[Math.floor(Math.random() * unrevealedClues.length)];
          gameState.plotProgress.discoveredClues.push(clue.id);
          player.discoveredClues.push(clue.id);
          
          return {
            effect: 'get_clue',
            message: `你发现了一条新线索：【${clue.clue_name}】${clue.clue_content}`,
            data: { clue }
          };
        }
        return {
          effect: 'no_clue',
          message: '没有发现新的线索...'
        };

      case 'deduction':
        // 微表情分析 - 判断发言真假
        return {
          effect: 'analyze',
          message: `你仔细观察了对方的表情和肢体语言...${Math.random() > 0.5 ? '对方似乎在隐瞒什么。' : '对方看起来很坦诚。'}`,
          data: { suspicionLevel: Math.random() > 0.5 ? 'high' : 'low' }
        };

      case 'social':
        // 社交达人 - 与NPC获得额外信息
        return {
          effect: 'social_bonus',
          message: '你的社交魅力让对方更愿意与你交谈，可能会透露更多信息。',
          data: { bonus: true }
        };

      default:
        return {
          effect: 'unknown',
          message: '技能生效了，但效果不明显...'
        };
    }

    return { effect: 'none', message: '技能没有产生效果' };
  }

  /**
   * 检查并触发分支剧情
   */
  async checkBranchTriggers(roomId, playerAction) {
    const gameState = this.getGameState(roomId);
    if (!gameState) return null;

    const script = await scriptDatabase.getFullEnhancedScript(gameState.scriptId);
    const branches = script.plotBranches || [];
    const triggeredBranches = [];

    for (const branch of branches) {
      if (gameState.plotProgress.completedBranches.includes(branch.id)) {
        continue;
      }
      if (branch.branch_point_chapter > gameState.currentChapter) {
        continue;
      }

      const triggered = this.evaluateBranchCondition(
        branch.condition_type,
        branch.condition_value,
        gameState,
        playerAction
      );

      if (triggered) {
        gameState.plotProgress.activeBranches.push(branch.id);
        triggeredBranches.push({
          branchId: branch.id,
          branchName: branch.branch_name,
          outcome: branch.branch_outcome,
          leadsToEnding: branch.leads_to_ending
        });

        // 应用分支效果
        if (branch.new_clues?.length > 0) {
          gameState.plotProgress.discoveredClues.push(...branch.new_clues);
        }
      }
    }

    return triggeredBranches.length > 0 ? triggeredBranches : null;
  }

  /**
   * 评估分支条件
   */
  evaluateBranchCondition(conditionType, conditionValue, gameState, playerAction) {
    switch (conditionType) {
      case 'clue_found':
        const clueCount = gameState.plotProgress.discoveredClues.length;
        return clueCount >= (conditionValue.count || 1);

      case 'interaction_complete':
        // 检查是否与所有嫌疑人交谈
        if (conditionValue.targetType === 'suspects') {
          const interactedPlayers = new Set(gameState.interactions.map(i => i.targetId));
          const requiredPercentage = conditionValue.percentage || 100;
          const actualPercentage = (interactedPlayers.size / gameState.players.length) * 100;
          return actualPercentage >= requiredPercentage;
        }
        break;

      case 'accusation':
        return playerAction?.type === 'accusation';

      case 'chapter_progress':
        return gameState.currentChapter >= (conditionValue.chapter || 1);

      case 'skill_used':
        const skillUsed = Object.values(gameState.skillUsage).flat()
          .some(u => u.skillType === conditionValue.skillType);
        return skillUsed;

      default:
        return false;
    }

    return false;
  }

  /**
   * 推进章节
   */
  async advanceChapter(roomId) {
    const gameState = this.getGameState(roomId);
    if (!gameState) return null;

    const script = await scriptDatabase.getFullEnhancedScript(gameState.scriptId);
    const maxChapters = script.chapters?.length || 3;

    if (gameState.currentChapter >= maxChapters) {
      return { canAdvance: false, reason: '已是最后一章' };
    }

    // 检查章节推进条件
    const currentChapterData = script.chapters?.find(c => c.chapter_number === gameState.currentChapter);
    const successCondition = currentChapterData?.success_condition;

    // 简单检查（可以扩展为更复杂的条件）
    const canAdvance = gameState.plotProgress.discoveredClues.length > 0;

    if (!canAdvance) {
      return { canAdvance: false, reason: '需要先完成本章目标' };
    }

    gameState.currentChapter++;

    // 更新技能冷却
    gameState.players.forEach(player => {
      player.skills.forEach(skill => {
        if (!skill.isAvailable && 
            gameState.currentChapter >= skill.lastUsedChapter + skill.cooldownChapters) {
          skill.isAvailable = true;
        }
      });
    });

    // 检查是否揭示新的故事层
    const layersToReveal = script.storyLayers?.filter(l => 
      l.reveal_chapter === gameState.currentChapter &&
      !gameState.plotProgress.revealedLayers.includes(l.layer_type)
    );
    
    if (layersToReveal?.length > 0) {
      layersToReveal.forEach(l => {
        gameState.plotProgress.revealedLayers.push(l.layer_type);
      });
    }

    // 完成当前活跃的分支
    gameState.plotProgress.activeBranches.forEach(branchId => {
      if (!gameState.plotProgress.completedBranches.includes(branchId)) {
        gameState.plotProgress.completedBranches.push(branchId);
      }
    });
    gameState.plotProgress.activeBranches = [];

    return {
      canAdvance: true,
      newChapter: gameState.currentChapter,
      revealedLayers: layersToReveal?.map(l => l.layer_title) || [],
      chapterTitle: script.chapters?.find(c => c.chapter_number === gameState.currentChapter)?.title
    };
  }

  /**
   * 发现线索
   */
  discoverClue(roomId, playerId, clueId) {
    const gameState = this.getGameState(roomId);
    if (!gameState) return false;

    if (!gameState.plotProgress.discoveredClues.includes(clueId)) {
      gameState.plotProgress.discoveredClues.push(clueId);
    }

    const player = gameState.players.find(p => p.id === playerId);
    if (player && !player.discoveredClues.includes(clueId)) {
      player.discoveredClues.push(clueId);
    }

    return true;
  }

  /**
   * 记录指控
   */
  recordAccusation(roomId, accuserId, accusedCharacterId, motive) {
    const gameState = this.getGameState(roomId);
    if (!gameState) return null;

    gameState.branchChoices.push({
      type: 'accusation',
      accuserId,
      accusedCharacterId,
      motive,
      chapter: gameState.currentChapter,
      timestamp: Date.now()
    });

    return true;
  }

  /**
   * 确定最终结局
   */
  async determineEnding(roomId, finalAccusation) {
    const gameState = this.getGameState(roomId);
    if (!gameState) return null;

    const script = await scriptDatabase.getFullEnhancedScript(gameState.scriptId);
    const endings = script.endings || [];
    const murdererCharacter = script.characters?.find(c => c.is_murderer);
    const truth = script.truth;

    // 更新结局条件
    gameState.endingConditions.murdererIdentified = 
      finalAccusation.accusedCharacterId === murdererCharacter?.id;
    
    gameState.endingConditions.motiveExplained = 
      finalAccusation.motive && 
      this.checkMotiveMatch(finalAccusation.motive, truth?.murder_motive);

    gameState.endingConditions.hiddenLayerRevealed = 
      gameState.plotProgress.revealedLayers.includes('core');

    gameState.endingConditions.allCluesFound = 
      gameState.plotProgress.discoveredClues.length >= (script.clues?.length * 0.8 || 5);

    // 匹配结局
    let matchedEnding = null;
    let highestScore = -1;

    for (const ending of endings) {
      const conditions = ending.required_conditions;
      let score = 0;
      let allMet = true;

      for (const [key, required] of Object.entries(conditions)) {
        if (gameState.endingConditions[key] === required) {
          score += ending.bonus_score || 10;
        } else if (required === true) {
          allMet = false;
        }
      }

      if (allMet && score > highestScore) {
        highestScore = score;
        matchedEnding = ending;
      }
    }

    // 如果没有匹配的结局，使用默认的坏结局
    if (!matchedEnding) {
      matchedEnding = endings.find(e => e.ending_type === 'bad') || {
        ending_name: '真相迷雾',
        ending_type: 'bad',
        ending_narration: '凶手成功逃脱了法网，真相被永远埋藏...',
        bonus_score: 0
      };
    }

    return {
      ending: matchedEnding,
      conditions: gameState.endingConditions,
      totalScore: highestScore,
      isCorrect: gameState.endingConditions.murdererIdentified
    };
  }

  /**
   * 检查动机是否匹配
   */
  checkMotiveMatch(playerMotive, trueMotive) {
    if (!playerMotive || !trueMotive) return false;
    
    const playerKeywords = playerMotive.toLowerCase().split(/[，。、\s]+/);
    const trueKeywords = trueMotive.toLowerCase().split(/[，。、\s]+/);
    
    let matchCount = 0;
    for (const pk of playerKeywords) {
      if (pk.length >= 2 && trueKeywords.some(tk => tk.includes(pk) || pk.includes(tk))) {
        matchCount++;
      }
    }
    
    return matchCount >= 2;
  }

  /**
   * 更新氛围
   */
  updateAtmosphere(roomId, newAtmosphere) {
    const gameState = this.getGameState(roomId);
    if (gameState) {
      gameState.plotProgress.currentAtmosphere = newAtmosphere;
    }
  }

  /**
   * 获取凶手引导
   */
  async getMurdererGuidance(roomId) {
    const gameState = this.getGameState(roomId);
    if (!gameState || !gameState.murdererPlayerId) return null;

    const guide = await scriptDatabase.getMurdererGuide(gameState.scriptId, gameState.currentChapter);
    if (!guide || guide.length === 0) return null;

    const chapterGuide = guide[0];
    
    // 根据当前局势动态调整建议
    const accusationsAgainstMurderer = gameState.branchChoices.filter(c => 
      c.type === 'accusation' && 
      gameState.players.find(p => p.id === gameState.murdererPlayerId)?.characterId === c.accusedCharacterId
    ).length;

    const urgencyLevel = accusationsAgainstMurderer > 0 ? 'high' : 'normal';

    return {
      chapter: gameState.currentChapter,
      urgencyLevel,
      tips: {
        strategy: chapterGuide.strategy_tips?.slice(0, 3) || [],
        speech: chapterGuide.speech_suggestions?.slice(0, 2) || [],
        interference: chapterGuide.interference_options?.slice(0, 2) || [],
        scapegoat: chapterGuide.scapegoat_strategies?.slice(0, 2) || [],
        counterDetection: urgencyLevel === 'high' ? chapterGuide.counter_detection_tips : [],
        danger: chapterGuide.danger_signals?.slice(0, 3) || [],
        safe: chapterGuide.safe_topics?.slice(0, 3) || []
      },
      warnings: accusationsAgainstMurderer > 0 ? ['有人开始怀疑你了，要更加小心！'] : []
    };
  }

  /**
   * 获取玩家可用技能
   */
  getPlayerSkills(roomId, playerId) {
    const gameState = this.getGameState(roomId);
    if (!gameState) return [];

    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return [];

    return player.skills.map(skill => ({
      ...skill,
      canUse: skill.remainingUses > 0 && skill.isAvailable
    }));
  }

  /**
   * 获取游戏进度摘要
   */
  getProgressSummary(roomId) {
    const gameState = this.getGameState(roomId);
    if (!gameState) return null;

    return {
      currentChapter: gameState.currentChapter,
      discoveredClues: gameState.plotProgress.discoveredClues.length,
      revealedLayers: gameState.plotProgress.revealedLayers,
      completedBranches: gameState.plotProgress.completedBranches.length,
      triggeredEvents: gameState.plotProgress.triggeredEvents.length,
      atmosphere: gameState.plotProgress.currentAtmosphere,
      playerProgress: gameState.players.map(p => ({
        username: p.username,
        characterName: p.characterName,
        cluesFound: p.discoveredClues.length,
        skillsRemaining: p.skills.reduce((sum, s) => sum + s.remainingUses, 0)
      }))
    };
  }

  /**
   * 清理游戏状态
   */
  clearGameState(roomId) {
    this.gameStates.delete(roomId);
  }
}

// 单例导出
const enhancedGameStateManager = new EnhancedGameStateManager();
export default enhancedGameStateManager;
export { EnhancedGameStateManager };
