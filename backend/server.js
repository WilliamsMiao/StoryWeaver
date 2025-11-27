import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/index.js';
import database from './storage/database.js';
import gameEngine from './game-engine/GameEngine.js';
import { errorHandler, asyncHandler, AppError, socketErrorHandler } from './middleware/errorHandler.js';
import { requestLogger, socketLogger, errorLogger } from './middleware/logger.js';
import rateLimiter from './middleware/rateLimiter.js';
import { metricsMiddleware, metricsEndpoint } from './middleware/metrics.js';
// 剧本工厂
import { scriptRouter, initScriptFactory, scriptGenerator } from './script-factory/index.js';
import AIService from './ai-service/AIService.js';
// 增强游戏状态管理
import enhancedGameStateManager from './game-engine/EnhancedGameStateManager.js';
// NPC对话服务
import { getNpcDialogueService } from './ai-service/NpcDialogueService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class StoryWeaverServer {
  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
    // CI/CD测试: 代码更新测试
    
    // Socket.io 配置（生产环境优化）
    const socketioConfig = config.socketio || {
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
      allowEIO3: true,
      cors: {
        origin: config.corsOrigin,
        methods: ['GET', 'POST']
      }
    };
    
    this.io = new Server(this.httpServer, socketioConfig);
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketHandlers();
  }
  
  setupMiddleware() {
    // 性能指标收集（在日志之前）
    this.app.use(metricsMiddleware);
    
    // 请求日志
    this.app.use(requestLogger);
    
    // 请求限流
    this.app.use(rateLimiter.createLimiter({
      windowMs: 15 * 60 * 1000, // 15分钟
      maxRequests: 100 // 最大100个请求
    }));
    
    // 解析JSON和URL编码
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // CORS头
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', config.corsOrigin);
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });
    
    // 健康检查（增强版）
    this.app.get('/health', (req, res) => {
      const memUsage = process.memoryUsage();
      const healthData = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        environment: config.nodeEnv,
        version: process.env.npm_package_version || '1.0.0',
        memory: {
          rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
          external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
        },
        system: {
          platform: os.platform(),
          nodeVersion: process.version,
          cpuCount: os.cpus().length
        },
        services: {
          database: 'connected', // 可以添加实际检查
          aiProvider: config.aiProvider
        }
      };
      
      res.json(healthData);
    });
    
    // API信息
    this.app.get('/api/info', (req, res) => {
      res.json({
        name: 'StoryWeaver API',
        version: '1.0.0',
        aiProvider: config.aiProvider
      });
    });
    
    // 性能指标端点（可选，生产环境可通过环境变量禁用）
    if (config.nodeEnv !== 'production' || process.env.ENABLE_METRICS === 'true') {
      this.app.get('/api/metrics', metricsEndpoint);
    }
  }
  
  setupRoutes() {
    // 剧本工厂 API
    this.app.use('/api/scripts', scriptRouter);
    
    // 静态文件服务 - 剧本工厂目录
    this.app.use('/script-factory', express.static(path.join(__dirname, 'script-factory')));
    
    // 剧本工厂管理后台静态页面 (保留旧路由以兼容)
    this.app.get('/admin/scripts', (req, res) => {
      res.sendFile(path.join(__dirname, 'script-factory', 'admin.html'));
    });
    
    // 房间管理后台
    this.app.get('/admin/rooms', (req, res) => {
      res.sendFile(path.join(__dirname, 'script-factory', 'room-admin.html'));
    });
    
    // 门户页面
    this.app.get('/portal', (req, res) => {
      res.sendFile(path.join(__dirname, 'script-factory', 'index.html'));
    });

    // 管理员验证中间件
    const adminAuth = (req, res, next) => {
      const password = req.headers['x-admin-password'] || req.query.password;
      if (password === '370032') {
        next();
      } else {
        res.status(401).json({ error: 'Unauthorized' });
      }
    };

    // 管理 API: 获取房间列表
    this.app.get('/api/admin/rooms', adminAuth, (req, res) => {
      const rooms = [];
      for (const [id, room] of gameEngine.rooms.entries()) {
        rooms.push({
          id: room.id,
          name: room.name,
          status: room.status,
          playerCount: room.players.size,
          hostId: room.hostId,
          createdAt: room.createdAt || Date.now()
        });
      }
      res.json({ success: true, rooms });
    });

    // 管理 API: 删除房间
    this.app.delete('/api/admin/rooms/:roomId', adminAuth, (req, res) => {
      const { roomId } = req.params;
      if (gameEngine.rooms.has(roomId)) {
        const room = gameEngine.rooms.get(roomId);
        // 通知房间内所有玩家
        this.io.to(roomId).emit('error', { message: '房间已被管理员关闭' });
        this.io.in(roomId).disconnectSockets();
        
        gameEngine.rooms.delete(roomId);
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Room not found' });
      }
    });
    
    // API路由 - 使用asyncHandler包装异步函数
    this.app.get('/api/rooms/:roomId', asyncHandler(async (req, res) => {
      const { roomId } = req.params;
      
      if (!roomId) {
        throw new AppError('房间ID不能为空', 400, 'INVALID_ROOM_ID');
      }
      
      const status = gameEngine.getRoomStatus(roomId);
      
      if (!status) {
        throw new AppError('房间不存在', 404, 'ROOM_NOT_FOUND');
      }
      
      res.json({
        success: true,
        data: status
      });
    }));
    
    // 404处理（必须在所有路由之后）
    this.app.use((req, res, next) => {
      res.status(404).json({
        success: false,
        error: '接口不存在',
        path: req.path
      });
    });
    
    // 错误处理（必须在最后）
    this.app.use(errorHandler);
  }
  
  setupSocketHandlers() {
    // 保存 io 引用，避免嵌套回调中 this 绑定问题
    const io = this.io;
    
    io.on('connection', (socket) => {
      socketLogger(socket, 'connection');
      
      // Socket连接超时处理（延长到5分钟，给用户更多时间）
      const connectionTimeout = setTimeout(() => {
        if (!socket.data.roomId) {
          socketLogger(socket, 'connection_timeout');
          // 不立即断开，只是记录日志
          // socket.disconnect();
        }
      }, 5 * 60 * 1000); // 5分钟内未加入房间才记录超时（不强制断开）
      
      // Socket事件包装器（添加限流和错误处理）
      const wrapSocketHandler = (eventName, handler, maxPerMinute = 30) => {
        return async (data, callback) => {
          // 限流检查
          if (!rateLimiter.socketLimiter(socket, eventName, maxPerMinute)) {
            return;
          }
          
          // 执行处理器
          try {
            await handler(data, callback);
          } catch (error) {
            socketErrorHandler(socket, error, eventName);
            if (callback) {
              callback({
                success: false,
                error: error.message,
                code: error.code || 'INTERNAL_ERROR'
              });
            }
          }
        };
      };
      
      // 创建房间
      socket.on('create_room', wrapSocketHandler('create_room', async (data, callback) => {
        try {
          const { name, playerId, username } = data;
          
          if (!name || !playerId || !username) {
            return callback({ 
              success: false,
              error: '缺少必要参数',
              code: 'MISSING_PARAMETERS'
            });
          }
          
          // 参数验证
          if (name.length > 50) {
            return callback({
              success: false,
              error: '房间名称过长（最大50字符）',
              code: 'INVALID_INPUT'
            });
          }
          
          const room = await gameEngine.createRoom(name, playerId, username);
          
          // 加入Socket房间
          socket.join(room.id);
          socket.data.roomId = room.id;
          socket.data.playerId = playerId;
          socket.data.username = username; // 保存用户名
          clearTimeout(connectionTimeout);
          
          socketLogger(socket, 'room_created', { roomId: room.id });
          
          callback({ success: true, room: room.toJSON() });
          
          // 广播房间更新
          io.to(room.id).emit('room_updated', room.toJSON());
        } catch (error) {
          errorLogger(error, { event: 'create_room', socketId: socket.id });
          callback({ 
            success: false,
            error: error.message,
            code: error.code || 'INTERNAL_ERROR'
          });
        }
      }));
      
      // 加入房间
      socket.on('join_room', wrapSocketHandler('join_room', async (data, callback) => {
        try {
          const { roomId, playerId, username } = data;
          
          if (!roomId || !playerId || !username) {
            return callback({ 
              success: false,
              error: '缺少必要参数',
              code: 'MISSING_PARAMETERS'
            });
          }
          
          const room = await gameEngine.joinRoom(roomId, playerId, username);
          
          // 加入Socket房间
          socket.join(roomId);
          socket.data.roomId = roomId;
          socket.data.playerId = playerId;
          socket.data.username = username; // 保存用户名
          clearTimeout(connectionTimeout);
          
          socketLogger(socket, 'room_joined', { roomId, username });
          
          // 检查故事是否已经初始化
          const roomData = room.toJSON();
          
          // 如果故事已存在，同步给新玩家
          if (roomData.story && roomData.story.chapters && roomData.story.chapters.length > 0) {
            console.log(`[新玩家加入] 玩家 ${username} 加入房间 ${roomId}，同步故事内容`);
            
            // 发送已有的章节内容
            roomData.story.chapters.forEach((chapter, index) => {
              socket.emit('new_chapter', {
                chapter: chapter,
                author: { id: 'system', username: '系统' },
                room: roomData,
                isSync: true // 标记这是同步消息
              });
            });
            
            // 为新玩家初始化故事机互动（获取当前章节的线索）
            const currentChapter = roomData.story.chapters[roomData.story.chapters.length - 1];
            if (currentChapter) {
              try {
                // 检查该玩家是否已有线索，如果没有则生成
                const existingClues = await database.getPlayerClues(currentChapter.id, playerId);
                
                if (existingClues.length === 0) {
                  console.log(`[新玩家加入] 为玩家 ${username} 生成专属线索`);
                  
                  // 为新玩家生成线索
                  const newPlayerClues = await gameEngine.generateCluesForNewPlayer(
                    roomId, 
                    currentChapter.id, 
                    { id: playerId, username }
                  );
                  
                  if (newPlayerClues && newPlayerClues.storyMachineMessage) {
                    socket.emit('story_machine_init', newPlayerClues.storyMachineMessage);
                    console.log(`[新玩家加入] 已向玩家 ${username} 发送故事机初始消息`);
                  }
                } else {
                  // 已有线索，发送已有的故事机消息
                  const storyMachineMessages = await database.getMessages(roomId, playerId, {
                    type: 'story_machine',
                    limit: 20
                  });
                  
                  storyMachineMessages.forEach(msg => {
                    socket.emit('new_message', {
                      id: msg.id,
                      type: msg.message_type,
                      visibility: msg.visibility,
                      sender: msg.sender_name,
                      senderId: msg.sender_id,
                      recipientId: msg.recipient_id,
                      recipientName: msg.recipient_name,
                      content: msg.content,
                      timestamp: new Date(msg.created_at),
                      chapterNumber: msg.chapter_number,
                      isPrivate: msg.visibility === 'private',
                      isSync: true
                    });
                  });
                }
                
                // 同步当前谜题信息
                const puzzle = await database.getChapterPuzzle(currentChapter.id);
                if (puzzle) {
                  socket.emit('new_puzzle', {
                    chapterId: currentChapter.id,
                    chapterNumber: currentChapter.chapterNumber,
                    question: puzzle.puzzle_question,
                    hints: puzzle.hints ? JSON.parse(puzzle.hints) : [],
                    hintsRevealed: 0
                  });
                }
              } catch (syncError) {
                console.error(`[新玩家加入] 同步故事内容失败:`, syncError);
              }
            }
          }
          
          callback({ success: true, room: roomData });
          
          // 广播房间更新
          io.to(roomId).emit('room_updated', roomData);
        } catch (error) {
          errorLogger(error, { event: 'join_room', socketId: socket.id });
          callback({ 
            success: false,
            error: error.message,
            code: error.code || 'INTERNAL_ERROR'
          });
        }
      }));
      
      // 发送消息（生成故事）
      socket.on('send_message', wrapSocketHandler('send_message', async (data, callback) => {
        const startTime = Date.now();
        
        try {
          const { message, messageType = 'global', recipientId, recipientName } = data;
          const { roomId, playerId } = socket.data;
          
          if (!roomId || !playerId) {
            return callback({ 
              success: false,
              error: '未加入房间',
              code: 'NOT_IN_ROOM'
            });
          }
          
          if (!message || message.trim().length === 0) {
            return callback({ 
              success: false,
              error: '消息不能为空',
              code: 'EMPTY_MESSAGE'
            });
          }
          
          if (message.length > 1000) {
            return callback({
              success: false,
              error: '消息过长（最大1000字符）',
              code: 'MESSAGE_TOO_LONG'
            });
          }
          
          // 验证消息类型
          const validTypes = ['global', 'private', 'player_to_player'];
          if (!validTypes.includes(messageType)) {
            return callback({
              success: false,
              error: '无效的消息类型',
              code: 'INVALID_MESSAGE_TYPE'
            });
          }
          
          // 如果是玩家间消息，必须指定接收者
          if (messageType === 'player_to_player' && !recipientId) {
            return callback({
              success: false,
              error: '玩家间消息必须指定接收者',
              code: 'MISSING_RECIPIENT'
            });
          }
          
          // 设置超时（60秒，因为AI生成可能需要较长时间）
          const timeout = setTimeout(() => {
            callback({
              success: false,
              error: '请求超时，请稍后重试',
              code: 'REQUEST_TIMEOUT'
            });
          }, 60000);
          
          // 对于全局消息，立即广播给其他玩家，不等待AI处理
          if (messageType === 'global') {
            // 先创建并广播玩家消息
            const tempMessage = {
              id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'global',
              visibility: 'global',
              senderId: playerId,
              sender: socket.data.username,
              content: message.trim(),
              timestamp: new Date(),
              roomId: roomId,
              isPrivate: false
            };
            
            // 立即广播给其他玩家
            socket.broadcast.to(roomId).emit('new_message', tempMessage);
            console.log(`[全局消息] 立即广播消息给房间 ${roomId} 的其他玩家`);
          }
          
          // 处理消息（包括AI响应等）
          console.log(`[send_message] 开始处理消息, 玩家: ${playerId}, 类型: ${messageType}, 房间: ${roomId}`);
          const result = await gameEngine.processMessage(
            roomId, 
            playerId, 
            message.trim(),
            messageType,
            recipientId,
            recipientName
          );
          console.log(`[send_message] 消息处理完成, storyMachineMessage存在: ${!!result.storyMachineMessage}`);
          clearTimeout(timeout);
          
          const room = gameEngine.getRoomStatus(roomId);
          const duration = Date.now() - startTime;
          
          socketLogger(socket, 'message_processed', { 
            roomId, 
            duration: `${duration}ms`,
            messageType,
            chapterNumber: result.chapter?.chapterNumber
          });
          
          callback({ 
            success: true, 
            message: result.message,
            chapter: result.chapter,
            room: room,
            duration
          });
          
          // 根据消息类型和可见性广播消息
          if (result.message) {
            const messageData = result.message;
            
            // 确定可见性
            let visibility = 'global';
            if (messageType === 'private') {
              visibility = 'private';
            } else if (messageType === 'player_to_player') {
              visibility = 'direct';
            }
            
            // 根据可见性发送给相应客户端
            if (visibility === 'global') {
              // 全局消息：已在上面立即广播，这里不需要再次广播
              // （保留注释以说明逻辑）
            } else if (visibility === 'private') {
              // 私密消息（故事机模式）：只发送给发送者自己（确认消息已收到）
              // 注意：发送者前端已添加临时消息，这里不需要再发送
            } else if (visibility === 'direct') {
              // 玩家间私聊消息：发送给接收者和发送者双方
              console.log(`[玩家私聊] 发送者: ${playerId}, 接收者: ${recipientId}`);
              
              // 发送给接收者
              const recipientSocket = Array.from(io.sockets.sockets.values())
                .find(s => s.data.playerId === recipientId && s.data.roomId === roomId);
              
              if (recipientSocket) {
                console.log(`[玩家私聊] 发送消息给接收者 ${recipientId}`);
                recipientSocket.emit('new_message', {
                  ...messageData,
                  visibility: 'direct',
                  type: 'player_to_player'
                });
              } else {
                console.log(`[玩家私聊] 警告: 找不到接收者 ${recipientId} 的socket连接`);
              }
              
              // 也发送给发送者（确保发送者能看到自己的消息）
              socket.emit('new_message', {
                ...messageData,
                visibility: 'direct',
                type: 'player_to_player'
              });
              console.log(`[玩家私聊] 发送消息确认给发送者 ${playerId}`);
            }
          }
          
          // 处理故事机回复消息（私聊模式）
          if (result.storyMachineMessage) {
            console.log(`[发送故事机消息] 准备发送故事机消息给玩家 ${playerId}, 消息ID: ${result.storyMachineMessage.id}`);
            // 发送故事机AI回复给玩家
            socket.emit('new_message', result.storyMachineMessage);
            console.log(`[发送故事机消息] 故事机消息已发送`);
          } else {
            console.log(`[发送故事机消息] 警告: result.storyMachineMessage 不存在，消息类型: ${messageType}`);
          }
          
          // 处理谜题验证结果 - 广播给所有玩家看到解谜进度
          if (result.puzzleValidation) {
            const currentChapter = gameEngine.getCurrentChapter(room.story);
            if (currentChapter) {
              // 获取当前谜题进度
              const puzzleProgress = await database.getAllPlayerPuzzleProgress(currentChapter.id, roomId);
              
              // 广播谜题进度更新（不透露答案，只显示谁已解开）
              io.to(roomId).emit('puzzle_progress_update', {
                chapterId: currentChapter.id,
                playerId: playerId,
                playerName: room.players.find(p => p.id === playerId)?.username || '未知玩家',
                isCorrect: result.puzzleValidation.isCorrect,
                solvedPlayers: puzzleProgress.filter(p => p.is_solved).map(p => ({
                  playerId: p.player_id,
                  playerName: room.players.find(pl => pl.id === p.player_id)?.username || '未知玩家'
                })),
                totalPlayers: room.players.length,
                solvedCount: puzzleProgress.filter(p => p.is_solved).length
              });
              
              console.log(`[谜题进度] 玩家 ${playerId} 尝试解谜，结果: ${result.puzzleValidation.isCorrect ? '正确' : '错误'}`);
            }
          }
          
          // 如果有AI生成的章节，广播给所有玩家
          if (result.chapter && messageType === 'global') {
            io.to(roomId).emit('new_chapter', {
              chapter: result.chapter,
              author: room.players.find(p => p.id === playerId),
              room: room
            });
          }
          
          // 处理故事机初始消息（章节生成后）
          if (result.interactionResult) {
            const { storyMachineMessages, todos, chapterId } = result.interactionResult;
            // 向每个玩家发送故事机初始消息
            storyMachineMessages.forEach(({ playerId: targetPlayerId, message }) => {
              const targetSocket = Array.from(io.sockets.sockets.values())
                .find(s => s.data.playerId === targetPlayerId && s.data.roomId === roomId);
              if (targetSocket) {
                targetSocket.emit('story_machine_init', message);
              }
            });
            
            // 广播TODO列表和进度信息给所有玩家
            const allPlayersProgress = await database.getAllPlayersProgress(chapterId);
            io.to(roomId).emit('feedback_progress_update', {
              chapterId,
              todos,
              playersProgress: allPlayersProgress
            });
          }
          
          // 处理反馈结果和进度更新
          if (result.feedbackResult) {
            const currentChapter = gameEngine.getCurrentChapter(room.story);
            if (currentChapter) {
              const allPlayersProgress = await database.getAllPlayersProgress(currentChapter.id);
              const todos = await database.getChapterTodos(currentChapter.id);
              
              // 发送进度更新给所有玩家
              io.to(roomId).emit('feedback_progress_update', {
                chapterId: currentChapter.id,
                todos,
                playersProgress: allPlayersProgress,
                playerId: playerId,
                feedbackResult: result.feedbackResult
              });
            }
          }
          
          // 处理章节推进结果（所有玩家解开谜题后）
          if (result.progressionResult && result.progressionResult.ready) {
            const { newChapter, interactionResult } = result.progressionResult;
            
            console.log(`[章节推进广播] 所有玩家解开谜题，推进到第 ${newChapter.chapterNumber} 章`);
            
            // 1. 先广播解谜成功消息
            io.to(roomId).emit('puzzle_all_solved', {
              message: '🎉 恭喜！所有玩家都成功解开了本章谜题！',
              chapterNumber: newChapter.chapterNumber - 1,
              nextChapterNumber: newChapter.chapterNumber
            });
            
            // 2. 广播新章节
            io.to(roomId).emit('new_chapter', {
              chapter: newChapter,
              author: { id: 'system', username: '系统' },
              room: room,
              triggeredBy: 'puzzle_solved'
            });
            
            // 3. 发送章节准备就绪事件
            io.to(roomId).emit('chapter_ready', {
              chapterId: newChapter.id,
              chapterNumber: newChapter.chapterNumber,
              message: '所有玩家解开谜题，新章节已生成'
            });
            
            // 4. 处理新章节的故事机初始消息（每个玩家专属线索）
            if (interactionResult) {
              const { storyMachineMessages, puzzle, playerClues, chapterId } = interactionResult;
              
              // 向每个玩家发送专属的故事机消息（包含线索）
              storyMachineMessages.forEach(({ playerId: targetPlayerId, message }) => {
                const targetSocket = Array.from(io.sockets.sockets.values())
                  .find(s => s.data.playerId === targetPlayerId && s.data.roomId === roomId);
                if (targetSocket) {
                  targetSocket.emit('story_machine_init', {
                    ...message,
                    chapterId: chapterId,
                    chapterNumber: newChapter.chapterNumber
                  });
                  console.log(`[章节推进广播] 已向玩家 ${targetPlayerId} 发送专属线索`);
                }
              });
              
              // 5. 广播谜题信息（只发送问题，不发送答案）
              if (puzzle) {
                io.to(roomId).emit('new_puzzle', {
                  chapterId: chapterId,
                  chapterNumber: newChapter.chapterNumber,
                  question: puzzle.question,
                  hints: puzzle.hints || [],
                  hintsRevealed: 0
                });
              }
            }
          }
        } catch (error) {
          errorLogger(error, { event: 'send_message', socketId: socket.id });
          callback({ 
            success: false,
            error: error.message,
            code: error.code || 'INTERNAL_ERROR'
          });
        }
      }, 10)); // 发送消息限制更严格，每分钟10次
      
      // 获取消息历史
      socket.on('get_messages', wrapSocketHandler('get_messages', async (data, callback) => {
        try {
          const { roomId } = data || socket.data;
          const { playerId } = socket.data;
          
          if (!roomId || !playerId) {
            return callback({
              success: false,
              error: '未加入房间',
              code: 'NOT_IN_ROOM'
            });
          }
          
          // 获取消息
          const messages = await database.getMessages(roomId, playerId, {
            limit: 100,
            offset: 0
          });
          
          // 转换为前端格式
          const formattedMessages = messages.reverse().map(msg => ({
            id: msg.id,
            type: msg.message_type,
            visibility: msg.visibility,
            sender: msg.sender_name,
            senderId: msg.sender_id,
            recipientId: msg.recipient_id,
            recipientName: msg.recipient_name,
            content: msg.content,
            timestamp: new Date(msg.created_at),
            chapterNumber: msg.chapter_number,
            isPrivate: msg.visibility === 'private'
          }));
          
          // 获取房间的故事信息
          const room = gameEngine.getRoomStatus(roomId);
          
          // 尝试从房间获取storyId，如果没有则从数据库查询
          let storyId = null;
          if (room && room.story && room.story.id) {
            storyId = room.story.id;
          } else {
            // 从数据库查询房间的storyId
            try {
              const roomData = await database.getRoom(roomId);
              if (roomData && roomData.story_id) {
                storyId = roomData.story_id;
              }
            } catch (err) {
              console.error('获取房间故事ID失败:', err);
            }
          }
          
          if (storyId) {
            // 加载章节数据并转换为消息
            const chapters = await database.getChapters(storyId);
            
            // 将章节转换为消息格式（如果还没有对应的消息）
            const chapterMessagesPromises = chapters
              .filter(ch => {
                // 只添加还没有对应消息的章节
                return !formattedMessages.find(m => 
                  m.chapterNumber === ch.chapter_number && m.type === 'chapter'
                );
              })
              .map(async (ch) => {
                // 获取作者信息
                let author = null;
                if (ch.author_id) {
                  try {
                    const authorData = await database.getPlayer(ch.author_id);
                    if (authorData) {
                      author = { username: authorData.username, id: authorData.id };
                    }
                  } catch (err) {
                    // 忽略错误，使用默认值
                  }
                }
                
                // 创建章节消息
                return {
                  id: ch.id,
                  type: 'chapter',
                  visibility: 'global',
                  sender: 'AI',
                  senderId: ch.author_id || 'ai',
                  content: ch.content,
                  timestamp: new Date(ch.created_at),
                  chapterNumber: ch.chapter_number,
                  isPrivate: false,
                  author: author
                };
              });
            
            const chapterMessages = await Promise.all(chapterMessagesPromises);
            
            // 合并消息和章节，按时间排序
            const allMessages = [...formattedMessages, ...chapterMessages]
              .filter((msg, index, self) => {
                // 去重：基于id或(chapterNumber + type)
                const key = msg.type === 'chapter' 
                  ? `chapter_${msg.chapterNumber}` 
                  : msg.id;
                return index === self.findIndex(m => 
                  (m.type === 'chapter' ? `chapter_${m.chapterNumber}` : m.id) === key
                );
              })
              .sort((a, b) => {
                const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                return timeA - timeB;
              });
            
            callback({
              success: true,
              messages: allMessages
            });
          } else {
            // 即使没有故事，也返回消息
            callback({
              success: true,
              messages: formattedMessages
            });
          }
        } catch (error) {
          errorLogger(error, { event: 'get_messages', socketId: socket.id });
          callback({
            success: false,
            error: error.message,
            code: error.code || 'INTERNAL_ERROR'
          });
        }
      }));
      
      // 获取房间状态
      socket.on('get_room_status', wrapSocketHandler('get_room_status', (data, callback) => {
        try {
          const { roomId } = data || socket.data;
          
          if (!roomId) {
            return callback({ 
              success: false,
              error: '未指定房间ID',
              code: 'MISSING_ROOM_ID'
            });
          }
          
          const status = gameEngine.getRoomStatus(roomId);
          
          if (!status) {
            return callback({ 
              success: false,
              error: '房间不存在',
              code: 'ROOM_NOT_FOUND'
            });
          }
          
          callback({ success: true, room: status });
        } catch (error) {
          errorLogger(error, { event: 'get_room_status', socketId: socket.id });
          callback({ 
            success: false,
            error: error.message,
            code: error.code || 'INTERNAL_ERROR'
          });
        }
      }));
      
      // ==================== 使用预制剧本初始化故事 ====================
      socket.on('initialize_with_script', wrapSocketHandler('initialize_with_script', async (data, callback) => {
        try {
          const { scriptId } = data;
          const { roomId, playerId } = socket.data;
          
          if (!roomId || !playerId) {
            return callback({ 
              success: false,
              error: '未加入房间',
              code: 'NOT_IN_ROOM'
            });
          }
          
          const roomStatus = gameEngine.getRoomStatus(roomId);
          if (!roomStatus) {
            return callback({ 
              success: false,
              error: '房间不存在',
              code: 'ROOM_NOT_FOUND'
            });
          }
          
          if (roomStatus.hostId !== playerId) {
            return callback({ 
              success: false,
              error: '只有房主可以初始化故事',
              code: 'PERMISSION_DENIED'
            });
          }
          
          if (!scriptId) {
            return callback({
              success: false,
              error: '请选择一个剧本',
              code: 'INVALID_INPUT'
            });
          }
          
          console.log(`📚 [剧本加载] 房间 ${roomId} 加载剧本 ${scriptId}`);
          
          // 发送初始化进度
          const sendProgress = (step, message) => {
            io.to(roomId).emit('initialization_progress', {
              step,
              total: 5,
              message
            });
          };
          
          sendProgress(1, '正在加载剧本数据...');
          
          // 使用剧本初始化故事（带进度回调）
          const result = await gameEngine.initializeWithScript(roomId, scriptId, sendProgress);
          
          const story = result.story;
          const room = result.room;
          
          sendProgress(5, '初始化完成！');
          
          socketLogger(socket, 'story_initialized_with_script', { roomId, storyId: story.id, scriptId });
          
          // 广播初始章节
          if (result.firstChapter) {
            io.to(roomId).emit('new_chapter', {
              chapter: result.firstChapter,
              author: { id: 'system', username: '系统' },
              room: room.toJSON()
            });
          }
          
          // 发送故事机初始消息给每个玩家（包含角色信息）
          if (result.characterAssignments) {
            result.characterAssignments.forEach(assignment => {
              const targetSocket = Array.from(io.sockets.sockets.values())
                .find(s => s.data.playerId === assignment.playerId && s.data.roomId === roomId);
              if (targetSocket) {
                targetSocket.emit('character_assigned', {
                  character: assignment.character,
                  message: `你将扮演 ${assignment.characterName}。\n\n${assignment.character.publicInfo}\n\n【秘密信息】\n${assignment.character.secretInfo}`
                });
              }
            });
          }
          
          // 广播TODO列表
          if (result.todos) {
            io.to(roomId).emit('feedback_progress_update', {
              chapterId: result.firstChapter?.id,
              todos: result.todos,
              playersProgress: {}
            });
          }
          
          callback({ 
            success: true, 
            room: room.toJSON(),
            storyOutline: result.storyOutline
          });
          
          // 广播故事初始化
          io.to(roomId).emit('story_initialized', {
            story: story.toJSON(),
            room: room.toJSON(),
            storyOutline: result.storyOutline,
            isPrebuiltScript: true,
            scriptId: scriptId
          });
          
          // 初始化增强游戏状态管理
          const players = roomStatus.players.map(p => ({ id: p.id, username: p.username }));
          await enhancedGameStateManager.initializeGameState(roomId, scriptId, players);
          console.log(`🎮 [增强状态] 已为房间 ${roomId} 初始化增强游戏状态`);
          
        } catch (error) {
          errorLogger(error, { event: 'initialize_with_script', socketId: socket.id });
          callback({ 
            success: false,
            error: error.message,
            code: error.code || 'INTERNAL_ERROR'
          });
        }
      }));
      
      // ==================== 使用技能 ====================
      socket.on('use_skill', wrapSocketHandler('use_skill', async (data, callback) => {
        try {
          const { skillId, targetCharacterId, targetInfo } = data;
          const { roomId, playerId } = socket.data;
          
          if (!roomId || !playerId) {
            return callback({ success: false, error: '未加入房间' });
          }
          
          const result = await enhancedGameStateManager.useSkill(
            roomId, 
            playerId, 
            skillId, 
            { targetCharacterId, ...targetInfo }
          );
          
          if (result.success) {
            socketLogger(socket, 'skill_used', { roomId, skillId, skillName: result.skillName });
            
            // 通知房间内所有玩家技能被使用（但不透露具体效果给其他人）
            socket.to(roomId).emit('player_used_skill', {
              playerId,
              skillName: result.skillName,
              message: `${socket.data.username} 使用了技能【${result.skillName}】`
            });
            
            callback({ 
              success: true, 
              skillName: result.skillName,
              effect: result.effect,
              message: result.message
            });
          } else {
            callback({ success: false, error: result.error });
          }
        } catch (error) {
          errorLogger(error, { event: 'use_skill', socketId: socket.id });
          callback({ success: false, error: error.message });
        }
      }));
      
      // ==================== 获取玩家技能列表 ====================
      socket.on('get_player_skills', wrapSocketHandler('get_player_skills', async (data, callback) => {
        try {
          const { roomId, playerId } = socket.data;
          
          if (!roomId || !playerId) {
            return callback({ success: false, error: '未加入房间' });
          }
          
          const skills = enhancedGameStateManager.getPlayerSkills(roomId, playerId);
          callback({ success: true, skills });
        } catch (error) {
          callback({ success: false, error: error.message });
        }
      }));
      
      // ==================== 获取凶手引导 ====================
      socket.on('get_murderer_guidance', wrapSocketHandler('get_murderer_guidance', async (data, callback) => {
        try {
          const { roomId, playerId } = socket.data;
          
          if (!roomId || !playerId) {
            return callback({ success: false, error: '未加入房间' });
          }
          
          const gameState = enhancedGameStateManager.getGameState(roomId);
          if (!gameState || gameState.murdererPlayerId !== playerId) {
            return callback({ success: false, error: '你不是凶手或游戏未开始' });
          }
          
          const guidance = await enhancedGameStateManager.getMurdererGuidance(roomId);
          callback({ success: true, guidance });
        } catch (error) {
          callback({ success: false, error: error.message });
        }
      }));
      
      // ==================== 推进章节 ====================
      socket.on('advance_chapter', wrapSocketHandler('advance_chapter', async (data, callback) => {
        try {
          const { roomId, playerId } = socket.data;
          
          if (!roomId || !playerId) {
            return callback({ success: false, error: '未加入房间' });
          }
          
          const roomStatus = gameEngine.getRoomStatus(roomId);
          if (roomStatus?.hostId !== playerId) {
            return callback({ success: false, error: '只有房主可以推进章节' });
          }
          
          const result = await enhancedGameStateManager.advanceChapter(roomId);
          
          if (result.canAdvance) {
            socketLogger(socket, 'chapter_advanced', { roomId, newChapter: result.newChapter });
            
            // 广播章节推进
            io.to(roomId).emit('chapter_advanced', {
              newChapter: result.newChapter,
              chapterTitle: result.chapterTitle,
              revealedLayers: result.revealedLayers,
              message: `故事进入第${result.newChapter}章：${result.chapterTitle || ''}`
            });
            
            callback({ success: true, ...result });
          } else {
            callback({ success: false, error: result.reason });
          }
        } catch (error) {
          errorLogger(error, { event: 'advance_chapter', socketId: socket.id });
          callback({ success: false, error: error.message });
        }
      }));
      
      // ==================== 与NPC对话 ====================
      socket.on('talk_to_npc', wrapSocketHandler('talk_to_npc', async (data, callback) => {
        try {
          const { npcCharacterId, message, isPrivate } = data;
          const { roomId, playerId } = socket.data;
          
          if (!roomId || !playerId) {
            return callback({ success: false, error: '未加入房间' });
          }
          
          const gameState = enhancedGameStateManager.getGameState(roomId);
          if (!gameState) {
            return callback({ success: false, error: '游戏状态不存在' });
          }
          
          const player = gameState.players.find(p => p.id === playerId);
          const npcService = getNpcDialogueService(AIService.provider);
          
          const result = await npcService.generateNpcResponse({
            scriptId: gameState.scriptId,
            npcCharacterId,
            playerMessage: message,
            playerName: player?.username || '玩家',
            isPrivate: isPrivate || false,
            gameContext: {
              currentChapter: gameState.currentChapter
            }
          });
          
          if (result.success) {
            socketLogger(socket, 'npc_dialogue', { roomId, npcCharacterId, isPrivate });
            
            // 如果是公开对话，广播给所有人
            if (!isPrivate) {
              io.to(roomId).emit('npc_response', {
                npcName: result.npcName,
                response: result.response,
                emotionalTone: result.emotionalTone,
                playerId,
                playerName: player?.username
              });
            }
            
            callback({ 
              success: true, 
              npcName: result.npcName,
              response: result.response,
              emotionalTone: result.emotionalTone,
              revealedInfo: result.revealedInfo
            });
          } else {
            callback({ success: false, error: '对话失败' });
          }
        } catch (error) {
          errorLogger(error, { event: 'talk_to_npc', socketId: socket.id });
          callback({ success: false, error: error.message });
        }
      }));
      
      // ==================== 提交最终指控 ====================
      socket.on('submit_accusation', wrapSocketHandler('submit_accusation', async (data, callback) => {
        try {
          const { accusedCharacterId, motive } = data;
          const { roomId, playerId } = socket.data;
          
          if (!roomId || !playerId) {
            return callback({ success: false, error: '未加入房间' });
          }
          
          // 记录指控
          enhancedGameStateManager.recordAccusation(roomId, playerId, accusedCharacterId, motive);
          
          socketLogger(socket, 'accusation_submitted', { roomId, accusedCharacterId });
          
          // 广播指控
          const gameState = enhancedGameStateManager.getGameState(roomId);
          const player = gameState?.players.find(p => p.id === playerId);
          const accusedPlayer = gameState?.players.find(p => p.characterId === accusedCharacterId);
          
          io.to(roomId).emit('accusation_made', {
            accuserId: playerId,
            accuserName: player?.username,
            accusedCharacterName: accusedPlayer?.characterName,
            motive,
            message: `${player?.username} 指控 ${accusedPlayer?.characterName} 是凶手！`
          });
          
          callback({ success: true });
        } catch (error) {
          callback({ success: false, error: error.message });
        }
      }));
      
      // ==================== 确定最终结局 ====================
      socket.on('determine_ending', wrapSocketHandler('determine_ending', async (data, callback) => {
        try {
          const { finalAccusation } = data;
          const { roomId, playerId } = socket.data;
          
          if (!roomId || !playerId) {
            return callback({ success: false, error: '未加入房间' });
          }
          
          const roomStatus = gameEngine.getRoomStatus(roomId);
          if (roomStatus?.hostId !== playerId) {
            return callback({ success: false, error: '只有房主可以结束游戏' });
          }
          
          const result = await enhancedGameStateManager.determineEnding(roomId, finalAccusation);
          
          if (result) {
            socketLogger(socket, 'game_ended', { roomId, ending: result.ending.ending_type });
            
            // 广播游戏结局
            io.to(roomId).emit('game_ended', {
              ending: result.ending,
              isCorrect: result.isCorrect,
              totalScore: result.totalScore,
              conditions: result.conditions,
              message: result.ending.ending_narration
            });
            
            // 清理游戏状态
            enhancedGameStateManager.clearGameState(roomId);
            
            callback({ success: true, ...result });
          } else {
            callback({ success: false, error: '无法确定结局' });
          }
        } catch (error) {
          errorLogger(error, { event: 'determine_ending', socketId: socket.id });
          callback({ success: false, error: error.message });
        }
      }));
      
      // ==================== 获取游戏进度 ====================
      socket.on('get_game_progress', wrapSocketHandler('get_game_progress', async (data, callback) => {
        try {
          const { roomId } = socket.data;
          
          if (!roomId) {
            return callback({ success: false, error: '未加入房间' });
          }
          
          const progress = enhancedGameStateManager.getProgressSummary(roomId);
          callback({ success: true, progress });
        } catch (error) {
          callback({ success: false, error: error.message });
        }
      }));
      
      // 初始化故事
      socket.on('initialize_story', wrapSocketHandler('initialize_story', async (data, callback) => {
        try {
          const { title, background } = data;
          const { roomId, playerId } = socket.data;
          
          if (!roomId || !playerId) {
            return callback({ 
              success: false,
              error: '未加入房间',
              code: 'NOT_IN_ROOM'
            });
          }
          
          const roomStatus = gameEngine.getRoomStatus(roomId);
          if (!roomStatus) {
            return callback({ 
              success: false,
              error: '房间不存在',
              code: 'ROOM_NOT_FOUND'
            });
          }
          
          if (roomStatus.hostId !== playerId) {
            return callback({ 
              success: false,
              error: '只有房主可以初始化故事',
              code: 'PERMISSION_DENIED'
            });
          }
          
          if (!title || title.trim().length === 0) {
            return callback({
              success: false,
              error: '故事标题不能为空',
              code: 'INVALID_INPUT'
            });
          }
          
          const result = await gameEngine.initializeStory(
            roomId, 
            title.trim(),
            background?.trim() || ''
          );
          
          const story = result.story;
          const room = result.room;
          
          socketLogger(socket, 'story_initialized', { roomId, storyId: story.id });
          
          // 处理初始章节和故事机互动
          if (result.firstChapter && result.interactionResult) {
            const { firstChapter, interactionResult } = result;
            
            // 广播初始章节
            io.to(roomId).emit('new_chapter', {
              chapter: firstChapter,
              author: { id: 'system', username: '系统' },
              room: room.toJSON()
            });
            
            // 发送故事机初始消息给每个玩家
            if (interactionResult.storyMachineMessages) {
              interactionResult.storyMachineMessages.forEach(({ playerId: targetPlayerId, message }) => {
                const targetSocket = Array.from(io.sockets.sockets.values())
                  .find(s => s.data.playerId === targetPlayerId && s.data.roomId === roomId);
                if (targetSocket) {
                  targetSocket.emit('story_machine_init', message);
                }
              });
            }
            
            // 广播TODO列表和进度信息
            if (interactionResult.todos && interactionResult.chapterId) {
              const allPlayersProgress = await database.getAllPlayersProgress(interactionResult.chapterId);
              io.to(roomId).emit('feedback_progress_update', {
                chapterId: interactionResult.chapterId,
                todos: interactionResult.todos,
                playersProgress: allPlayersProgress
              });
            }
          }
          
          callback({ success: true, room: room.toJSON() });
          
          // ★ 广播故事初始化（包含大纲） ★
          io.to(roomId).emit('story_initialized', {
            story: story.toJSON(),
            room: room.toJSON(),
            storyOutline: result.storyOutline || null  // 传递故事大纲给前端
          });
        } catch (error) {
          errorLogger(error, { event: 'initialize_story', socketId: socket.id });
          callback({ 
            success: false,
            error: error.message,
            code: error.code || 'INTERNAL_ERROR'
          });
        }
      }));
      
      // ==================== 角色和线索相关接口 ====================
      
      // 获取故事中的所有角色
      socket.on('get_characters', wrapSocketHandler('get_characters', async (data, callback) => {
        try {
          const { storyId } = data;
          const { roomId, playerId } = socket.data;
          
          console.log('📋 get_characters 请求:', { storyId, roomId, playerId });
          
          if (!roomId || !playerId) {
            console.log('❌ get_characters: 未加入房间');
            return callback({ success: false, error: '未加入房间', code: 'NOT_IN_ROOM' });
          }
          
          const characters = await database.getStoryCharacters(storyId);
          console.log('✅ get_characters 结果:', characters?.length || 0, '个角色');
          callback({ success: true, characters: characters || [] });
        } catch (error) {
          console.error('❌ get_characters 错误:', error);
          errorLogger(error, { event: 'get_characters', socketId: socket.id });
          callback({ success: false, error: error.message, code: 'INTERNAL_ERROR' });
        }
      }));
      
      // 获取单个角色详情和线索卡片
      socket.on('get_character_details', wrapSocketHandler('get_character_details', async (data, callback) => {
        try {
          const { characterId } = data;
          const { playerId } = socket.data;
          
          if (!playerId) {
            return callback({ success: false, error: '未加入房间', code: 'NOT_IN_ROOM' });
          }
          
          // 获取角色信息
          const character = await database.getCharacter(characterId);
          if (!character) {
            return callback({ success: false, error: '角色不存在', code: 'NOT_FOUND' });
          }
          
          // 获取该玩家可见的线索卡片
          const clueCards = await database.getCharacterClueCards(characterId, playerId);
          
          // 获取玩家角色信息（用于判断特殊权限）
          const playerRole = await database.getPlayerRole(character.story_id, playerId);
          
          callback({ 
            success: true, 
            character: {
              ...character,
              // 隐藏某些敏感信息（如完整秘密）
              secret: playerRole?.discovered_clues?.includes('secret_' + characterId) 
                ? character.secret 
                : '???'
            },
            clueCards,
            playerRole
          });
        } catch (error) {
          errorLogger(error, { event: 'get_character_details', socketId: socket.id });
          callback({ success: false, error: error.message, code: 'INTERNAL_ERROR' });
        }
      }));
      
      // 发现线索
      socket.on('discover_clue', wrapSocketHandler('discover_clue', async (data, callback) => {
        try {
          const { clueCardId, storyId } = data;
          const { playerId, roomId } = socket.data;
          
          if (!playerId) {
            return callback({ success: false, error: '未加入房间', code: 'NOT_IN_ROOM' });
          }
          
          // 标记线索为已发现
          await database.discoverClue(clueCardId, playerId);
          
          // 更新玩家发现的线索记录
          await database.updatePlayerDiscoveredClues(storyId, playerId, clueCardId);
          
          // 广播给房间内所有玩家（但不透露具体内容）
          io.to(roomId).emit('clue_discovered', {
            playerId,
            clueCardId,
            message: '有玩家发现了新线索！'
          });
          
          callback({ success: true });
        } catch (error) {
          errorLogger(error, { event: 'discover_clue', socketId: socket.id });
          callback({ success: false, error: error.message, code: 'INTERNAL_ERROR' });
        }
      }));
      
      // 获取玩家在故事中的角色
      socket.on('get_player_role', wrapSocketHandler('get_player_role', async (data, callback) => {
        try {
          const { storyId } = data;
          const { playerId } = socket.data;
          
          console.log('🎭 get_player_role 请求:', { storyId, playerId });
          
          if (!playerId) {
            console.log('❌ get_player_role: 未加入房间');
            return callback({ success: false, error: '未加入房间', code: 'NOT_IN_ROOM' });
          }
          
          const role = await database.getPlayerRole(storyId, playerId);
          console.log('✅ get_player_role 结果:', role ? '找到角色' : '无角色');
          callback({ success: true, role });
        } catch (error) {
          console.error('❌ get_player_role 错误:', error);
          errorLogger(error, { event: 'get_player_role', socketId: socket.id });
          callback({ success: false, error: error.message, code: 'INTERNAL_ERROR' });
        }
      }));
      
      // 记录玩家互动（用于AI生成剧情参考）
      socket.on('record_interaction', wrapSocketHandler('record_interaction', async (data, callback) => {
        try {
          const { storyId, chapterId, interactionType, targetCharacter, actionDescription } = data;
          const { playerId } = socket.data;
          
          if (!playerId) {
            return callback({ success: false, error: '未加入房间', code: 'NOT_IN_ROOM' });
          }
          
          const { v4: uuidv4 } = await import('uuid');
          await database.recordPlayerInteraction({
            id: uuidv4(),
            storyId,
            chapterId,
            playerId,
            interactionType,
            targetCharacter,
            actionDescription
          });
          
          callback({ success: true });
        } catch (error) {
          errorLogger(error, { event: 'record_interaction', socketId: socket.id });
          callback({ success: false, error: error.message, code: 'INTERNAL_ERROR' });
        }
      }));
      
      // 连接错误处理
      socket.on('error', (error) => {
        errorLogger(error, { event: 'socket_error', socketId: socket.id });
      });
      
      // 断开连接
      socket.on('disconnect', async (reason) => {
        clearTimeout(connectionTimeout);
        const { roomId, playerId } = socket.data;
        
        socketLogger(socket, 'disconnect', { reason, roomId, playerId });
        
        if (roomId && playerId) {
          try {
            await gameEngine.leaveRoom(roomId, playerId);
            const room = gameEngine.getRoomStatus(roomId);
            
            if (room) {
              io.to(roomId).emit('room_updated', room);
              io.to(roomId).emit('player_left', {
                playerId,
                room: room
              });
            }
          } catch (error) {
            errorLogger(error, { event: 'disconnect_error', socketId: socket.id });
          }
        }
      });
    });
  }
  
  async start() {
    try {
      // 验证配置
      config.validate();
      
      // 连接数据库
      await database.connect();
      
      // 初始化剧本工厂
      try {
        await initScriptFactory();
        // 设置AI提供者（如果AIService已初始化）
        if (AIService.provider) {
          scriptGenerator.setAIProvider(AIService.provider);
          console.log('📝 剧本工厂 AI 已连接');
        }
        console.log('🎭 剧本工厂已启动');
        console.log('   管理后台: http://localhost:' + config.port + '/admin/scripts');
      } catch (err) {
        console.warn('剧本工厂初始化警告:', err.message);
      }
      
      // 启动服务器
      this.httpServer.listen(config.port, () => {
        console.log(`\n🚀 StoryWeaver 服务器启动成功!`);
        console.log(`📡 端口: ${config.port}`);
        console.log(`🤖 AI提供商: ${config.aiProvider}`);
        console.log(`💾 数据库: ${config.dbPath}`);
        console.log(`\n等待客户端连接...\n`);
      });
    } catch (error) {
      console.error('服务器启动失败:', error);
      process.exit(1);
    }
  }
  
  async stop() {
    console.log('\n正在关闭服务器...');
    
    try {
      // 断开所有Socket连接
      this.io.disconnectSockets(true);
      
      // 关闭HTTP服务器
      return new Promise((resolve) => {
        this.httpServer.close(async () => {
          try {
            // 关闭数据库连接
            await database.close();
            console.log('服务器已优雅关闭');
            resolve();
          } catch (error) {
            console.error('关闭数据库时出错:', error);
            resolve();
          }
        });
      });
    } catch (error) {
      console.error('关闭服务器时出错:', error);
      process.exit(1);
    }
  }
}

// 启动服务器
const server = new StoryWeaverServer();
server.start();

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n正在关闭服务器...');
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n正在关闭服务器...');
  await server.stop();
  process.exit(0);
});

