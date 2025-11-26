import { v4 as uuidv4 } from 'uuid';
import { GameRoom } from './models/GameRoom.js';
import { GameStory } from './models/GameStory.js';
import { Player } from './models/Player.js';
import AIService from '../ai-service/AIService.js';
import database from '../storage/database.js';
import { createChapterManager } from './chapters/index.js';
import { createMemorySystem } from '../ai-service/memory/index.js';

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
  }
  
  // 创建房间
  async createRoom(name, hostId, hostUsername) {
    const roomId = uuidv4();
    
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
    
    return room;
  }
  
  // 初始化故事
  async initializeStory(roomId, title, background) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('房间不存在');
    }
    
    if (room.story) {
      throw new Error('故事已经初始化');
    }
    
    const storyId = uuidv4();
    
    // 创建故事记录
    await database.createStory(storyId, roomId, title, background);
    
    // 创建内存中的故事对象
    const story = new GameStory({
      id: storyId,
      roomId,
      title,
      background
    });
    
    room.setStory(story);
    room.updateStatus('playing');
    await database.updateRoomStatus(roomId, 'playing');
    
    // 初始化章节管理系统
    const chapterManager = createChapterManager(storyId, {
      trigger: {
        wordCount: 2500,
        timeElapsed: 30,
        keyEvents: 3
      }
    });
    this.chapterManagers.set(storyId, chapterManager);
    
    // 初始化记忆系统
    const memorySystem = createMemorySystem(storyId);
    await memorySystem.loadAllMemories();
    this.memorySystems.set(storyId, memorySystem);
    
    // 生成初始章节并启动故事机互动
    try {
      // 生成第一个章节
      const firstChapter = await this.generateFirstChapter(story, title, background);
      
      // 启动故事机互动
      const interactionResult = await this.initiateStoryMachineInteraction(roomId, firstChapter.id, story);
      
      return {
        room,
        story,
        firstChapter,
        interactionResult
      };
    } catch (error) {
      console.error('生成初始章节失败:', error);
      // 即使失败也返回房间和故事
      return {
        room,
        story,
        firstChapter: null,
        interactionResult: null
      };
    }
  }
  
  /**
   * 生成第一个章节
   */
  async generateFirstChapter(story, title, background) {
    const AIService = (await import('../ai-service/AIService.js')).default;
    const database = (await import('../storage/database.js')).default;
    const { v4: uuidv4 } = await import('uuid');
    
    // 生成章节内容
    const chapterContent = await AIService.generateStoryResponse(
      {
        title,
        background,
        currentChapter: 0,
        chapters: [],
        memories: []
      },
      `请为故事"${title}"生成第一章的开头。故事背景：${background}

重要提示：当故事中出现NPC（非玩家角色）时，请使用格式 [NPC:名称] 来标记NPC名称，例如："[NPC:张老师]走了过来" 或 "遇到了[NPC:神秘商人]"。玩家名称不需要标记，系统会自动识别。`
    );
    
    // 创建章节
    const chapterId = uuidv4();
    const chapterNumber = 1;
    await database.createChapter(
      chapterId,
      story.id,
      chapterNumber,
      chapterContent.content,
      null,
      'ai'
    );
    
    const chapter = {
      id: chapterId,
      chapterNumber,
      content: chapterContent.content,
      createdAt: new Date(),
      summary: null
    };
    
    story.addChapter(chapter);
    
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
      // 故事机模式：AI主动更新信息并收取反馈
      // 获取当前章节
      const currentChapter = this.getCurrentChapter(room.story);
      if (!currentChapter) {
        throw new Error('没有当前章节');
      }
      
      // 获取章节TODO列表
      const todos = await database.getChapterTodos(currentChapter.id);
      
      // 评估玩家反馈
      const feedbackResult = await this.evaluateFeedback(
        playerId,
        message,
        currentChapter.id,
        todos,
        room.story
      );
      
      // 调用故事机专用方法生成响应
      storyMachineResponse = await AIService.generateStoryMachineResponse(context, message, playerId);
      
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
        content: storyMachineResponse.content,
        timestamp: new Date(),
        roomId: roomId,
        storyId: room.story.id,
        isPrivate: true
      };
      
      // 保存故事机消息到数据库
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
        content: storyMachineResponse.content,
        chapterNumber: currentChapter.chapterNumber
      });
      
      // 检查是否所有玩家都达到80%完成度
      const progressionResult = await this.checkChapterProgression(currentChapter.id, roomId);
      
      return {
        message: createdMessage,
        storyMachineMessage: storyMachineMessage,
        chapter: null,
        memories: [],
        aiModel: storyMachineResponse.model,
        chapterTransition: null,
        feedbackResult: feedbackResult,
        progressionResult: progressionResult.ready ? progressionResult : null
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
   * 启动故事机互动：生成TODO列表并向所有玩家发送初始消息
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
    
    // 生成TODO列表
    const todos = await AIService.generateChapterTodos(chapter.content, {
      title: story.title,
      background: story.background,
      currentChapter: chapter.chapterNumber
    });
    
    // 保存TODO到数据库
    await database.createChapterTodos(chapterId, todos);
    
    // 获取房间内所有玩家
    const players = Array.from(room.players.values());
    
    // 为每个玩家生成个性化的故事机初始消息
    const storyMachineMessages = await Promise.all(
      players.map(async (player) => {
        // 基于TODO生成个性化的初始消息
        const initialMessage = await this.generateStoryMachineInitialMessage(
          chapter,
          todos,
          player,
          story
        );
        
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
        
        // 设置10分钟超时
        const timeoutAt = new Date(Date.now() + 10 * 60 * 1000); // 10分钟后
        await database.setPlayerTimeout(chapterId, player.id, timeoutAt);
        
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
    
    // 设置超时定时器（10分钟后检查）
    setTimeout(async () => {
      await this.handleFeedbackTimeout(chapterId, roomId);
    }, 10 * 60 * 1000);
    
    return {
      todos,
      storyMachineMessages,
      chapterId
    };
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
    const systemPrompt = `你是一个故事机，负责与玩家互动收集反馈。
当前章节：第${chapter.chapterNumber}章
章节内容：${chapter.content.substring(0, 500)}...

你需要收集的信息（TODO）：
${todos.map((t, i) => `${i + 1}. ${t.content}`).join('\n')}

请生成一条友好的初始消息，向玩家${player.username}介绍本章节，并引导他们与你互动。
消息应该：
1. 简要提及本章节的关键内容
2. 基于最高优先级的TODO（${topTodo.content}）提出问题或引导
3. 语气友好、自然
4. 长度控制在100-150字`;

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
    
    return {
      ready: false,
      playersProgress: checkResult.playersProgress,
      reason: '玩家反馈未达到80%完成度'
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
      // 获取当前章节内的全局消息数量
      const recentMessages = await database.getRecentGlobalMessages(storyId, currentChapter?.id);
      const messageCount = recentMessages.length;
      
      // 条件1：章节内首次全局消息（或只有1条消息）→ 立即触发
      if (messageCount <= 1) {
        console.log('[触发判断] 章节内首次消息，触发生成');
        return true;
      }
      
      // 条件2：累积消息数达到阈值（每3条消息触发一次）
      const MESSAGE_THRESHOLD = 3;
      if (messageCount % MESSAGE_THRESHOLD === 0) {
        console.log(`[触发判断] 消息数达到阈值(${messageCount})，触发生成`);
        return true;
      }
      
      // 条件3：消息包含关键动作词 → 立即触发
      const ACTION_KEYWORDS = [
        '攻击', '战斗', '打', '杀', '逃跑', '逃',
        '寻找', '搜索', '探索', '调查', '发现',
        '说话', '对话', '交谈', '询问', '回答',
        '拿', '拾取', '使用', '打开', '关闭',
        '走', '跑', '跳', '飞', '进入', '离开',
        '施法', '魔法', '技能', '召唤',
        '交易', '购买', '出售', '给予',
        '死', '倒下', '昏迷', '受伤',
        '结束', '完成', '成功', '失败'
      ];
      
      const hasActionKeyword = ACTION_KEYWORDS.some(keyword => message.includes(keyword));
      if (hasActionKeyword) {
        console.log('[触发判断] 检测到关键动作词，触发生成');
        return true;
      }
      
      // 条件4：消息长度较长（超过50字符，表示玩家有较多想法）
      if (message.length > 50) {
        console.log('[触发判断] 消息较长，触发生成');
        return true;
      }
      
      // 条件5：距离上次AI响应超过一定时间（如2分钟）
      const lastAIMessage = recentMessages.find(m => m.sender_id === 'ai' || m.message_type === 'chapter');
      if (lastAIMessage) {
        const timeSinceLastAI = Date.now() - new Date(lastAIMessage.created_at).getTime();
        const TIME_THRESHOLD = 2 * 60 * 1000; // 2分钟
        if (timeSinceLastAI > TIME_THRESHOLD) {
          console.log('[触发判断] 距离上次AI响应超过2分钟，触发生成');
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
      this.rooms.delete(roomId);
      
      // 清理章节管理器和记忆系统（可选，也可以保留用于历史）
      if (room.story) {
        // 可以选择保留或删除
        // this.chapterManagers.delete(room.story.id);
        // this.memorySystems.delete(room.story.id);
      }
    }
    
    return removed;
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

