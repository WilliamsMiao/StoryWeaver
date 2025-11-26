import { v4 as uuidv4 } from 'uuid';
import { GameRoom } from './models/GameRoom.js';
import { GameStory } from './models/GameStory.js';
import { Player } from './models/Player.js';
import AIService from '../ai-service/AIService.js';
import database from '../storage/database.js';
import { createChapterManager } from './chapters/index.js';
import { createMemorySystem } from '../ai-service/memory/index.js';
import {
  getChapterTriggerOptions,
  getFeedbackSystemConfig,
  getStoryGenerationTriggers
} from '../config/gameConfig.js';

const EMPTY_ROOM_GRACE_PERIOD_MS = 5 * 60 * 1000;

/**
 * 游戏引擎
 * 管理房间生命周期、玩家状态、故事进度和AI集成
 */
class GameEngine {
  constructor() {
    this.rooms = new Map(); // 内存中的房间缓存
    this.chapterManagers = new Map(); // storyId -> chapterManager
    this.memorySystems = new Map(); // storyId -> memorySystem
    this.playerStates = new Map(); // playerId -> { lastActive, online }
    this.emptyRoomTimers = new Map(); // roomId -> { timeout, expiresAt }
    this.emptyRoomGracePeriodMs = EMPTY_ROOM_GRACE_PERIOD_MS;
  }
  
  // 生成5位数字房间ID
  async generateRoomId() {
    const maxAttempts = 100; // 最多尝试100次
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      // 生成5位数字ID (10000-99999)
      const roomId = String(Math.floor(Math.random() * 90000) + 10000);
      
      // 检查内存中是否已存在
      if (!this.rooms.has(roomId)) {
        // 检查数据库中是否已存在
        const existingRoom = await database.getRoom(roomId);
        if (!existingRoom) {
          return roomId;
        }
      }
      
      attempts++;
    }
    
