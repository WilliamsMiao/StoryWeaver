import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import socketManager from '../utils/socket';

const GameContext = createContext();

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within GameProvider');
  }
  return context;
};

export const GameProvider = ({ children }) => {
  const [socketConnected, setSocketConnected] = useState(false);
  const [player, setPlayer] = useState(() => {
    const saved = localStorage.getItem('storyweaver_player');
    return saved ? JSON.parse(saved) : null;
  });
  const [room, setRoom] = useState(() => {
    // 从 localStorage 恢复房间信息
    const saved = localStorage.getItem('storyweaver_room');
    return saved ? JSON.parse(saved) : null;
  });
  const [story, setStory] = useState(() => {
    // 从 localStorage 恢复故事信息
    const saved = localStorage.getItem('storyweaver_story');
    return saved ? JSON.parse(saved) : null;
  });
  const [messages, setMessages] = useState([]);
  const [storyMachineMessages, setStoryMachineMessages] = useState([]); // 故事机消息列表
  const [directMessages, setDirectMessages] = useState([]); // 玩家间私聊消息
  const [unreadDirectCount, setUnreadDirectCount] = useState(0); // 未读私聊消息数
  const [loading, setLoading] = useState(false);
  const [storyInitializing, setStoryInitializing] = useState(false); // 故事正在初始化中
  const [error, setError] = useState(null);
  const [playersProgress, setPlayersProgress] = useState({}); // 玩家反馈进度
  const [chapterTodos, setChapterTodos] = useState([]); // 章节TODO列表
  const [isRejoining, setIsRejoining] = useState(false); // 是否正在重新加入房间
  const [currentPuzzle, setCurrentPuzzle] = useState(null); // 当前章节谜题
  const [puzzleProgress, setPuzzleProgress] = useState({}); // 谜题解决进度
  const [puzzleSolvedNotification, setPuzzleSolvedNotification] = useState(null); // 解谜成功通知

    // 初始化Socket连接
  useEffect(() => {
    socketManager.connect();
    
    const handleConnectionStatus = (status) => {
      setSocketConnected(status.connected);
    };
    
    const handleRoomUpdated = (roomData) => {
      setRoom(roomData);
      if (roomData.story) {
        setStory(roomData.story);
      }
    };
    
    const handleNewMessage = (messageData) => {
      console.log('收到新消息:', messageData);
      
      // 根据消息可见性和类型决定是否添加到消息列表
      // 故事机消息需要特殊处理：接收者是当前玩家时可见
      const isStoryMachineMessage = messageData.type === 'story_machine' || 
        (messageData.type === 'private' && messageData.senderId === 'ai');
      
      // 是否为玩家间私聊消息
      const isDirectMessage = messageData.visibility === 'direct' || messageData.type === 'player_to_player';
      
      const isVisible = 
        messageData.visibility === 'global' ||
        // 私密消息：发送者是当前玩家，或者是故事机发给当前玩家的消息
        (messageData.visibility === 'private' && (
          messageData.senderId === player?.id || 
          (isStoryMachineMessage && messageData.recipientId === player?.id)
        )) ||
        // 玩家间私聊：发送者或接收者是当前玩家
        (isDirectMessage && (messageData.senderId === player?.id || messageData.recipientId === player?.id));
      
      console.log('消息可见性检查:', { 
        isVisible, 
        visibility: messageData.visibility, 
        type: messageData.type, 
        senderId: messageData.senderId, 
        recipientId: messageData.recipientId,
        playerId: player?.id,
        isStoryMachineMessage,
        isDirectMessage
      });
      
      if (isVisible) {
        const formattedMessage = {
          id: messageData.id,
          type: messageData.type,
          visibility: messageData.visibility,
          sender: messageData.sender,
          senderId: messageData.senderId,
          recipientId: messageData.recipientId,
          recipientName: messageData.recipientName,
          content: messageData.content,
          timestamp: new Date(messageData.timestamp),
          chapterNumber: messageData.chapterNumber,
          isPrivate: messageData.isPrivate
        };
        
        console.log('格式化后的消息:', formattedMessage);
        
        // 根据消息类型分类存储
        if (isDirectMessage) {
          // 玩家间私聊消息
          // 如果是自己发送的消息，跳过（前端发送时已经添加了临时消息）
          if (messageData.senderId === player?.id) {
            console.log('跳过自己发送的私聊消息（已有临时消息）');
            return;
          }
          console.log('添加到玩家私聊消息', formattedMessage);
          setDirectMessages(prev => {
            if (prev.find(m => m.id === messageData.id)) {
              console.log('消息已存在，跳过重复添加');
              return prev;
            }
            return [...prev, formattedMessage];
          });
          // 如果是收到的消息（不是自己发的），增加未读计数
          if (messageData.senderId !== player?.id) {
            setUnreadDirectCount(prev => prev + 1);
          }
        } else if (isStoryMachineMessage || 
            (messageData.type === 'private' && messageData.visibility === 'private')) {
          // 故事机消息（包括AI回复和玩家发送的私密消息）
          console.log('添加到故事机消息');
          setStoryMachineMessages(prev => {
            if (prev.find(m => m.id === messageData.id)) {
              return prev;
            }
            return [...prev, formattedMessage];
          });
        } else {
          // 其他消息（全局消息、章节等）添加到主消息列表
          console.log('添加到主消息列表');
          setMessages(prev => {
            if (prev.find(m => m.id === messageData.id)) {
              return prev;
            }
            return [...prev, formattedMessage];
          });
        }
      } else {
        console.log('消息不可见，跳过');
      }
      
      // 更新房间状态
      if (messageData.room) {
        setRoom(messageData.room);
        if (messageData.room.story) {
          setStory(messageData.room.story);
        }
      }
    };
    
    const handleNewChapter = (data) => {
      if (data.chapter) {
        setMessages(prev => {
          // 避免重复添加
          const chapterId = data.chapter.id || `chapter_${Date.now()}`;
          if (prev.find(m => m.id === chapterId)) {
            return prev;
          }
          return [...prev, {
            id: chapterId,
            type: 'chapter',
            content: data.chapter.content || '',
            author: data.author,
            chapterNumber: data.chapter.chapterNumber || 0,
            timestamp: new Date(data.chapter.createdAt || Date.now())
          }];
        });
      }
      
      if (data.room) {
        setRoom(data.room);
        if (data.room.story) {
          setStory(data.room.story);
        }
      }
    };
    
    const handleStoryInitialized = (data) => {
      setStory(data.story);
      setRoom(data.room);
    };
    
    const handleStoryMachineInit = (messageData) => {
      // 接收故事机主动发送的初始消息
      const formattedMessage = {
        id: messageData.id,
        type: messageData.type,
        visibility: messageData.visibility,
        sender: messageData.sender,
        senderId: messageData.senderId,
        recipientId: messageData.recipientId,
        recipientName: messageData.recipientName,
        content: messageData.content,
        timestamp: new Date(messageData.timestamp),
        isPrivate: messageData.isPrivate
      };
      
      setStoryMachineMessages(prev => {
        if (prev.find(m => m.id === messageData.id)) {
          return prev;
        }
        return [...prev, formattedMessage];
      });
    };
    
    const handleFeedbackProgressUpdate = (data) => {
      // 更新玩家反馈进度
      if (data.playersProgress) {
        const progressMap = {};
        data.playersProgress.forEach(progress => {
          progressMap[progress.player_id] = {
            completionRate: progress.overallCompletionRate || 0,
            completedTodos: progress.completedTodos || 0,
            totalTodos: progress.totalTodos || 0
          };
        });
        setPlayersProgress(prev => ({ ...prev, ...progressMap }));
      }
      
      // 更新TODO列表
      if (data.todos) {
        setChapterTodos(data.todos);
      }
    };
    
    const handleChapterReady = (data) => {
      // 章节准备就绪提示
      console.log('章节准备就绪:', data);
      // 可以在这里显示通知或更新UI
    };
    
    // 处理谜题进度更新
    const handlePuzzleProgressUpdate = (data) => {
      console.log('谜题进度更新:', data);
      setPuzzleProgress({
        chapterId: data.chapterId,
        solvedPlayers: data.solvedPlayers || [],
        totalPlayers: data.totalPlayers || 0,
        solvedCount: data.solvedCount || 0,
        isCorrect: data.isCorrect,
        playerId: data.playerId,
        playerName: data.playerName
      });
      
      // 如果有玩家刚解开谜题，显示通知
      if (data.isCorrect && data.playerId !== player?.id) {
        // 其他玩家解开了谜题
        console.log(`玩家 ${data.playerName} 解开了谜题！`);
      }
    };
    
    // 处理所有玩家解开谜题
    const handlePuzzleAllSolved = (data) => {
      console.log('所有玩家解开谜题:', data);
      setPuzzleSolvedNotification({
        message: data.message,
        chapterNumber: data.chapterNumber,
        nextChapterNumber: data.nextChapterNumber,
        timestamp: new Date()
      });
      
      // 3秒后清除通知
      setTimeout(() => {
        setPuzzleSolvedNotification(null);
      }, 5000);
    };
    
    // 处理新谜题
    const handleNewPuzzle = (data) => {
      console.log('收到新谜题:', data);
      setCurrentPuzzle({
        chapterId: data.chapterId,
        chapterNumber: data.chapterNumber,
        question: data.question,
        hints: data.hints || [],
        hintsRevealed: data.hintsRevealed || 0
      });
      
      // 重置谜题进度
      setPuzzleProgress({});
    };
    
    socketManager.on('connection_status', handleConnectionStatus);
    socketManager.on('room_updated', handleRoomUpdated);
    socketManager.on('new_message', handleNewMessage);
    socketManager.on('new_chapter', handleNewChapter);
    socketManager.on('story_initialized', handleStoryInitialized);
    socketManager.on('story_machine_init', handleStoryMachineInit);
    socketManager.on('feedback_progress_update', handleFeedbackProgressUpdate);
    socketManager.on('chapter_ready', handleChapterReady);
    socketManager.on('puzzle_progress_update', handlePuzzleProgressUpdate);
    socketManager.on('puzzle_all_solved', handlePuzzleAllSolved);
    socketManager.on('new_puzzle', handleNewPuzzle);
    
    return () => {
      socketManager.off('connection_status', handleConnectionStatus);
      socketManager.off('room_updated', handleRoomUpdated);
      socketManager.off('new_message', handleNewMessage);
      socketManager.off('new_chapter', handleNewChapter);
      socketManager.off('story_initialized', handleStoryInitialized);
      socketManager.off('story_machine_init', handleStoryMachineInit);
      socketManager.off('feedback_progress_update', handleFeedbackProgressUpdate);
      socketManager.off('chapter_ready', handleChapterReady);
      socketManager.off('puzzle_progress_update', handlePuzzleProgressUpdate);
      socketManager.off('puzzle_all_solved', handlePuzzleAllSolved);
      socketManager.off('new_puzzle', handleNewPuzzle);
    };
  }, []);

  // 保存房间和故事信息到 localStorage
  useEffect(() => {
    if (room) {
      localStorage.setItem('storyweaver_room', JSON.stringify(room));
    }
  }, [room]);

  useEffect(() => {
    if (story) {
      localStorage.setItem('storyweaver_story', JSON.stringify(story));
    }
  }, [story]);

  // 刷新页面后自动重新加入房间
  useEffect(() => {
    const savedRoom = localStorage.getItem('storyweaver_room');
    const savedPlayer = localStorage.getItem('storyweaver_player');
    
    if (savedRoom && savedPlayer && socketConnected && !isRejoining) {
      const roomData = JSON.parse(savedRoom);
      const playerData = JSON.parse(savedPlayer);
      
      // 自动重新加入房间
      setIsRejoining(true);
      console.log('刷新页面后自动重新加入房间:', roomData.id);
      
      socketManager.emit('join_room', {
        roomId: roomData.id,
        playerId: playerData.id,
        username: playerData.username
      }, (response) => {
        setIsRejoining(false);
        if (response.error) {
          console.error('重新加入房间失败:', response.error);
          // 如果房间不存在了，清理 localStorage
          if (response.code === 'ROOM_NOT_FOUND') {
            localStorage.removeItem('storyweaver_room');
            localStorage.removeItem('storyweaver_story');
            setRoom(null);
            setStory(null);
          }
        } else {
          console.log('成功重新加入房间');
          setRoom(response.room);
          if (response.room.story) {
            setStory(response.room.story);
          }
          
          // 加载消息历史
          socketManager.emit('get_messages', {}, (msgResponse) => {
            if (msgResponse && msgResponse.success && msgResponse.messages) {
              console.log('重新加载消息历史:', msgResponse.messages.length, '条消息');
              
              // 转换消息格式并分类
              const formattedMessages = msgResponse.messages.map(msg => {
                if (msg.type === 'chapter' && msg.author) {
                  return {
                    id: msg.id,
                    type: msg.type,
                    visibility: msg.visibility || 'global',
                    sender: msg.sender || 'AI',
                    senderId: msg.senderId || 'ai',
                    author: msg.author,
                    recipientId: msg.recipientId,
                    recipientName: msg.recipientName,
                    content: msg.content,
                    timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp),
                    chapterNumber: msg.chapterNumber,
                    isPrivate: false
                  };
                }
                
                return {
                  id: msg.id,
                  type: msg.type,
                  visibility: msg.visibility,
                  sender: msg.sender,
                  senderId: msg.senderId,
                  recipientId: msg.recipientId,
                  recipientName: msg.recipientName,
                  content: msg.content,
                  timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp),
                  chapterNumber: msg.chapterNumber,
                  isPrivate: msg.isPrivate
                };
              });
              
              // 分离故事机消息和主消息
              const storyMachineMsgs = formattedMessages.filter(m => 
                (m.type === 'private' || m.type === 'story_machine') && 
                (m.visibility === 'private' || m.senderId === 'ai') &&
                m.type !== 'chapter'
              );
              
              const mainMsgs = formattedMessages.filter(m => 
                m.type === 'global' || 
                m.type === 'chapter' || 
                m.type === 'ai' || 
                m.type === 'system' ||
                (m.type !== 'private' && m.type !== 'story_machine')
              );
              
              setMessages(mainMsgs);
              setStoryMachineMessages(storyMachineMsgs);
            }
          });
        }
      });
    }
  }, [socketConnected, isRejoining]);

  // 保存玩家信息
  const savePlayer = useCallback((playerData) => {
    setPlayer(playerData);
    localStorage.setItem('storyweaver_player', JSON.stringify(playerData));
  }, []);

  // 创建房间
  const createRoom = useCallback((roomName, background, aiProvider) => {
    if (!player) {
      setError('请先设置用户名');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    socketManager.emit('create_room', {
      name: roomName,
      playerId: player.id,
      username: player.username
    }, (response) => {
      setLoading(false);
      if (response.error) {
        setError(response.error);
      } else {
        setRoom(response.room);
        if (response.room.story) {
          setStory(response.room.story);
        }
      }
    });
  }, [player]);

  // 加入房间
  const joinRoom = useCallback((roomId) => {
    if (!player) {
      setError('请先设置用户名');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    socketManager.emit('join_room', {
      roomId,
      playerId: player.id,
      username: player.username
    }, (response) => {
      setLoading(false);
      if (response.error) {
        setError(response.error);
      } else {
        setRoom(response.room);
        if (response.room.story) {
          setStory(response.room.story);
        }
        
        // 加载消息历史
        socketManager.emit('get_messages', {}, (msgResponse) => {
          if (msgResponse && msgResponse.success && msgResponse.messages) {
            console.log('加载消息历史:', msgResponse.messages.length, '条消息');
            
            // 转换消息格式并分类
            const formattedMessages = msgResponse.messages.map(msg => {
              // 处理章节消息的特殊格式
              if (msg.type === 'chapter' && msg.author) {
                return {
                  id: msg.id,
                  type: msg.type,
                  visibility: msg.visibility || 'global',
                  sender: msg.sender || 'AI',
                  senderId: msg.senderId || 'ai',
                  author: msg.author, // 保留author信息
                  recipientId: msg.recipientId,
                  recipientName: msg.recipientName,
                  content: msg.content,
                  timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp),
                  chapterNumber: msg.chapterNumber,
                  isPrivate: false
                };
              }
              
              return {
                id: msg.id,
                type: msg.type,
                visibility: msg.visibility,
                sender: msg.sender,
                senderId: msg.senderId,
                recipientId: msg.recipientId,
                recipientName: msg.recipientName,
                content: msg.content,
                timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp),
                chapterNumber: msg.chapterNumber,
                isPrivate: msg.isPrivate
              };
            });
            
            console.log('格式化后的消息:', formattedMessages);
            
            // 分离故事机消息和主消息
            // 故事机消息：private类型或story_machine类型，且visibility为private，且不是章节
            const storyMachineMsgs = formattedMessages.filter(m => 
              (m.type === 'private' || m.type === 'story_machine') && 
              (m.visibility === 'private' || m.senderId === 'ai') &&
              m.type !== 'chapter'
            );
            
            // 主消息：全局消息、章节、系统消息、玩家间消息等
            const mainMsgs = formattedMessages.filter(m => 
              m.type === 'global' || 
              m.type === 'chapter' || 
              m.type === 'ai' || 
              m.type === 'system' || 
              m.type === 'player_to_player' ||
              (m.visibility === 'global' && m.type !== 'private' && m.type !== 'story_machine') ||
              (m.type !== 'private' && m.type !== 'story_machine' && m.visibility !== 'private')
            );
            
            console.log('主消息数量:', mainMsgs.length, '故事机消息数量:', storyMachineMsgs.length);
            
            setStoryMachineMessages(storyMachineMsgs);
            setMessages(mainMsgs);
          } else {
            console.warn('加载消息历史失败或没有消息:', msgResponse);
          }
        });
      }
    });
  }, [player]);

  // 初始化故事
  const initializeStory = useCallback((title, background) => {
    return new Promise((resolve, reject) => {
      if (!room) {
        setError('未加入房间');
        reject(new Error('未加入房间'));
        return;
      }
      
      setLoading(true);
      setStoryInitializing(true);
      setError(null);
      
      console.log('发送 initialize_story 请求:', { title, background });
      
      socketManager.emit('initialize_story', {
        title,
        background
      }, (response) => {
        console.log('收到 initialize_story 响应:', response);
        setLoading(false);
        setStoryInitializing(false);
        if (response.error) {
          setError(response.error);
          reject(new Error(response.error));
        } else {
          setStory(response.room.story);
          setRoom(response.room);
          resolve(response);
        }
      });
    });
  }, [room]);

  // 发送消息
  const sendMessage = useCallback((message, messageType = 'global', recipientId = null, recipientName = null) => {
    if (!room || !player) {
      setError('未加入房间或未设置用户名');
      return;
    }
    
    if (!message.trim()) {
      return;
    }
    
    // 添加玩家消息到列表（临时显示，等待服务器确认）
    const tempMessageId = `temp_${Date.now()}`;
    const playerMessage = {
      id: tempMessageId,
      type: messageType,
      visibility: messageType === 'private' ? 'private' : messageType === 'player_to_player' ? 'direct' : 'global',
      sender: player.username,
      senderId: player.id,
      recipientId: recipientId,
      recipientName: recipientName,
      content: message,
      timestamp: new Date(),
      isPrivate: messageType === 'private'
    };
    
    // 根据消息类型添加到不同的列表
    if (messageType === 'private') {
      // 故事机私聊消息
      setStoryMachineMessages(prev => [...prev, playerMessage]);
    } else if (messageType === 'player_to_player') {
      // 玩家间私聊消息
      setDirectMessages(prev => [...prev, playerMessage]);
    } else {
      // 全局消息添加到主消息列表
      setMessages(prev => [...prev, playerMessage]);
    }
    
    setLoading(true);
    
    socketManager.emit('send_message', {
      message,
      messageType,
      recipientId,
      recipientName
    }, (response) => {
      setLoading(false);
      
      if (!response || !response.success) {
        // 处理错误
        const errorMsg = response?.error || '发送消息失败';
        setError(errorMsg);
        console.error('发送消息失败:', errorMsg);
        // 移除临时消息（如果失败）
        if (messageType === 'private') {
          setStoryMachineMessages(prev => prev.filter(m => m.id !== tempMessageId));
        } else if (messageType === 'player_to_player') {
          setDirectMessages(prev => prev.filter(m => m.id !== tempMessageId));
        } else {
          setMessages(prev => prev.filter(m => m.id !== tempMessageId));
        }
        return;
      }
      
      // 成功：保留临时消息（全局消息会收到广播，私聊消息保持不变）
      // 注意：全局消息发送成功后，其他玩家会收到广播，但发送者不会收到自己的消息广播
      // 所以临时消息作为正式消息保留
      
      // 更新房间和故事
      if (response.room) {
        setRoom(response.room);
        if (response.room.story) {
          setStory(response.room.story);
        }
      }
    });
  }, [room, player]);

  // 清除未读私聊计数
  const clearUnreadDirectCount = useCallback(() => {
    setUnreadDirectCount(0);
  }, []);

  // 离开房间
  const leaveRoom = useCallback(() => {
    setRoom(null);
    setStory(null);
    setMessages([]);
    setStoryMachineMessages([]);
    setDirectMessages([]);
    setUnreadDirectCount(0);
    setError(null);
    // 清理 localStorage 中的房间和故事信息
    localStorage.removeItem('storyweaver_room');
    localStorage.removeItem('storyweaver_story');
  }, []);

  const value = {
    socketConnected,
    player,
    room,
    story,
    messages,
    storyMachineMessages,
    directMessages,
    unreadDirectCount,
    playersProgress,
    chapterTodos,
    loading,
    storyInitializing,
    error,
    // 新增谜题相关状态
    currentPuzzle,
    puzzleProgress,
    puzzleSolvedNotification,
    // 方法
    savePlayer,
    createRoom,
    joinRoom,
    initializeStory,
    sendMessage,
    leaveRoom,
    clearUnreadDirectCount,
    setError
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
};

