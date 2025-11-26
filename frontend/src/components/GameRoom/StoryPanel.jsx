import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../context/GameContext';

export default function StoryPanel() {
  const { story, messages, room, storyMachineMessages, player, initializeStory, storyInitializing } = useGame();
  const messagesEndRef = useRef(null);
  const [viewMode, setViewMode] = useState('global'); // 'global' | 'storyMachine'
  
  // 故事初始化相关状态
  const isHost = room?.hostId === player?.id;
  const [showInitForm, setShowInitForm] = useState(false);
  const [storyTitle, setStoryTitle] = useState('');
  const [storyBackground, setStoryBackground] = useState('');
  
  // 调试：检查消息数据
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('StoryPanel messages:', messages);
      console.log('StoryPanel storyMachineMessages:', storyMachineMessages);
    }
  }, [messages, storyMachineMessages]);

  // 监听来自InputPanel的视图切换事件
  useEffect(() => {
    const handleSwitchViewMode = (event) => {
      if (event.detail && event.detail.viewMode) {
        setViewMode(event.detail.viewMode);
      }
    };
    
    window.addEventListener('switchViewMode', handleSwitchViewMode);
    return () => {
      window.removeEventListener('switchViewMode', handleSwitchViewMode);
    };
  }, []);

  // 根据viewMode过滤消息
  const displayMessages = viewMode === 'storyMachine' 
    ? (storyMachineMessages || [])
    : (messages || []).filter(m => {
        // 全局视图：显示所有全局可见的消息
        return m.type === 'global' || 
               m.type === 'chapter' || 
               m.type === 'ai' || 
               m.type === 'system' ||
               m.type === 'player_to_player' ||
               m.type === 'player' ||
               (m.visibility === 'global' && 
                m.type !== 'private' && 
                m.type !== 'story_machine' &&
                m.senderId !== 'ai');
      }).sort((a, b) => {
        // 按时间戳排序，确保消息按时间顺序显示
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeA - timeB;
      });

  // 修复自动滚动问题：延迟滚动确保DOM更新完成
  // 只在用户没有手动滚动时才自动滚动到底部
  const messagesContainerRef = useRef(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  
  useEffect(() => {
    if (!shouldAutoScroll) return;
    
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
    return () => clearTimeout(timer);
  }, [displayMessages, shouldAutoScroll]);
  
  // 检测用户是否手动滚动
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // 如果用户滚动到接近底部（距离底部50px以内），则允许自动滚动
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
      setShouldAutoScroll(isNearBottom);
    };
    
    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const handleInitializeStory = async (e) => {
    e.preventDefault();
    console.log('📖 开始初始化故事:', { storyTitle, storyBackground, storyInitializing });
    if (!storyTitle.trim() || storyInitializing) {
      console.log('⚠️ 初始化被阻止:', { titleEmpty: !storyTitle.trim(), alreadyInitializing: storyInitializing });
      return;
    }
    try {
      console.log('📤 调用 initializeStory...');
      await initializeStory(storyTitle, storyBackground);
      console.log('✅ 故事初始化成功');
      setShowInitForm(false);
      setStoryTitle('');
      setStoryBackground('');
    } catch (err) {
      console.error('❌ 初始化失败:', err);
    }
  };

  if (!story) {
    // 正在创建故事中 - 显示加载界面
    if (storyInitializing) {
      return (
        <div className="h-full flex items-center justify-center p-6 bg-pixel-panel">
          <div className="text-center max-w-md w-full">
            {/* 弹跳的书本图标 */}
            <div className="text-7xl mb-6 animate-bounce" style={{ animationDuration: '1.5s' }}>📖</div>
            
            <h2 className="text-2xl font-bold text-pixel-wood-dark mb-4" style={{ textShadow: '2px 2px 0 #fff' }}>
              故事正在创建中
            </h2>
            
            {/* 像素风格进度条 */}
            <div className="space-y-4">
              
              {/* 进度条 */}
              <div className="w-64 h-4 bg-pixel-wood-dark/30 border-2 border-pixel-wood-dark mx-auto overflow-hidden">
                <div 
                  className="h-full bg-pixel-accent-blue"
                  style={{
                    animation: 'pixelProgress 2s ease-in-out infinite'
                  }}
                ></div>
              </div>
              
              {/* 状态文字 */}
              <div className="mt-4 space-y-1">
                <p className="text-pixel-wood-dark font-bold flex items-center justify-center gap-1">
                  <span className="text-pixel-accent-yellow">⚡</span>
                  AI 正在构思精彩开篇
                  <span className="inline-flex">
                    <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                    <span className="animate-bounce" style={{ animationDelay: '200ms' }}>.</span>
                    <span className="animate-bounce" style={{ animationDelay: '400ms' }}>.</span>
                  </span>
                </p>
                <p className="text-xs text-pixel-text-muted">
                  这可能需要几秒钟，请耐心等待
                </p>
              </div>
            </div>
            
            {/* 像素动画样式 */}
            <style>{`
              @keyframes pixelProgress {
                0% { 
                  width: 5%; 
                  margin-left: 0;
                }
                50% { 
                  width: 50%; 
                  margin-left: 25%;
                }
                100% { 
                  width: 5%; 
                  margin-left: 95%;
                }
              }
            `}</style>
          </div>
        </div>
      );
    }
    
    return (
      <div className="h-full flex items-center justify-center p-6 bg-pixel-panel">
        <div className="text-center max-w-md w-full">
          {/* 动画书本图标 */}
          <div className="text-7xl mb-6 animate-bounce" style={{ animationDuration: '2s' }}>📖</div>
          
          {isHost ? (
            // 房主视图：直接显示初始化表单
            !showInitForm ? (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold text-pixel-wood-dark" style={{ textShadow: '2px 2px 0 #fff' }}>
                  开启你的冒险！
                </h2>
                <p className="text-pixel-text-muted">
                  作为房主，你可以创建一个全新的故事世界
                </p>
                <button
                  onClick={() => setShowInitForm(true)}
                  className="btn-primary text-lg px-8 py-3 mt-4"
                >
                  🎮 创建故事
                </button>
              </div>
            ) : (
              <div className="card bg-pixel-panel p-6">
                <h2 className="text-xl font-bold text-pixel-wood-dark mb-4">创建新故事</h2>
                <form onSubmit={handleInitializeStory} className="space-y-4 text-left">
                  <div>
                    <label className="block text-sm font-bold text-pixel-wood-dark mb-1">故事标题 *</label>
                    <input
                      type="text"
                      value={storyTitle}
                      onChange={(e) => setStoryTitle(e.target.value)}
                      className="input-field w-full"
                      placeholder="例如：迷失森林的冒险"
                      required
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-pixel-wood-dark mb-1">故事背景（可选）</label>
                    <textarea
                      value={storyBackground}
                      onChange={(e) => setStoryBackground(e.target.value)}
                      className="input-field w-full h-24 resize-none"
                      placeholder="描述故事发生的世界、时代背景等..."
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={storyInitializing || !storyTitle.trim()}
                      className="btn-primary flex-1 disabled:opacity-50"
                    >
                      {storyInitializing ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                          创建中...
                        </span>
                      ) : (
                        '开始冒险'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowInitForm(false)}
                      className="btn-secondary"
                    >
                      取消
                    </button>
                  </div>
                </form>
              </div>
            )
          ) : (
            // 非房主视图：等待提示（带动画）
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-pixel-wood-dark" style={{ textShadow: '2px 2px 0 #fff' }}>
                故事即将开始...
              </h2>
              <p className="text-pixel-text-muted">
                等待房主 <span className="text-pixel-accent-yellow font-bold">👑 {room?.players?.find(p => p.id === room?.hostId)?.username || '房主'}</span> 初始化故事
              </p>
              
              {/* 动态等待动画 */}
              <div className="flex justify-center items-center gap-1 mt-6">
                <div className="w-3 h-3 bg-pixel-accent-blue animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-3 h-3 bg-pixel-accent-blue animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-3 h-3 bg-pixel-accent-blue animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
              
              <p className="text-xs text-pixel-text-muted mt-4">
                💡 提示：你可以先熟悉界面，故事开始后即可参与
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-pixel-panel">
      {/* 故事标题栏 - 精简高度 */}
      <div className="flex-shrink-0 px-4 py-3 border-b-4 border-pixel-wood-dark bg-pixel-wood-light/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-pixel-wood-dark" style={{ textShadow: '1px 1px 0 #fff' }}>
              {story.title}
            </h2>
            <span className="text-sm text-pixel-text-muted font-bold bg-pixel-wood-dark/20 px-2 py-0.5 rounded">
              第 {story.chapters?.length || 0} 章
            </span>
          </div>
          
          {/* 视图切换按钮组 */}
          <div className="flex gap-1">
            <button
              onClick={() => {
                setViewMode('global');
                window.dispatchEvent(new CustomEvent('switchMessageType', {
                  detail: { messageType: 'global' }
                }));
              }}
              className={`px-3 py-1 text-xs font-bold border-2 transition-all ${
                viewMode === 'global'
                  ? 'bg-pixel-accent-blue text-white border-white shadow-pixel-sm'
                  : 'bg-pixel-wood-light text-pixel-wood-dark border-pixel-wood-dark hover:brightness-110'
              }`}
            >
              💬 主聊天
            </button>
            <button
              onClick={() => {
                setViewMode('storyMachine');
                window.dispatchEvent(new CustomEvent('switchMessageType', {
                  detail: { messageType: 'private' }
                }));
              }}
              className={`px-3 py-1 text-xs font-bold border-2 transition-all ${
                viewMode === 'storyMachine'
                  ? 'bg-pixel-accent-red text-white border-white shadow-pixel-sm'
                  : 'bg-pixel-wood-light text-pixel-wood-dark border-pixel-wood-dark hover:brightness-110'
              }`}
            >
              🤖 故事机
            </button>
          </div>
        </div>
        
        {/* 当前模式提示 */}
        {viewMode === 'storyMachine' && (
          <div className="mt-2 text-xs text-pixel-accent-red font-bold">
            🤖 私密对话模式：获取独属于你的信息和反馈
          </div>
        )}
      </div>

      {/* 故事背景 - 可折叠 */}
      {story.background && (
        <div className="flex-shrink-0 mx-4 mt-3 p-2 bg-pixel-wood-light/50 border-2 border-pixel-wood-dark text-sm">
          <span className="text-pixel-text-muted font-bold">背景：</span>
          <span className="text-pixel-text">{story.background}</span>
        </div>
      )}

      {/* 消息列表 - 充分利用剩余空间 */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
      >
        {/* 故事生成中的加载消息框 */}
        {storyInitializing && (
          <div className="border-l-4 border-pixel-accent-blue pl-4 py-3 bg-pixel-accent-blue/10 rounded-r-lg animate-pulse">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl animate-bounce">🤖</span>
                <span className="text-sm font-bold text-pixel-accent-blue">故事机</span>
              </div>
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-pixel-accent-blue rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-2 h-2 bg-pixel-accent-blue rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-2 h-2 bg-pixel-accent-blue rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
            <div className="text-lg text-pixel-wood-dark font-medium">
              <span className="inline-block">正在构思精彩的故事开篇</span>
              <span className="inline-block ml-1 animate-pulse">...</span>
            </div>
            <div className="text-xs text-pixel-wood-dark/70 mt-2">
              ✨ AI 正在根据您的设定创作独特的故事世界
            </div>
          </div>
        )}
        
        {displayMessages.length === 0 && !storyInitializing ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-pixel-text-muted">
              <div className="text-4xl mb-3">{viewMode === 'storyMachine' ? '🤖' : '✨'}</div>
              <p className="font-bold text-lg">{viewMode === 'storyMachine' ? '还没有故事机消息' : '故事即将开始'}</p>
              <p className="text-sm mt-1">
                {viewMode === 'storyMachine' ? '在下方输入框中与故事机对话' : '在下方输入你的想法，开启冒险！'}
              </p>
            </div>
          </div>
        ) : (
          displayMessages.map((message) => (
            <MessageItem key={message.id} message={message} viewMode={viewMode} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

function MessageItem({ message, viewMode = 'global' }) {
  const { player, room } = useGame();
  
  // 格式化时间戳
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) { // 1分钟内
      return '刚刚';
    } else if (diff < 3600000) { // 1小时内
      return `${Math.floor(diff / 60000)}分钟前`;
    } else if (diff < 86400000) { // 24小时内
      return `${Math.floor(diff / 3600000)}小时前`;
    } else {
      return date.toLocaleString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };
  
  // 全局消息（玩家输入）
  // 判断条件：type为global，或者visibility为global且不是私密消息
  if (message.type === 'global' || 
      (message.type === 'player' && (!message.visibility || message.visibility === 'global')) ||
      (message.visibility === 'global' && message.type !== 'private' && message.type !== 'story_machine' && message.type !== 'chapter' && message.senderId !== 'ai')) {
    const isCurrentPlayer = message.senderId === player?.id;
    return (
      <div className={`flex ${isCurrentPlayer ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[80%] p-3 border-2 shadow-pixel-sm ${
          isCurrentPlayer 
            ? 'bg-pixel-accent-blue/20 border-pixel-accent-blue' 
            : 'bg-white/50 border-pixel-wood-dark'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className={`text-xs font-bold ${isCurrentPlayer ? 'text-pixel-accent-blue' : 'text-pixel-wood-dark'}`}>{message.sender || message.author || '玩家'}</div>
              <span className="text-xs opacity-50">全局</span>
            </div>
            {message.timestamp && (
              <div className="text-xs text-pixel-text-muted ml-2">
                {formatTimestamp(message.timestamp)}
              </div>
            )}
          </div>
          <div className="text-sm">{message.content}</div>
        </div>
      </div>
    );
  }
  
  // 故事机消息（私密消息）
  if (message.type === 'private' || message.type === 'story_machine' || message.visibility === 'private' || message.isPrivate) {
    const isSender = message.senderId === player?.id;
    const isAI = message.sender === '故事机' || message.senderId === 'ai' || message.type === 'story_machine';
    
    return (
      <div className={`flex ${isSender ? 'justify-end' : isAI ? 'justify-start' : 'justify-start'}`}>
        <div className={`max-w-[80%] p-3 border-2 shadow-pixel-sm ${
          isAI 
            ? 'bg-pixel-accent-red/10 border-pixel-accent-red' 
            : 'bg-pixel-accent-red/20 border-pixel-accent-red'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-xs">🤖</span>
              <div className="text-xs font-bold text-pixel-accent-red">
                {isAI ? '故事机' : (message.sender || message.author)}
              </div>
              {!isAI && <span className="text-xs opacity-50">你</span>}
            </div>
            {message.timestamp && (
              <div className="text-xs text-pixel-text-muted ml-2">
                {formatTimestamp(message.timestamp)}
              </div>
            )}
          </div>
          <div className="text-sm">{message.content}</div>
        </div>
      </div>
    );
  }
  
  // 玩家间消息
  if (message.type === 'player_to_player' || message.visibility === 'direct') {
    const isSender = message.senderId === player?.id;
    const isRecipient = message.recipientId === player?.id;
    
    return (
      <div className={`flex ${isSender ? 'justify-end' : 'justify-start'}`}>
        <div className="max-w-[80%] bg-pixel-accent-green/20 border-2 border-pixel-accent-green shadow-pixel-sm p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-xs">💬</span>
              <div className="text-xs font-bold text-pixel-accent-green">
                {isSender ? `你 → ${message.recipientName || '玩家'}` : `${message.sender || message.author} → 你`}
              </div>
              <span className="text-xs opacity-50">私聊</span>
            </div>
            {message.timestamp && (
              <div className="text-xs text-pixel-text-muted ml-2">
                {formatTimestamp(message.timestamp)}
              </div>
            )}
          </div>
          <div className="text-sm">{message.content}</div>
        </div>
      </div>
    );
  }

  // AI生成的章节
  if (message.type === 'chapter' || message.type === 'ai') {
    // 高亮显示人物名称（玩家@xxx格式，NPC用不同样式）
    const highlightCharacters = (content, players) => {
      if (!content) return content;
      
      // 获取所有玩家名称
      const playerNames = players ? players.map(p => p.username || p.name).filter(Boolean) : [];
      
      // 先处理NPC标记格式：[NPC:名称] 或 @NPC:名称
      const npcPattern = /\[NPC:([^\]]+)\]|@NPC:([^\s，。！？,\.!?]+)/g;
      const npcMatches = [];
      let npcMatch;
      let lastIndex = 0;
      
      // 收集所有NPC标记
      while ((npcMatch = npcPattern.exec(content)) !== null) {
        npcMatches.push({
          start: npcMatch.index,
          end: npcMatch.index + npcMatch[0].length,
          name: npcMatch[1] || npcMatch[2],
          fullMatch: npcMatch[0]
        });
      }
      
      // 如果没有NPC标记，尝试识别可能的NPC名称（不在玩家列表中的名称）
      // 使用简单的启发式方法：识别引号中的名称、特定上下文中的名称等
      const potentialNpcPattern = /["""]([^"""]{2,10})["""]|「([^」]{2,10})」|《([^》]{2,10})》/g;
      const potentialNpcs = [];
      let potentialMatch;
      
      while ((potentialMatch = potentialNpcPattern.exec(content)) !== null) {
        const name = potentialMatch[1] || potentialMatch[2] || potentialMatch[3];
        // 如果不在玩家列表中，且不是常见词汇，可能是NPC
        if (name && !playerNames.some(p => p.toLowerCase() === name.toLowerCase()) && 
            name.length >= 2 && name.length <= 10) {
          potentialNpcs.push({
            start: potentialMatch.index,
            end: potentialMatch.index + potentialMatch[0].length,
            name: name,
            fullMatch: potentialMatch[0]
          });
        }
      }
      
      // 合并NPC标记和潜在NPC
      const allNpcs = [...npcMatches, ...potentialNpcs].sort((a, b) => a.start - b.start);
      
      // 处理玩家名称
      const playerPattern = playerNames.length > 0 
        ? new RegExp(`(${playerNames.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
        : null;
      
      // 将内容分割成片段
      const parts = [];
      let currentIndex = 0;
      
      // 先处理NPC标记
      allNpcs.forEach((npc, index) => {
        // 添加NPC之前的文本
        if (npc.start > currentIndex) {
          const beforeText = content.substring(currentIndex, npc.start);
          if (beforeText) {
            parts.push({ type: 'text', content: beforeText, start: currentIndex, end: npc.start });
          }
        }
        
        // 添加NPC高亮
        parts.push({ 
          type: 'npc', 
          content: npc.name, 
          fullMatch: npc.fullMatch,
          start: npc.start, 
          end: npc.end 
        });
        
        currentIndex = npc.end;
      });
      
      // 添加剩余文本
      if (currentIndex < content.length) {
        parts.push({ type: 'text', content: content.substring(currentIndex), start: currentIndex, end: content.length });
      }
      
      // 如果没有NPC，直接处理整个内容
      if (parts.length === 0) {
        parts.push({ type: 'text', content: content, start: 0, end: content.length });
      }
      
      // 渲染每个片段
      return parts.map((part, partIndex) => {
        if (part.type === 'npc') {
          // NPC高亮显示（橙色/黄色）
          return (
            <span key={`npc-${partIndex}`} className="text-pixel-accent-yellow font-bold drop-shadow-sm">
              {part.fullMatch ? part.fullMatch.replace(/\[NPC:|@NPC:|["""]|「|《/g, '').replace(/\]|」|》/g, '') : part.content}
            </span>
          );
        }
        
        // 处理文本片段中的玩家名称
        if (playerPattern && part.content) {
          const textParts = part.content.split(playerPattern);
          return textParts.map((textPart, textIndex) => {
            const isPlayerName = playerNames.some(name => name.toLowerCase() === textPart.toLowerCase());
            if (isPlayerName) {
              return (
                <span key={`player-${partIndex}-${textIndex}`} className="text-pixel-accent-blue font-bold drop-shadow-sm">
                  @{textPart}
                </span>
              );
            }
            return <span key={`text-${partIndex}-${textIndex}`}>{textPart}</span>;
          });
        }
        
        return <span key={`text-${partIndex}`}>{part.content}</span>;
      });
    };
    
    return (
      <div className="border-l-4 border-pixel-wood-dark pl-4 py-2 bg-white/20 rounded-r-lg">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-pixel-wood-dark">
              {message.chapterNumber ? `第 ${message.chapterNumber} 章` : 'AI生成'}
            </span>
            {message.author && (
              <>
                <span className="text-xs text-pixel-text-muted">·</span>
                <span className="text-xs text-pixel-text-muted font-bold">
                  {typeof message.author === 'string' ? message.author : message.author.username}
                </span>
              </>
            )}
          </div>
          {message.timestamp && (
            <div className="text-xs text-pixel-text-muted">
              {formatTimestamp(message.timestamp)}
            </div>
          )}
        </div>
        <div className="text-lg leading-relaxed whitespace-pre-wrap font-medium">
          {highlightCharacters(message.content, room?.players || [])}
        </div>
      </div>
    );
  }
  
  // 系统消息
  if (message.type === 'system') {
    return (
      <div className="flex justify-center">
        <div className="bg-pixel-wood-light border-2 border-pixel-wood-dark rounded-lg px-3 py-2 shadow-pixel-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-pixel-wood-dark">
            <span>ℹ️</span>
            <span>{message.content}</span>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