    // 如果100次都失败，使用时间戳+随机数作为后备方案
    console.warn('生成5位数字房间ID失败，使用备用方案');
    return String(Date.now()).slice(-5) + String(Math.floor(Math.random() * 10));
  }
  
  // 创建房间
  async createRoom(name, hostId, hostUsername) {
    const roomId = await this.generateRoomId();
    
    // 确保玩家存在
    let player = await database.getPlayer(hostId);
    if (!player) {
      await database.createPlayer(hostId, hostUsername);
    }
    
    // 创建房间记录
    await database.createRoom(roomId, name, hostId);
    await database.addPlayerToRoom(roomId, hostId, 'host');
    
    // 创建内存中的房间对象
    const room = new GameRoom({
      id: roomId,
      name,
      hostId,
      status: 'waiting'
    });
    
    const hostPlayer = new Player({
      id: hostId,
      username: hostUsername,
      role: 'host'
    });
    room.addPlayer(hostPlayer);
    
    this.rooms.set(roomId, room);
    this.cancelEmptyRoomCleanup(roomId);
    
    return room;
  }
  
  // 加入房间
  async joinRoom(roomId, playerId, username) {
    const room = this.rooms.get(roomId);
    if (!room) {
      // 尝试从数据库加载
      const roomData = await database.getRoom(roomId);
      if (!roomData) {
        throw new Error('房间不存在');
      }
      
      const newRoom = new GameRoom({
        id: roomData.id,
        name: roomData.name,
        hostId: roomData.host_id,
        status: roomData.status
      });
      
      // 加载玩家
      const players = await database.getRoomPlayers(roomId);
      players.forEach(p => {
        newRoom.addPlayer(new Player({
          id: p.id,
          username: p.username,
          role: p.role
        }));
      });
      
      // 加载故事
      const storyData = await database.getStory(roomId);
      if (storyData) {
        const chapters = await database.getChapters(storyData.id);
        const memories = await database.getMemories(storyData.id);
        const interactions = await database.getInteractions(storyData.id, 50);
        
        newRoom.setStory(new GameStory({
          id: storyData.id,
          roomId: storyData.room_id,
          title: storyData.title,
          background: storyData.background,
          chapters: chapters.map(c => ({
            id: c.id,
            chapterNumber: c.chapter_number,
            content: c.content,
            summary: c.summary,
            authorId: c.author_id,
            createdAt: c.created_at
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
            timestamp: i.created_at
          }))
        }));
      }
      
      this.rooms.set(roomId, newRoom);
      return await this.joinRoom(roomId, playerId, username);
    }
    
    // 检查玩家是否已在房间中
    if (room.getPlayer(playerId)) {
      return room;
    }
    
    // 确保玩家存在
    let player = await database.getPlayer(playerId);
    if (!player) {
      await database.createPlayer(playerId, username);
    }
    
    // 添加到数据库
    await database.addPlayerToRoom(roomId, playerId, 'player');
    
    // 添加到内存房间
    const newPlayer = new Player({
      id: playerId,
      username,
      role: 'player'
    });
    room.addPlayer(newPlayer);
    this.cancelEmptyRoomCleanup(roomId);
    
    return room;
  }
  
  // 初始化故事
  async initializeStory(roomId, title, background) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('房间不存在');
    }
    await AIService.ensureProviderAvailability({ force: true });
    
    if (room.story) {
      const hasContent = room.story.chapters && room.story.chapters.length > 0;
      if (!hasContent) {
        console.warn(`检测到房间 ${roomId} 存在未完成的故事，正在重置...`);
        await this.cleanupStoryResources(roomId, room.story.id);
      } else {
        throw new Error('故事已经初始化');
      }
    }
    
    const storyId = uuidv4();
    let story;
    
    try {
      // 初始化章节管理系统（优先确保配置有效）
      const chapterTriggerOptions = getChapterTriggerOptions();
      const chapterManager = createChapterManager(storyId, {
        trigger: chapterTriggerOptions
      });
      this.chapterManagers.set(storyId, chapterManager);
      
      // 初始化记忆系统
      const memorySystem = createMemorySystem(storyId);
      await memorySystem.loadAllMemories();
      this.memorySystems.set(storyId, memorySystem);
      
      // 创建故事记录
      await database.createStory(storyId, roomId, title, background);
      
      // 创建内存中的故事对象
      story = new GameStory({
        id: storyId,
        roomId,
        title,
        background
      });
      
      room.setStory(story);
      room.updateStatus('playing');
      await database.updateRoomStatus(roomId, 'playing');
      
      // 生成初始章节并启动故事机互动
      try {
        const firstChapter = await this.generateFirstChapter(story, title, background);
        const interactionResult = await this.initiateStoryMachineInteraction(roomId, firstChapter.id, story);
        
        return {
          room,
          story,
          firstChapter,
          interactionResult
        };
      } catch (error) {
        console.error('生成初始章节失败:', error);
        return {
          room,
          story,
          firstChapter: null,
          interactionResult: null
        };
      }
    } catch (error) {
      console.error('初始化故事失败，开始回滚:', error);
      await this.cleanupStoryResources(roomId, storyId);
      throw error;
    }
  }
  
  /**
   * 清理未完成的故事资源
   */
  async cleanupStoryResources(roomId, storyId) {
    if (storyId) {
      this.chapterManagers.delete(storyId);
      this.memorySystems.delete(storyId);
      try {
        await database.deleteStory(storyId);
      } catch (error) {
        console.error('清理故事数据失败:', error);
      }
    }
    const room = this.rooms.get(roomId);
    if (room) {
      room.story = null;
      room.updateStatus('waiting');
    }
    try {
      await database.updateRoomStatus(roomId, 'waiting');
    } catch (error) {
      console.error('重置房间状态失败:', error);
    }
  }

  /**
   * 生成第一个章节（增强版 - 包含角色和线索卡片）
   */
  async generateFirstChapter(story, title, background) {
    const AIService = (await import('../ai-service/AIService.js')).default;
    const database = (await import('../storage/database.js')).default;
    const { v4: uuidv4 } = await import('uuid');
    
    // 获取房间内的玩家
    const room = this.rooms.get(story.roomId);
    const players = room ? Array.from(room.players.values()).map(p => ({
      id: p.id,
      username: p.username
    })) : [];
    
    console.log(`[生成首章] 开始生成，玩家数: ${players.length}`);
    
    // 1. 首先为玩家生成角色设定
    let playerRoles = [];
    if (players.length > 0) {
      try {
        playerRoles = await AIService.generatePlayerRoles(players, { title, background });
        console.log(`[生成首章] 玩家角色生成完成:`, playerRoles.map(r => r.characterName));
        
        // 保存玩家角色到数据库
        for (const role of playerRoles) {
          // 创建玩家对应的角色
          const characterId = uuidv4();
          await database.createCharacter({
            id: characterId,
            storyId: story.id,
            name: role.characterName,
            characterType: 'player',
            playerId: role.playerId,
            occupation: role.occupation,
            personality: role.personality,
            background: role.secretInfo,
            secret: role.secretInfo,
            firstAppearanceChapter: 1
          });
          
          // 分配角色给玩家
          await database.assignPlayerRole({
            id: uuidv4(),
            storyId: story.id,
            playerId: role.playerId,
            characterId: characterId,
            roleType: role.roleType,
            specialAbility: role.specialAbility,
            personalGoal: role.personalGoal,
            secretInfo: role.secretInfo
          });
        }
      } catch (error) {
        console.error('[生成首章] 玩家角色生成失败:', error);
        playerRoles = AIService.generateDefaultPlayerRoles(players);
      }
    }
    
    // 2. 生成增强版章节（包含NPC角色和线索卡片）
    let chapterResult;
    try {
      chapterResult = await AIService.generateEnhancedChapter(
        { title, background, currentChapter: 1, chapters: [] },
        `【剧本杀游戏 - 第一章开篇】

为故事"${title}"创作第一章开头。

## 玩家角色：
${playerRoles.map(r => `- ${r.characterName}（${r.occupation}）: ${r.personalGoal}`).join('\n')}

## 创作要求：
1. 设置一个引人入胜的谜团或案件
2. 创建2-3个NPC角色（如管家、嫌疑人等）
3. 将所有玩家自然地写入剧情，给他们具体的行动
4. 埋入可发现的线索
5. 结尾留下悬念

背景：${background}`,
        players,
        [],
        []
      );
    } catch (error) {
      console.error('[生成首章] 增强章节生成失败，使用基础版:', error);
      // 回退到基础版生成
      const basicContent = await AIService.generateStoryResponse(
        { title, background, currentChapter: 0, chapters: [], memories: [] },
        `【剧本杀游戏 - 第一章开篇】创作故事"${title}"的开头。背景：${background}。要求：设置悬疑事件，创建NPC角色用[NPC:名称]标记，将玩家${players.map(p=>p.username).join('、')}写入剧情用[玩家:名称]标记。`
      );
      chapterResult = {
        chapterContent: basicContent.content,
        newCharacters: [],
        clueCards: [],
        playerRoles: []
      };
    }
    
    // 3. 保存章节
    const chapterId = uuidv4();
    const chapterNumber = 1;
    await database.createChapter(
      chapterId,
      story.id,
      chapterNumber,
      chapterResult.chapterContent,
      null,
      null
    );
    
    // 4. 保存NPC角色
    const savedCharacters = [];
    if (chapterResult.newCharacters && chapterResult.newCharacters.length > 0) {
      for (const npc of chapterResult.newCharacters) {
        const characterId = uuidv4();
        await database.createCharacter({
          id: characterId,
          storyId: story.id,
          name: npc.name,
          characterType: npc.type || 'npc',
          age: npc.age,
          occupation: npc.occupation,
          personality: npc.personality,
          background: npc.background,
          secret: npc.secret,
          firstAppearanceChapter: 1,
          isSuspect: npc.isSuspect ? 1 : 0,
          suspicionLevel: npc.suspicionLevel || 0
        });
        savedCharacters.push({ id: characterId, ...npc });
        console.log(`[生成首章] 保存NPC: ${npc.name}`);
      }
    }
    
    // 5. 保存线索卡片
    if (chapterResult.clueCards && chapterResult.clueCards.length > 0) {
      for (const clue of chapterResult.clueCards) {
        // 找到关联的角色
        let characterId = null;
        if (clue.characterName) {
          const char = savedCharacters.find(c => c.name === clue.characterName);
          if (char) {
            characterId = char.id;
          } else {
            // 查找数据库中的角色
            const dbChar = await database.findCharacterByName(story.id, clue.characterName);
            if (dbChar) characterId = dbChar.id;
          }
        }
        
        if (characterId) {
          await database.createCharacterClueCard({
            id: uuidv4(),
            characterId: characterId,
            chapterId: chapterId,
            storyId: story.id,
            clueCategory: clue.category,
            clueTitle: clue.title,
            clueContent: clue.content,
            clueImportance: clue.importance || 1,
            isHidden: clue.isHidden ? 1 : 0
          });
          console.log(`[生成首章] 保存线索: ${clue.title} -> ${clue.characterName}`);
        }
      }
    }
    
    // 6. 为每个NPC生成额外的线索卡片
    for (const char of savedCharacters) {
      try {
        const extraClues = await AIService.generateCharacterClueCards(
          char,
          { title, background },
          1
        );
        for (const clue of extraClues) {
          await database.createCharacterClueCard({
            id: uuidv4(),
            characterId: char.id,
            chapterId: chapterId,
            storyId: story.id,
            clueCategory: clue.category,
            clueTitle: clue.title,
            clueContent: clue.content,
            clueImportance: clue.importance || 1,
            isHidden: clue.isHidden ? 1 : 0,
            discoveryCondition: clue.discoveryCondition
          });
        }
        console.log(`[生成首章] 为 ${char.name} 生成 ${extraClues.length} 条额外线索`);
      } catch (error) {
        console.error(`[生成首章] 生成角色 ${char.name} 的线索失败:`, error);
      }
    }
    
    const chapter = {
      id: chapterId,
      chapterNumber,
      content: chapterResult.chapterContent,
      createdAt: new Date(),
      summary: null,
      characters: savedCharacters,
      playerRoles: playerRoles
    };
    
    story.addChapter(chapter);
    
    console.log(`[生成首章] 完成! 角色数: ${savedCharacters.length}, 线索数: ${chapterResult.clueCards?.length || 0}`);
    
    return chapter;
  }
  
  // 处理玩家消息并生成故事
  async processMessage(roomId, playerId, message, messageType = 'global', recipientId = null, recipientName = null) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('房间不存在');
    }
    
    if (!room.story) {
      throw new Error('故事尚未初始化');
    }
    
    const player = room.getPlayer(playerId);
    if (!player) {
      throw new Error('玩家不在房间中');
    }
    
    // 更新玩家状态
    this.syncPlayerState(playerId, true);
    
    // 确定消息可见性
    let visibility = 'global';
    if (messageType === 'private') {
      visibility = 'private';
    } else if (messageType === 'player_to_player') {
      visibility = 'direct';
    }
    
    // 创建消息ID
    const messageId = uuidv4();
    
    // 创建并保存消息到数据库
    const messageData = {
      id: messageId,
      roomId: roomId,
      storyId: room.story.id,
      senderId: playerId,
      senderName: player.username,
      recipientId: recipientId || null,
      recipientName: recipientName || null,
      messageType: messageType,
      visibility: visibility,
      content: message,
      chapterNumber: null
    };
    
    await database.createMessage(messageData);
    
    // 创建消息对象（用于返回和广播）
    const createdMessage = {
      id: messageId,
      type: messageType,
      visibility: visibility,
      senderId: playerId,
      sender: player.username,
      recipientId: recipientId || null,
      recipientName: recipientName || null,
      content: message,
      timestamp: new Date(),
      roomId: roomId,
      storyId: room.story.id,
      isPrivate: visibility === 'private'
    };
    
    // 获取记忆系统
    const memorySystem = this.memorySystems.get(room.story.id);
    if (!memorySystem) {
      // 如果记忆系统不存在，创建它
      const newMemorySystem = createMemorySystem(room.story.id);
      await newMemorySystem.loadAllMemories();
      this.memorySystems.set(room.story.id, newMemorySystem);
    }
    
    // 获取所有消息（包括私密和玩家间消息）用于AI上下文
    const allMessages = await database.getAllMessagesForAI(room.story.id);
    
    // 获取相关记忆用于AI上下文
    const relevantMemories = await memorySystem.getRelevantMemories(message, {
      shortTermLimit: 10,
      chapterLimit: 5,
      longTermLimit: 15
    });
    
    // 准备完整的AI上下文（包含所有类型的消息）
    const context = {
      title: room.story.title,
      background: room.story.background,
      currentChapter: room.story.chapters.length,
      chapters: room.story.chapters,
      memories: room.story.memories,
      interactions: room.story.interactions,
      players: room.getPlayersList().map(p => ({
        id: p.id,
        username: p.username,
        role: p.role
      })),
      // 添加记忆系统提供的上下文
      shortTermMemories: relevantMemories.shortTerm || [],
      chapterMemories: relevantMemories.chapters || [],
      longTermMemories: relevantMemories.keyEvents || [],
      // 添加所有消息（包括私密和玩家间消息，作为隐秘故事线）
      allMessages: allMessages.map(msg => ({
        type: msg.message_type,
        visibility: msg.visibility,
        sender: msg.sender_name,
        recipient: msg.recipient_name,
        content: msg.content,
        timestamp: msg.created_at
      }))
    };
    
    // 根据消息类型处理AI响应
    let aiResponse = null;
    let chapter = null;
    let storyMachineResponse = null;
    
    if (messageType === 'global') {
      // 全局消息：智能触发AI故事生成
      // 触发条件：
      // 1. 章节内首次消息
      // 2. 累积达到一定消息数（如3条）
      // 3. 包含关键动作词
      
      const currentChapter = this.getCurrentChapter(room.story);
      const shouldGenerateStory = await this.shouldTriggerStoryGeneration(
        roomId, 
        room.story.id, 
        message,
        currentChapter
      );
      
      if (shouldGenerateStory) {
        // 调用AI服务生成故事内容
        aiResponse = await AIService.generateStoryResponse(context, message);
        
        // 使用记忆系统添加完整交互（包含AI响应）
        const interaction = await memorySystem.addInteraction(
          message,
          aiResponse.content,
          playerId,
          player.username
        );
        
        // 创建或更新章节内容
        const chapterId = uuidv4();
        const chapterNumber = currentChapter 
          ? currentChapter.chapterNumber 
          : room.story.chapters.length + 1;
        
        if (currentChapter) {
          // 追加到当前章节
          currentChapter.content += '\n\n---\n\n' + aiResponse.content;
          currentChapter.wordCount = (currentChapter.wordCount || 0) + aiResponse.content.length;
          
          // 更新数据库
          await database.updateChapter(currentChapter.id, {
            content: currentChapter.content
          });
          chapter = currentChapter;
        } else {
          // 创建新章节
          chapter = {
            id: chapterId,
            storyId: room.story.id,
            chapterNumber,
            content: aiResponse.content,
            summary: null,
            authorId: playerId,
            authorName: player.username,
            createdAt: new Date(),
            wordCount: aiResponse.content.length,
            status: 'active'
          };
          
          await database.createChapter(
            chapterId,
            room.story.id,
            chapterNumber,
            aiResponse.content,
            playerId,
            null
          );
          
          room.story.addChapter(chapter);
        }
        
        // 更新消息的章节号
        await database.db.run(
          'UPDATE messages SET chapter_number = ? WHERE id = ?',
          [chapterNumber, messageId]
        );
        
        // 添加交互记录到内存
        room.story.addInteraction({
          id: interaction.id,
          playerId,
          playerName: player.username,
          input: message,
          response: aiResponse.content,
          timestamp: new Date()
        });
        
        // 异步生成章节摘要
        const targetChapterId = currentChapter ? currentChapter.id : chapterId;
        this.generateChapterSummary(room.story.id, targetChapterId, chapter.content).catch(err => {
          console.error('生成章节摘要失败:', err);
        });
        
        // 更新故事更新时间
        await database.updateStory(room.story.id, {
          updated_at: new Date().toISOString()
        });
        
        return {
          message: createdMessage,
          chapter: chapter,
          memories: [],
          aiModel: aiResponse.model,
          chapterTransition: null
        };
      } else {
        // 不触发生成，只记录消息
        return {
          message: createdMessage,
          chapter: null,
          memories: [],
          aiModel: null,
          chapterTransition: null
        };
      }
      
    } else if (messageType === 'private') {
      // 故事机模式：智能交互系统
      console.log(`[私聊消息处理] 开始处理私聊消息，玩家ID: ${playerId}, 房间ID: ${roomId}`);
      
      // 获取当前章节
      const currentChapter = this.getCurrentChapter(room.story);
      if (!currentChapter) {
        console.error(`[私聊消息处理] 错误: 没有当前章节，房间ID: ${roomId}`);
        throw new Error('没有当前章节');
      }
      console.log(`[私聊消息处理] 当前章节: ${currentChapter.chapterNumber}, 章节ID: ${currentChapter.id}`);
      
      // 获取玩家的线索和谜题状态
      const playerClues = await database.getPlayerClues(currentChapter.id, playerId);
      const revealedClues = await database.getRevealedClues(currentChapter.id, playerId);
      const puzzle = await database.getChapterPuzzle(currentChapter.id);
      let puzzleProgress = null;
      if (puzzle) {
        puzzleProgress = await database.getPlayerPuzzleProgress(puzzle.id, playerId);
      }
      
      // 检查玩家是否在尝试解谜
      const intent = AIService.analyzePlayerIntent(message);
      let puzzleValidation = null;
      
      if (intent.type === 'answer_puzzle' && puzzle && !puzzleProgress?.is_solved) {
        // 验证谜题答案
        puzzleValidation = await AIService.validatePuzzleAnswer(message, puzzle);
        
        // 更新玩家解谜进度
        await database.updatePlayerPuzzleProgress({
          puzzleId: puzzle.id,
          playerId: playerId,
          lastAnswer: message,
          isSolved: puzzleValidation.isCorrect,
          hintsUsed: puzzleProgress?.hints_used || 0
        });
        
        if (puzzleValidation.isCorrect) {
          console.log(`[私聊消息处理] 玩家 ${playerId} 解开了谜题！`);
        }
      }
      
      // 构建玩家状态用于智能响应
      const playerState = {
        clues: playerClues,
        revealedClues: revealedClues.map(c => c.id),
        puzzle: puzzle,
        puzzleProgress: puzzleProgress,
        puzzleValidation: puzzleValidation
      };
      
      // 调用智能故事机响应
      console.log(`[私聊消息处理] 开始调用智能AI生成响应...`);
      try {
        storyMachineResponse = await AIService.generateSmartStoryMachineResponse(
          context, 
          message, 
          playerId, 
          playerState
        );
        console.log(`[私聊消息处理] AI响应生成成功，内容长度: ${storyMachineResponse?.content?.length || 0}`);
        
        // 如果需要揭示线索，更新数据库
        if (storyMachineResponse.shouldRevealClue && storyMachineResponse.revealedClue) {
          await database.revealClue(storyMachineResponse.revealedClue.id);
          console.log(`[私聊消息处理] 已揭示线索: ${storyMachineResponse.revealedClue.id}`);
        }
      } catch (error) {
        console.error(`[私聊消息处理] AI响应生成失败:`, error.message, error.stack);
        throw error;
      }
      
      // 如果解谜正确，在响应中添加反馈
      let responseContent = storyMachineResponse.content;
      if (puzzleValidation) {
        responseContent = `${puzzleValidation.feedback}\n\n${responseContent}`;
      }
      
      // 创建故事机AI响应消息
      const storyMachineMessageId = uuidv4();
      const storyMachineMessage = {
        id: storyMachineMessageId,
        type: 'story_machine',
        visibility: 'private',
        senderId: 'ai',
        sender: '故事机',
        recipientId: playerId,
        recipientName: player.username,
        content: responseContent,
        timestamp: new Date(),
        roomId: roomId,
        storyId: room.story.id,
        isPrivate: true
      };
      
      // 保存故事机消息到数据库
      console.log(`[私聊消息处理] 保存故事机消息到数据库，消息ID: ${storyMachineMessageId}`);
      await database.createMessage({
        id: storyMachineMessageId,
        roomId: roomId,
        storyId: room.story.id,
        senderId: 'ai',
        senderName: '故事机',
        recipientId: playerId,
        recipientName: player.username,
        messageType: 'story_machine',
        visibility: 'private',
        content: responseContent,
        chapterNumber: currentChapter.chapterNumber
      });
      console.log(`[私聊消息处理] 故事机消息已保存到数据库`);
      
      // 检查是否所有玩家都解开谜题，触发章节推进
      const allSolvedResult = await database.checkAllPlayersSolvedPuzzle(currentChapter.id, roomId);
      let progressionResult = null;
      
      if (allSolvedResult.allSolved) {
        console.log(`[私聊消息处理] 所有玩家都解开了谜题，准备推进章节！`);
        progressionResult = await this.triggerChapterProgression(currentChapter.id, roomId, room.story);
      }
      
      console.log(`[私聊消息处理] 处理完成，返回结果，storyMachineMessage存在: ${!!storyMachineMessage}`);
      
      return {
        message: createdMessage,
        storyMachineMessage: storyMachineMessage,
        chapter: null,
        memories: [],
        aiModel: storyMachineResponse.model,
        chapterTransition: null,
        puzzleValidation: puzzleValidation,
        progressionResult: progressionResult
      };
      
    } else if (messageType === 'player_to_player') {
      // 玩家间私聊：AI完全只读，不回复，只记录
      // 不调用AI，消息已保存到数据库
      return {
        message: createdMessage,
        chapter: null,
        memories: [],
        aiModel: null,
        chapterTransition: null
      };
    }
    
    // 以下代码不会执行（所有分支都已return），但保留作为参考
    // 如果将来需要恢复全局消息的AI生成功能，可以取消注释
    /*
    if (messageType === 'global') {
      // 调用AI服务生成故事内容
      aiResponse = await AIService.generateStoryResponse(context, message);
      
      // 使用记忆系统添加完整交互（包含AI响应）
      const interaction = await memorySystem.addInteraction(
        message,
        aiResponse.content,
        playerId,
        player.username
      );
      
      // 获取当前章节（用于章节管理）
      const currentChapter = this.getCurrentChapter(room.story);
      
      // 创建新章节内容
      const chapterId = uuidv4();
      const chapterNumber = currentChapter 
        ? currentChapter.chapterNumber 
        : room.story.chapters.length + 1;
      
      chapter = {
        id: chapterId,
        storyId: room.story.id,
        chapterNumber,
        content: aiResponse.content,
        summary: null,
        authorId: playerId,
        authorName: player.username,
        createdAt: new Date(),
        wordCount: aiResponse.content.length,
        status: 'active'
      };
      
      // 如果当前章节存在，添加到当前章节；否则创建新章节
      if (currentChapter) {
        // 添加到当前章节
        currentChapter.content += '\n\n' + aiResponse.content;
        currentChapter.wordCount += aiResponse.content.length;
        
        // 更新数据库（只更新content，wordCount由content长度计算）
        await database.updateChapter(currentChapter.id, {
          content: currentChapter.content
        });
        chapter = currentChapter;
      } else {
        // 创建新章节
        await database.createChapter(
          chapterId,
          room.story.id,
          chapterNumber,
          aiResponse.content,
          playerId,
          null
        );
        
        room.story.addChapter(chapter);
      }
      
      // 更新消息的章节号
      await database.db.run(
        'UPDATE messages SET chapter_number = ? WHERE id = ?',
        [chapterNumber, messageId]
      );
      
      // 添加交互记录到内存
      room.story.addInteraction({
        id: interaction.id,
        playerId,
        playerName: player.username,
        input: message,
        response: aiResponse.content,
        timestamp: new Date()
      });
      
      // 检查章节过渡
      const chapterTransition = await this.checkChapterTransition(room.story, {
        lastPlayerActivity: new Date(),
        playerMessage: message
      });
      
      // 异步生成章节摘要（不阻塞响应）
      if (currentChapter) {
        this.generateChapterSummary(room.story.id, currentChapter.id, currentChapter.content).catch(err => {
          console.error('生成章节摘要失败:', err);
        });
      } else {
        this.generateChapterSummary(room.story.id, chapterId, aiResponse.content).catch(err => {
          console.error('生成章节摘要失败:', err);
        });
      }
      
      // 提取并保存记忆（使用记忆系统）
      const extractedMemories = await memorySystem.longTermMemory.extractAndSaveMemories(aiResponse.content);
      
      // 更新故事更新时间
      await database.updateStory(room.story.id, {
        updated_at: new Date().toISOString()
      });
      
      return {
        message: createdMessage,
        chapter: chapter,
        memories: extractedMemories,
        aiModel: aiResponse.model,
        chapterTransition: chapterTransition.triggered ? chapterTransition : null
      };
    */
  }
  
  /**
   * 检查并执行章节过渡
   */
  async checkChapterTransition(story, context = {}) {
    const chapterManager = this.chapterManagers.get(story.id);
    if (!chapterManager) {
      return { triggered: false, reason: '章节管理器未初始化' };
    }
    
    // 记录玩家活动
    chapterManager.trigger.recordPlayerActivity();
    
    // 检查是否应该触发章节过渡
    const result = await chapterManager.checkAndTransition(story, context);
    
    if (result.triggered) {
      // 创建新章节
      const newChapter = await chapterManager.transition.createNewChapter(
        story,
        result.newChapterOpening,
        result.randomEvent
      );
      
      // 添加到故事
      story.addChapter(newChapter);
      
      // 保存到数据库
      await database.createChapter(
        newChapter.id,
        story.id,
        newChapter.chapterNumber,
        newChapter.content,
        'system',
        null
      );
      
      // 更新章节历史
      chapterManager.history.addChapter(newChapter);
      
      // 生成TODO列表并启动故事机互动
      const room = Array.from(this.rooms.values()).find(r => r.story?.id === story.id);
      if (room) {
        const interactionResult = await this.initiateStoryMachineInteraction(room.id, newChapter.id, story);
        // 将互动结果添加到返回结果中，供server.js使用
        result.interactionResult = interactionResult;
      }
      
      return result;
    }
    
    return result;
  }
  
  /**
   * 启动故事机互动：生成谜题、玩家专属线索，并向所有玩家发送初始消息
   * @param {string} roomId - 房间ID
   * @param {string} chapterId - 章节ID
   * @param {Object} story - 故事对象
   * @returns {Promise<Object>} 包含需要发送的Socket事件数据
   */
  async initiateStoryMachineInteraction(roomId, chapterId, story) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('房间不存在');
    }
    
    // 获取章节内容
    const chapter = story.chapters.find(ch => ch.id === chapterId);
    if (!chapter) {
      throw new Error('章节不存在');
    }
    
    // 获取房间内所有玩家
    const players = Array.from(room.players.values()).map(p => ({
      id: p.id,
      username: p.username,
      role: p.role || 'player'
    }));
    
    console.log(`[故事机初始化] 开始为章节 ${chapterId} 生成谜题和线索，玩家数: ${players.length}`);
    
    // 生成谜题和玩家专属线索
    const { puzzle, playerClues } = await AIService.generatePuzzleAndClues(
      chapter.content,
      {
        title: story.title,
        background: story.background,
        currentChapter: chapter.chapterNumber
      },
      players
    );
    
    // 保存谜题到数据库
    const puzzleId = uuidv4();
    await database.createChapterPuzzle({
      id: puzzleId,
      chapterId: chapterId,
      storyId: story.id,
      puzzleQuestion: puzzle.question,
      correctAnswer: puzzle.correct_answer,
      answerKeywords: puzzle.answer_keywords,
      difficulty: puzzle.difficulty || 3,
      nextSteps: puzzle.next_steps || ''
    });
    console.log(`[故事机初始化] 谜题已保存，ID: ${puzzleId}`);
    
    // 为每个玩家保存专属线索
    for (const player of players) {
      const clues = playerClues[player.id] || [];
      for (const clue of clues) {
        const clueId = uuidv4();
        await database.createPlayerClue({
          id: clueId,
          chapterId: chapterId,
          playerId: player.id,
          clueType: clue.type,
          clueContent: clue.content,
          clueSource: clue.source,
          relevanceToPuzzle: clue.relevance,
          canShare: clue.canShare ? 1 : 0
        });
      }
      console.log(`[故事机初始化] 玩家 ${player.username} 获得 ${clues.length} 条线索`);
    }
    
    // 生成TODO列表（用于兼容现有系统）
    const todos = await AIService.generateChapterTodos(chapter.content, {
      title: story.title,
      background: story.background,
      currentChapter: chapter.chapterNumber
    });
    
    // 保存TODO到数据库
    await database.createChapterTodos(chapterId, todos);
    
    // 为每个玩家生成个性化的故事机初始消息
    const storyMachineMessages = await Promise.all(
      players.map(async (player) => {
        // 获取该玩家的线索
        const playerSpecificClues = playerClues[player.id] || [];
        
        // 生成包含第一条线索的初始消息
        const firstClue = playerSpecificClues[0];
        let initialMessage = `🤖 **故事机已激活**\n\n`;
        initialMessage += `📖 新的章节已经开始。作为 ${player.username}，你将在这个谜题中扮演重要角色。\n\n`;
        
        if (firstClue) {
          initialMessage += `💡 **你的第一条线索**\n`;
          initialMessage += `_${firstClue.source}_\n\n`;
          initialMessage += `"${firstClue.content}"\n\n`;
          
          // 标记第一条线索为已揭示
          const firstClueRecord = await database.getPlayerClues(chapterId, player.id);
          if (firstClueRecord.length > 0) {
            await database.revealClue(firstClueRecord[0].id);
          }
        }
        
        initialMessage += `🔮 **本章谜题**\n${puzzle.question}\n\n`;
        initialMessage += `💬 与我对话获取更多线索，或尝试回答谜题。记住，只有你能看到我们的对话！\n`;
        initialMessage += `🤝 也许其他玩家手中也有关键的线索...`;
        
        // 保存消息到数据库
        const messageId = uuidv4();
        await database.createMessage({
          id: messageId,
          roomId: roomId,
          storyId: story.id,
          senderId: 'ai',
          senderName: '故事机',
          recipientId: player.id,
          recipientName: player.username,
          messageType: 'story_machine',
          visibility: 'private',
          content: initialMessage,
          chapterNumber: chapter.chapterNumber
        });
        
        return {
          playerId: player.id,
          message: {
            id: messageId,
            type: 'story_machine',
            visibility: 'private',
            senderId: 'ai',
            sender: '故事机',
            recipientId: player.id,
            recipientName: player.username,
            content: initialMessage,
            timestamp: new Date(),
            roomId: roomId,
            storyId: story.id,
            isPrivate: true
          }
        };
      })
    );
    
    console.log(`[故事机初始化] 完成，已向 ${storyMachineMessages.length} 个玩家发送初始消息`);
    
    return {
      todos,
      puzzle: { id: puzzleId, ...puzzle },
      playerClues,
      storyMachineMessages,
      chapterId
    };
  }
  
  /**
   * 为新加入的玩家生成线索和故事机消息
   * @param {string} roomId - 房间ID
   * @param {string} chapterId - 当前章节ID
   * @param {Object} player - 玩家信息 { id, username }
   */
  async generateCluesForNewPlayer(roomId, chapterId, player) {
    const room = this.rooms.get(roomId);
    if (!room || !room.story) {
      throw new Error('房间或故事不存在');
    }
    
    const chapter = room.story.chapters.find(ch => ch.id === chapterId);
    if (!chapter) {
      throw new Error('章节不存在');
    }
    
    console.log(`[新玩家线索] 为玩家 ${player.username} 生成专属线索`);
    
    // 获取当前谜题
    const puzzle = await database.getChapterPuzzle(chapterId);
    
    // 使用AI为新玩家生成专属线索
    const cluesResult = await AIService.generateCluesForSinglePlayer(
      chapter.content,
      {
        title: room.story.title,
        background: room.story.background,
        currentChapter: chapter.chapterNumber
      },
      player,
      puzzle
    );
    
    // 保存线索到数据库
    for (const clue of cluesResult.clues) {
      const clueId = uuidv4();
      await database.createPlayerClue({
        id: clueId,
        chapterId: chapterId,
        playerId: player.id,
        clueType: clue.type,
        clueContent: clue.content,
        clueSource: clue.source,
        relevanceToPuzzle: clue.relevance,
        canShare: clue.canShare ? 1 : 0
      });
    }
    
    // 生成故事机初始消息
    const firstClue = cluesResult.clues[0];
    let initialMessage = `🤖 **故事机已激活**\n\n`;
    initialMessage += `📖 你作为新加入的侦探 ${player.username}，正式加入调查。\n\n`;
    
    if (firstClue) {
      initialMessage += `💡 **你的第一条线索**\n`;
      initialMessage += `_${firstClue.source}_\n\n`;
      initialMessage += `> ${firstClue.content}\n\n`;
      
      // 标记第一条线索为已揭示
      const firstClueRecord = await database.getPlayerClues(chapterId, player.id);
      if (firstClueRecord.length > 0) {
        await database.revealClue(firstClueRecord[0].id);
      }
    }
    
    if (puzzle) {
      initialMessage += `🔮 **本章谜题**\n> ${puzzle.puzzle_question}\n\n`;
    }
    
    initialMessage += `💬 与我对话获取更多线索，或尝试回答谜题。\n`;
    initialMessage += `🤝 也许其他玩家手中也有关键的线索...`;
    
    // 保存消息到数据库
    const messageId = uuidv4();
    await database.createMessage({
      id: messageId,
      roomId: roomId,
      storyId: room.story.id,
      senderId: 'ai',
      senderName: '故事机',
      recipientId: player.id,
      recipientName: player.username,
      messageType: 'story_machine',
      visibility: 'private',
      content: initialMessage,
      chapterNumber: chapter.chapterNumber
    });
    
    console.log(`[新玩家线索] 玩家 ${player.username} 获得 ${cluesResult.clues.length} 条线索`);
    
    return {
      clues: cluesResult.clues,
      storyMachineMessage: {
        id: messageId,
        type: 'story_machine',
        visibility: 'private',
        senderId: 'ai',
        sender: '故事机',
        recipientId: player.id,
        recipientName: player.username,
        content: initialMessage,
        timestamp: new Date(),
        roomId: roomId,
        storyId: room.story.id,
        isPrivate: true
      }
    };
  }
  
  /**
   * 触发章节推进（所有玩家解开谜题后）
   * @param {string} currentChapterId - 当前章节ID
   * @param {string} roomId - 房间ID
   * @param {Object} story - 故事对象
   */
  async triggerChapterProgression(currentChapterId, roomId, story) {
    console.log(`[章节推进] 开始推进章节，当前章节: ${currentChapterId}`);
    
    // 获取当前章节
    const currentChapter = story.chapters.find(ch => ch.id === currentChapterId);
    if (!currentChapter) {
      throw new Error('当前章节不存在');
    }
    
    // 获取谜题信息以包含在推进消息中
    const puzzle = await database.getChapterPuzzle(currentChapterId);
    
    // 生成下一章节
    const nextChapter = await this.generateNextChapter(story, currentChapter);
    
    // 初始化新章节的故事机互动
    const interactionResult = await this.initiateStoryMachineInteraction(
      roomId,
      nextChapter.id,
      story
    );
    
    return {
      ready: true,
      newChapter: nextChapter,
      interactionResult,
      puzzleInfo: puzzle ? {
        question: puzzle.puzzle_question,
        correctAnswer: puzzle.correct_answer,
        nextSteps: puzzle.next_steps
      } : null
    };
  }
  
  /**
   * 生成下一章节
   * @param {Object} story - 故事对象
   * @param {Object} currentChapter - 当前章节
   */
  async generateNextChapter(story, currentChapter) {
    const database = (await import('../storage/database.js')).default;
    
    // 获取谜题解决情况作为下一章节的背景
    const puzzle = await database.getChapterPuzzle(currentChapter.id);
    const puzzleSolved = puzzle ? puzzle.solved === 1 : false;
    
    // 生成下一章节内容
    const nextChapterContent = await AIService.generateStoryResponse(
      {
        title: story.title,
        background: story.background,
        currentChapter: currentChapter.chapterNumber,
        chapters: story.chapters,
        memories: story.memories || []
      },
      `【剧本杀游戏 - 第${currentChapter.chapterNumber + 1}章】

玩家们${puzzleSolved ? '成功解开了谜题' : '在探索中'}，故事需要继续推进。

## 上一章节回顾：
${currentChapter.content.substring(0, 500)}...

## 谜题结果：
${puzzleSolved ? `谜题"${puzzle?.puzzle_question || ''}"已被解开，答案是"${puzzle?.correct_answer || ''}"` : '谜题尚未解开'}

## 创作要求：
1. 基于上一章节的发展，创作新的剧情
2. 引入新的谜题或悬念
3. 可以揭示部分真相，但保留核心悬念
4. 为玩家提供新的探索方向
5. 字数：300-500字
6. 结尾留下悬念，引导下一步探索`
    );
    
    // 创建新章节
    const chapterId = uuidv4();
    const chapterNumber = currentChapter.chapterNumber + 1;
    
    await database.createChapter(
      chapterId,
      story.id,
      chapterNumber,
      nextChapterContent.content,
      null,
      null
    );
    
    const newChapter = {
      id: chapterId,
      chapterNumber,
      content: nextChapterContent.content,
      createdAt: new Date(),
      summary: null
    };
    
    story.addChapter(newChapter);
    
    console.log(`[章节推进] 新章节已生成，章节号: ${chapterNumber}`);
    
    return newChapter;
  }
  
  /**
   * 生成故事机初始消息（基于TODO）
   * @param {Object} chapter - 章节对象
   * @param {Array} todos - TODO列表
   * @param {Object} player - 玩家对象
   * @param {Object} story - 故事对象
   * @returns {Promise<string>} 初始消息内容
   */
  async generateStoryMachineInitialMessage(chapter, todos, player, story) {
    // 选择优先级最高的TODO作为初始话题
    const topTodo = todos.sort((a, b) => b.priority - a.priority)[0];
    
    // 构建提示词
    const systemPrompt = `你是剧本杀游戏中的"故事机"，负责引导玩家探索和收集信息。

## 游戏背景
- 故事标题：${story.title}
- 当前章节：第${chapter.chapterNumber}章
- 玩家名称：${player.username}

## 章节内容摘要
${chapter.content.substring(0, 500)}...

## 你需要引导玩家探索的方向（TODO）
${todos.map((t, i) => `${i + 1}. ${t.content}`).join('\n')}

## 生成要求
请生成一条引导消息：
1. 以友好但神秘的语气与玩家打招呼
2. 简要提及本章节发生的关键事件
3. 基于最高优先级的探索方向（${topTodo.content}），向玩家提出一个引导性问题
4. 暗示玩家可以通过探索来发现更多信息
5. 长度：80-120字
6. 语气：像一个神秘的向导，既友好又保持悬疑感`;

    try {
      // 使用AIService的generateStoryMachineResponse方法，但自定义提示词
      const context = {
        title: story.title,
        background: story.background,
        currentChapter: chapter.chapterNumber,
        chapters: story.chapters || [],
        memories: []
      };
      
      const customPrompt = `请为玩家${player.username}生成故事机初始消息。
当前章节：第${chapter.chapterNumber}章
章节内容：${chapter.content.substring(0, 500)}...

你需要收集的信息（TODO）：
${todos.map((t, i) => `${i + 1}. ${t.content}`).join('\n')}

请生成一条友好的初始消息，向玩家介绍本章节，并引导他们与你互动。
消息应该：
1. 简要提及本章节的关键内容
2. 基于最高优先级的TODO（${topTodo.content}）提出问题或引导
3. 语气友好、自然
4. 长度控制在100-150字`;
      
      const response = await AIService.generateStoryMachineResponse(context, customPrompt, player.id);
      return response.content || `你好${player.username}！新的一章开始了，我想了解你对本章节内容的看法。`;
    } catch (error) {
      console.error('生成故事机初始消息失败:', error);
      return `你好${player.username}！新的一章开始了。我想了解你对本章节内容的看法，特别是关于"${topTodo.content}"。`;
    }
  }
  
  /**
   * 处理反馈超时
   * @param {string} chapterId - 章节ID
   * @param {string} roomId - 房间ID
   */
  async handleFeedbackTimeout(chapterId, roomId) {
    // 标记超时玩家为完成
    await database.markTimeoutPlayersAsComplete(chapterId);
    
    // 重新检查章节推进条件
    await this.checkChapterProgression(chapterId, roomId);
  }
  
  /**
   * 检查章节推进条件：单玩家80%或多玩家全部80%时生成下一章
   * @param {string} chapterId - 章节ID
   * @param {string} roomId - 房间ID
   * @returns {Promise<Object>} 推进结果
   */
  async checkChapterProgression(chapterId, roomId) {
    const room = this.rooms.get(roomId);
    if (!room || !room.story) {
      return { ready: false, reason: '房间或故事不存在' };
    }
    
    // 检查章节是否准备就绪
    const checkResult = await database.checkChapterReady(chapterId, roomId);
    
    if (checkResult.ready) {
      // 生成下一章
      return await this.generateNextChapter(roomId, chapterId);
    }
    
    const feedbackConfig = getFeedbackSystemConfig();
    return {
      ready: false,
      playersProgress: checkResult.playersProgress,
      reason: `玩家反馈未达到${feedbackConfig.progressionThreshold * 100}%完成度`
    };
  }
  
  /**
   * 生成下一章
   * @param {string} roomId - 房间ID
   * @param {string} currentChapterId - 当前章节ID
   * @returns {Promise<Object>} 新章节信息
   */
  async generateNextChapter(roomId, currentChapterId) {
    const room = this.rooms.get(roomId);
    if (!room || !room.story) {
      throw new Error('房间或故事不存在');
    }
    
    const story = room.story;
    const currentChapter = story.chapters.find(ch => ch.id === currentChapterId);
    if (!currentChapter) {
      throw new Error('当前章节不存在');
    }
    
    // 使用章节管理器生成下一章
    const chapterManager = this.chapterManagers.get(story.id);
    if (!chapterManager) {
      throw new Error('章节管理器未初始化');
    }
    
    // 手动触发章节分割
    const transitionResult = await chapterManager.manualChapterSplit(story, {
      lastPlayerActivity: new Date(),
      playerMessage: '所有玩家反馈收集完成，推进到下一章'
    });
    
    if (transitionResult.newChapterOpening) {
      // 创建新章节
      const newChapter = await chapterManager.transition.createNewChapter(
        story,
        transitionResult.newChapterOpening,
        transitionResult.randomEvent
      );
      
      // 添加到故事
      story.addChapter(newChapter);
      
      // 保存到数据库
      await database.createChapter(
        newChapter.id,
        story.id,
        newChapter.chapterNumber,
        newChapter.content,
        'system',
        null
      );
      
      // 更新章节历史
      chapterManager.history.addChapter(newChapter);
      
      // 启动新章节的故事机互动
      const interactionResult = await this.initiateStoryMachineInteraction(roomId, newChapter.id, story);
      
      return {
        ready: true,
        newChapter,
        interactionResult
      };
    }
    
    return {
      ready: false,
      reason: '生成新章节失败'
    };
  }
  
  /**
   * 评估玩家反馈：判断是否满足TODO要求，更新完成度
   * @param {string} playerId - 玩家ID
   * @param {string} message - 玩家消息
   * @param {string} chapterId - 章节ID
   * @param {Array} todos - TODO列表
   * @param {Object} story - 故事对象
   * @returns {Promise<Object>} 评估结果
   */
  async evaluateFeedback(playerId, message, chapterId, todos, story) {
    if (todos.length === 0) {
      return {
        completedTodos: [],
        completionRate: 0,
        totalTodos: 0
      };
    }
    
    // 使用AI判断玩家回复是否满足TODO要求
    const evaluationResults = await Promise.all(
      todos.map(async (todo) => {
        if (todo.status === 'completed') {
          return { todoId: todo.id, satisfied: true, alreadyCompleted: true };
        }
        
        // 构建评估提示词
        const systemPrompt = `你是一个反馈评估助手，负责判断玩家的回复是否满足信息收集要求。

TODO项：${todo.content}
故事背景：${story.title || '未命名故事'}

请判断玩家的回复是否满足这个TODO项的要求。只返回JSON格式：
{"satisfied": true/false, "reason": "判断理由"}`;
        
        const userPrompt = `玩家回复：${message}

请判断这个回复是否满足TODO项"${todo.content}"的要求。`;
        
        try {
          const response = await AIService.generateStoryMachineResponse(
            {
              title: story.title,
              background: story.background,
              currentChapter: 0,
              chapters: [],
              memories: []
            },
            userPrompt,
            playerId
          );
          
          // 解析AI返回（尝试提取JSON）
          let evaluation = { satisfied: false, reason: '' };
          try {
            const content = response.content || '';
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              evaluation = JSON.parse(jsonMatch[0]);
            } else if (content.toLowerCase().includes('满足') || content.toLowerCase().includes('satisfied')) {
              evaluation.satisfied = true;
            }
          } catch (parseError) {
            // 如果解析失败，使用简单关键词判断
            const positiveKeywords = ['满足', '符合', '可以', '是的', '对', 'satisfied', 'yes'];
            evaluation.satisfied = positiveKeywords.some(keyword => 
              message.toLowerCase().includes(keyword) || content.toLowerCase().includes(keyword)
            );
          }
          
          // 如果满足要求，更新TODO状态
          if (evaluation.satisfied) {
            await database.updateTodoStatus(todo.id, 'completed');
          }
          
          return {
            todoId: todo.id,
            satisfied: evaluation.satisfied,
            reason: evaluation.reason || ''
          };
        } catch (error) {
          console.error(`评估TODO ${todo.id}失败:`, error);
          return { todoId: todo.id, satisfied: false, reason: '评估失败' };
        }
      })
    );
    
    // 计算完成度
    const completedTodos = evaluationResults.filter(r => r.satisfied).map(r => r.todoId);
    const completionRate = todos.length > 0 ? completedTodos.length / todos.length : 0;
    
    // 更新玩家进度
    await database.createOrUpdatePlayerProgress(chapterId, playerId, null, {
      feedbackCount: completedTodos.length,
      completionRate: completionRate
    });
    
    return {
      completedTodos,
      completionRate,
      totalTodos: todos.length,
      evaluationResults
    };
  }
  
  /**
   * 获取当前章节
   */
  getCurrentChapter(story) {
    if (!story || !story.chapters || story.chapters.length === 0) {
      return null;
    }
    
    // 找到未完成的章节
    return story.chapters.find(ch => 
      ch.status === 'active' || ch.status === 'draft' || !ch.endTime
    ) || story.chapters[story.chapters.length - 1];
  }
  
  /**
   * 判断是否应该触发AI故事生成
   * 智能触发条件：
   * 1. 当前章节内首次消息 → 立即触发
   * 2. 累积消息数达到阈值（如3条）→ 触发
   * 3. 消息包含关键动作词 → 触发
   * 4. 距离上次生成超过一定时间 → 触发
   * 
   * @param {string} roomId - 房间ID
   * @param {string} storyId - 故事ID
   * @param {string} message - 当前消息内容
   * @param {Object} currentChapter - 当前章节
   * @returns {Promise<boolean>} 是否应该触发
   */
  async shouldTriggerStoryGeneration(roomId, storyId, message, currentChapter) {
    try {
      // 获取配置
  const triggers = getStoryGenerationTriggers();
      
      // 获取当前章节内的全局消息数量
      const recentMessages = await database.getRecentGlobalMessages(storyId, currentChapter?.id);
      const messageCount = recentMessages.length;
      
      // 条件1：章节内首次全局消息（或只有1条消息）→ 立即触发
      if (messageCount <= 1) {
        console.log('[触发判断] 章节内首次消息，触发生成');
        return true;
      }
      
      // 条件2：累积消息数达到阈值
      if (messageCount % triggers.cumulativeMessageCount === 0) {
        console.log(`[触发判断] 消息数达到阈值(${messageCount})，触发生成`);
        return true;
      }
      
      // 条件3：消息包含关键动作词 → 立即触发
      const hasActionKeyword = triggers.actionKeywords.some(keyword => message.includes(keyword));
      if (hasActionKeyword) {
        console.log('[触发判断] 检测到关键动作词，触发生成');
        return true;
      }
      
      // 条件4：消息包含假设/选择性表达 → 立即触发
      const hasQuestionTrigger = triggers.questionTriggers.some(phrase => message.includes(phrase));
      if (hasQuestionTrigger) {
        console.log('[触发判断] 检测到假设/选择性表达，触发生成');
        return true;
      }
      
      // 条件5：消息包含戏剧性/紧急关键词 → 立即触发
      const hasDramaticKeyword = triggers.dramaticKeywords.some(keyword => message.includes(keyword));
      if (hasDramaticKeyword) {
        console.log('[触发判断] 检测到戏剧性关键词，触发生成');
        return true;
      }
      
      // 条件6：消息长度超过阈值
      if (message.length > triggers.longMessageThreshold) {
        console.log('[触发判断] 消息较长，触发生成');
        return true;
      }
      
      // 条件7：距离上次AI响应超过一定时间
      const lastAIMessage = recentMessages.find(m => m.sender_id === 'ai' || m.message_type === 'chapter');
      if (lastAIMessage) {
        const timeSinceLastAI = Date.now() - new Date(lastAIMessage.created_at).getTime();
        const timeThreshold = triggers.timeIntervalMinutes * 60 * 1000;
        if (timeSinceLastAI > timeThreshold) {
          console.log(`[触发判断] 距离上次AI响应超过${triggers.timeIntervalMinutes}分钟，触发生成`);
          return true;
        }
      }
      
      console.log(`[触发判断] 未满足触发条件，等待更多消息(当前${messageCount}条)`);
      return false;
      
    } catch (error) {
      console.error('[触发判断] 检查失败:', error);
      // 出错时默认触发，保证用户体验
      return true;
    }
  }
  
  /**
   * 同步玩家状态
   */
  syncPlayerState(playerId, isOnline = true) {
    const state = this.playerStates.get(playerId) || {
      lastActive: new Date(),
      online: false
    };
    
    state.lastActive = new Date();
    state.online = isOnline;
    
    this.playerStates.set(playerId, state);
    
    // 更新房间中的玩家状态
    for (const room of this.rooms.values()) {
      const player = room.getPlayer(playerId);
      if (player) {
        player.updateOnlineStatus(isOnline);
      }
    }
  }
  
  // 生成章节摘要（异步）
  async generateChapterSummary(storyId, chapterId, chapterContent) {
    try {
      const summary = await AIService.summarizeChapter(chapterContent);
      
      // 更新数据库
      await database.updateChapterSummary(chapterId, summary);
      
      // 更新内存中的章节
      const room = Array.from(this.rooms.values()).find(r => r.story?.id === storyId);
      if (room && room.story) {
        room.story.updateChapterSummary(chapterId, summary);
      }
    } catch (error) {
      console.error('生成章节摘要失败:', error);
    }
  }
  
  // 获取前文摘要
  getPreviousChaptersSummary(story) {
    if (story.chapters.length === 0) {
      return '这是故事的开头';
    }
    
    // 返回最近3章的摘要
    const recentChapters = story.chapters.slice(-3);
    return recentChapters
      .map((ch, idx) => `第${ch.chapterNumber}章: ${ch.content.substring(0, 100)}...`)
      .join('\n');
  }
  
  // 获取房间状态
  getRoomStatus(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return null;
    }
    
    return room.toJSON();
  }
  
  // 离开房间
  async leaveRoom(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return false;
    }
    
    // 更新玩家状态
    this.syncPlayerState(playerId, false);
    
    const removed = room.removePlayer(playerId);
    
    // 如果房间为空，清理相关资源
    if (room.players.size === 0) {
      this.scheduleEmptyRoomCleanup(roomId);
    }
    
    return removed;
  }
  
  scheduleEmptyRoomCleanup(roomId) {
    if (!roomId) {
      return;
    }
    this.cancelEmptyRoomCleanup(roomId, { silent: true });
    const timeout = setTimeout(() => {
      this.deleteRoomResources(roomId, 'empty_timeout').catch(error => {
        console.error(`自动删除房间 ${roomId} 失败:`, error);
      });
    }, this.emptyRoomGracePeriodMs);
    this.emptyRoomTimers.set(roomId, {
      timeout,
      expiresAt: Date.now() + this.emptyRoomGracePeriodMs
    });
    console.log(`🕒 房间 ${roomId} 暂无玩家，将在 ${Math.round(this.emptyRoomGracePeriodMs / 60000)} 分钟后自动删除`);
  }
  
  cancelEmptyRoomCleanup(roomId, { silent = false } = {}) {
    const timer = this.emptyRoomTimers.get(roomId);
    if (timer) {
      clearTimeout(timer.timeout);
      this.emptyRoomTimers.delete(roomId);
      if (!silent) {
        console.log(`✅ 房间 ${roomId} 再次有人加入，已取消自动删除计时`);
      }
    }
  }
  
  async deleteRoomResources(roomId, reason = 'manual') {
    if (!roomId) {
      return;
    }
    this.cancelEmptyRoomCleanup(roomId, { silent: true });
    const room = this.rooms.get(roomId);
    let storyId = room?.story?.id;
    if (!storyId) {
      try {
        const story = await database.getStory(roomId);
        storyId = story?.id;
      } catch (error) {
        console.error(`查询房间 ${roomId} 故事信息失败:`, error);
      }
    }
    if (storyId) {
      this.chapterManagers.delete(storyId);
      this.memorySystems.delete(storyId);
    }
    this.rooms.delete(roomId);
    try {
      await database.deleteRoom(roomId);
      console.log(`🧹 房间 ${roomId} 已删除 (原因: ${reason})`);
    } catch (error) {
      console.error(`删除房间 ${roomId} 时出错:`, error);
    }
  }
  
  /**
   * 暂停房间
   */
  async pauseRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('房间不存在');
    }
    
    room.updateStatus('paused');
    await database.updateRoomStatus(roomId, 'paused');
    
    return room;
  }
  
  /**
   * 恢复房间
   */
  async resumeRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('房间不存在');
    }
    
    room.updateStatus('playing');
    await database.updateRoomStatus(roomId, 'playing');
    
    return room;
  }
  
  /**
   * 结束房间
   */
  async endRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('房间不存在');
    }
    
    room.updateStatus('ended');
    await database.updateRoomStatus(roomId, 'ended');
    
    // 清理资源
    if (room.story) {
      // 可以选择保留历史记录
    }
    
    return room;
  }
  
  /**
   * 手动触发章节分割
   */
  async manualChapterSplit(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (!room || !room.story) {
      throw new Error('房间或故事不存在');
    }
    
    // 检查权限（只有房主可以手动分割）
    if (room.hostId !== playerId) {
      throw new Error('只有房主可以手动分割章节');
    }
    
    const chapterManager = this.chapterManagers.get(room.story.id);
    if (!chapterManager) {
      throw new Error('章节管理器未初始化');
    }
    
    const result = await chapterManager.manualChapterSplit(room.story, {
      manual: true,
      playerId
    });
    
    // 创建新章节
    const newChapter = await chapterManager.transition.createNewChapter(
      room.story,
      result.newChapterOpening,
      result.randomEvent
    );
    
    room.story.addChapter(newChapter);
    
    // 保存到数据库
    await database.createChapter(
      newChapter.id,
      room.story.id,
      newChapter.chapterNumber,
      newChapter.content,
      'system',
      null
    );
    
    return {
      newChapter,
      transition: result
    };
  }
  
  /**
   * 获取章节历史
   */
  async getChapterHistory(roomId) {
    const room = this.rooms.get(roomId);
    if (!room || !room.story) {
      throw new Error('房间或故事不存在');
    }
    
    const chapterManager = this.chapterManagers.get(room.story.id);
    if (!chapterManager) {
      // 如果不存在，创建并加载
      const newManager = createChapterManager(room.story.id);
      await newManager.history.loadHistory();
      this.chapterManagers.set(room.story.id, newManager);
      return newManager.history;
    }
    
    await chapterManager.history.loadHistory();
    return chapterManager.history;
  }
}

export default new GameEngine();

