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
  const [room, setRoom] = useState(null);
  const [story, setStory] = useState(null);
  const [messages, setMessages] = useState([]);
  const [storyMachineMessages, setStoryMachineMessages] = useState([]); // 故事机消息列表
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [playersProgress, setPlayersProgress] = useState({}); // 玩家反馈进度
  const [chapterTodos, setChapterTodos] = useState([]); // 章节TODO列表

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
      
      // 根据消息可见性决定是否添加到消息列表
      const isVisible = 
        messageData.visibility === 'global' ||
        (messageData.visibility === 'private' && messageData.senderId === player?.id) ||
        (messageData.visibility === 'direct' && (messageData.senderId === player?.id || messageData.recipientId === player?.id));
      
      console.log('消息可见性检查:', { isVisible, visibility: messageData.visibility, type: messageData.type, senderId: messageData.senderId, playerId: player?.id });
      
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
        
        // 故事机消息单独存储（只有私密消息和AI发送的故事机消息）
        if ((messageData.type === 'private' || messageData.type === 'story_machine') && 
            (messageData.visibility === 'private' || messageData.senderId === 'ai')) {
          console.log('添加到故事机消息');
          setStoryMachineMessages(prev => {
            if (prev.find(m => m.id === messageData.id)) {
              return prev;
            }
            return [...prev, formattedMessage];
          });
        } else {
          // 其他消息（包括全局消息）添加到主消息列表
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
    
    socketManager.on('connection_status', handleConnectionStatus);
    socketManager.on('room_updated', handleRoomUpdated);
    socketManager.on('new_message', handleNewMessage);
    socketManager.on('new_chapter', handleNewChapter);
    socketManager.on('story_initialized', handleStoryInitialized);
    socketManager.on('story_machine_init', handleStoryMachineInit);
    socketManager.on('feedback_progress_update', handleFeedbackProgressUpdate);
    socketManager.on('chapter_ready', handleChapterReady);
    
    return () => {
      socketManager.off('connection_status', handleConnectionStatus);
      socketManager.off('room_updated', handleRoomUpdated);
      socketManager.off('new_message', handleNewMessage);
      socketManager.off('new_chapter', handleNewChapter);
      socketManager.off('story_initialized', handleStoryInitialized);
      socketManager.off('story_machine_init', handleStoryMachineInit);
      socketManager.off('feedback_progress_update', handleFeedbackProgressUpdate);
      socketManager.off('chapter_ready', handleChapterReady);
    };
  }, []);

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
    if (!room) {
      setError('未加入房间');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    socketManager.emit('initialize_story', {
      title,
      background
    }, (response) => {
      setLoading(false);
      if (response.error) {
        setError(response.error);
      } else {
        setStory(response.room.story);
        setRoom(response.room);
      }
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
    setMessages(prev => [...prev, playerMessage]);
    
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
        setMessages(prev => prev.filter(m => m.id !== tempMessageId));
        return;
      }
      
      // 成功：移除临时消息（服务器会通过new_message事件发送正式消息）
      setMessages(prev => prev.filter(m => m.id !== tempMessageId));
      
      // 更新房间和故事
      if (response.room) {
        setRoom(response.room);
        if (response.room.story) {
          setStory(response.room.story);
        }
      }
    });
  }, [room, player]);

  // 离开房间
  const leaveRoom = useCallback(() => {
    setRoom(null);
    setStory(null);
    setMessages([]);
    setError(null);
  }, []);

  const value = {
    socketConnected,
    player,
    room,
    story,
    messages,
    storyMachineMessages,
    playersProgress,
    chapterTodos,
    loading,
    error,
    savePlayer,
    createRoom,
    joinRoom,
    initializeStory,
    sendMessage,
    leaveRoom,
    setError
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
};

