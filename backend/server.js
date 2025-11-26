import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import os from 'os';
import config from './config/index.js';
import database from './storage/database.js';
import gameEngine from './game-engine/GameEngine.js';
import { errorHandler, asyncHandler, AppError, socketErrorHandler } from './middleware/errorHandler.js';
import { requestLogger, socketLogger, errorLogger } from './middleware/logger.js';
import rateLimiter from './middleware/rateLimiter.js';
import { metricsMiddleware, metricsEndpoint } from './middleware/metrics.js';

class StoryWeaverServer {
  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
    
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
          clearTimeout(connectionTimeout);
          
          socketLogger(socket, 'room_joined', { roomId, username });
          
          callback({ success: true, room: room.toJSON() });
          
          // 广播房间更新
          io.to(roomId).emit('room_updated', room.toJSON());
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
          
          // 设置超时（30秒）
          const timeout = setTimeout(() => {
            callback({
              success: false,
              error: '请求超时，请稍后重试',
              code: 'REQUEST_TIMEOUT'
            });
          }, 30000);
          
          // 处理消息
          const result = await gameEngine.processMessage(
            roomId, 
            playerId, 
            message.trim(),
            messageType,
            recipientId,
            recipientName
          );
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
              // 全局消息：发送给房间内所有玩家
              io.to(roomId).emit('new_message', messageData);
            } else if (visibility === 'private') {
              // 私密消息：只发送给发送者
              socket.emit('new_message', messageData);
            } else if (visibility === 'direct') {
              // 玩家间消息：发送给发送者和接收者
              const recipientSocket = Array.from(io.sockets.sockets.values())
                .find(s => s.data.playerId === recipientId && s.data.roomId === roomId);
              
              socket.emit('new_message', messageData);
              if (recipientSocket) {
                recipientSocket.emit('new_message', messageData);
              }
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
          
          // 处理章节推进结果
          if (result.progressionResult && result.progressionResult.ready) {
            const { newChapter, interactionResult } = result.progressionResult;
            
            // 广播新章节
            io.to(roomId).emit('new_chapter', {
              chapter: newChapter,
              author: { id: 'system', username: '系统' },
              room: room
            });
            
            // 发送章节准备就绪事件
            io.to(roomId).emit('chapter_ready', {
              chapterId: newChapter.id,
              chapterNumber: newChapter.chapterNumber,
              message: '所有玩家反馈收集完成，新章节已生成'
            });
            
            // 处理新章节的故事机初始消息
            if (interactionResult) {
              const { storyMachineMessages, todos, chapterId } = interactionResult;
              storyMachineMessages.forEach(({ playerId: targetPlayerId, message }) => {
                const targetSocket = Array.from(io.sockets.sockets.values())
                  .find(s => s.data.playerId === targetPlayerId && s.data.roomId === roomId);
                if (targetSocket) {
                  targetSocket.emit('story_machine_init', message);
                }
              });
              
              // 广播TODO列表和进度信息
              const allPlayersProgress = await database.getAllPlayersProgress(chapterId);
              io.to(roomId).emit('feedback_progress_update', {
                chapterId,
                todos,
                playersProgress: allPlayersProgress
              });
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
          
          // 广播故事初始化
          io.to(roomId).emit('story_initialized', {
            story: story.toJSON(),
            room: room.toJSON()
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

