import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../context/GameContext';
import CharacterCard from './CharacterCard';
import ScriptSelector from './ScriptSelector';
import socketManager from '../../utils/socket';

export default function StoryPanel() {
  const { 
    story, messages, room, storyMachineMessages, directMessages, 
    unreadDirectCount, clearUnreadDirectCount, player, initializeStory, 
    storyInitializing, error, currentPuzzle, puzzleProgress, puzzleSolvedNotification,
    initializeWithScript
  } = useGame();
  const messagesEndRef = useRef(null);
  const [viewMode, setViewMode] = useState('global'); // 'global' | 'storyMachine' | 'direct'
  
  // 故事初始化相关状态
  const isHost = room?.hostId === player?.id;
  const [showInitForm, setShowInitForm] = useState(false);
  const [showScriptSelector, setShowScriptSelector] = useState(false); // 显示剧本选择器
  const [storyTitle, setStoryTitle] = useState('');
  const [storyBackground, setStoryBackground] = useState('');
  
  // 角色卡片相关状态
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [storyCharacters, setStoryCharacters] = useState([]);
  
  // 获取故事中的角色列表
  useEffect(() => {
    if (story?.id) {
      socketManager.emit('get_characters', { storyId: story.id }, (response) => {
        if (response.success && response.characters) {
          setStoryCharacters(response.characters);
          console.log('📋 已加载故事角色:', response.characters);
        }
      });
    }
  }, [story?.id, story?.chapters?.length]);
  
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

  // 切换到私聊视图时清除未读计数
  useEffect(() => {
    if (viewMode === 'direct' && clearUnreadDirectCount) {
      clearUnreadDirectCount();
    }
  }, [viewMode, clearUnreadDirectCount]);

  // 根据viewMode过滤消息
  const displayMessages = viewMode === 'storyMachine' 
    ? (storyMachineMessages || [])
    : viewMode === 'direct'
    ? (directMessages || []).sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeA - timeB;
      })
    : (messages || []).filter(m => {
        // 全局视图：显示所有全局可见的消息，但不包括玩家间私聊
        return m.type === 'global' || 
               m.type === 'chapter' || 
               m.type === 'ai' || 
               m.type === 'system' ||
               m.type === 'player' ||
               (m.visibility === 'global' && 
                m.type !== 'private' && 
                m.type !== 'story_machine' &&
                m.type !== 'player_to_player' &&
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

  // 使用预制剧本开始游戏
  const handleSelectScript = async (script) => {
    console.log('📚 [StoryPanel] 选择剧本开始游戏:', script);
    
    if (!script || !script.id) {
      console.error('❌ [StoryPanel] 无效的剧本:', script);
      return;
    }
    
    try {
      console.log('📚 [StoryPanel] 开始初始化剧本:', script.id);
      await initializeWithScript(script.id);
      console.log('✅ [StoryPanel] 剧本加载成功');
      setShowScriptSelector(false);
    } catch (err) {
      console.error('❌ [StoryPanel] 剧本加载失败:', err);
      // 错误信息已由initializeWithScript设置到error状态
      // 这里可以添加额外的用户提示
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
            // 房主视图
            showScriptSelector ? (
              // 剧本选择器
              <div className="card bg-pixel-panel p-6">
                {error && (
                  <div className="mb-4 p-3 bg-red-500/20 border-2 border-red-500 text-red-500 text-sm font-bold rounded">
                    {error}
                  </div>
                )}
                <ScriptSelector 
                  onSelect={handleSelectScript}
                  onCancel={() => setShowScriptSelector(false)}
                />
              </div>
            ) : !showInitForm ? (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold text-pixel-wood-dark" style={{ textShadow: '2px 2px 0 #fff' }}>
                  开启你的冒险！
                </h2>
                <p className="text-pixel-text-muted">
                  作为房主，你可以选择一个预制剧本或创建自由故事
                </p>
                
                {/* 两种模式选择 */}
                <div className="grid grid-cols-1 gap-3 mt-6">
                  <button
                    onClick={() => setShowScriptSelector(true)}
                    className="btn-primary text-lg px-8 py-4 flex items-center justify-center gap-3"
                  >
                    <span className="text-2xl">📚</span>
                    <div className="text-left">
                      <div className="font-bold">选择剧本</div>
                      <div className="text-xs opacity-80">使用预制的剧本杀剧本</div>
                    </div>
                  </button>
                  
                  <button
                    onClick={() => setShowInitForm(true)}
                    className="btn-secondary text-lg px-8 py-4 flex items-center justify-center gap-3"
                  >
                    <span className="text-2xl">✨</span>
                    <div className="text-left">
                      <div className="font-bold">自由创作</div>
                      <div className="text-xs opacity-80">AI 实时生成故事</div>
                    </div>
                  </button>
                </div>
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
                setViewMode('direct');
                window.dispatchEvent(new CustomEvent('switchMessageType', {
                  detail: { messageType: 'player_to_player' }
                }));
              }}
              className={`px-3 py-1 text-xs font-bold border-2 transition-all relative ${
                viewMode === 'direct'
                  ? 'bg-pixel-accent-yellow text-pixel-wood-dark border-white shadow-pixel-sm'
                  : 'bg-pixel-wood-light text-pixel-wood-dark border-pixel-wood-dark hover:brightness-110'
              }`}
            >
              🔒 玩家私聊
              {unreadDirectCount > 0 && viewMode !== 'direct' && (
                <span className="absolute -top-2 -right-2 bg-pixel-accent-red text-white text-xs w-5 h-5 rounded-full flex items-center justify-center animate-pulse">
                  {unreadDirectCount > 9 ? '9+' : unreadDirectCount}
                </span>
              )}
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
        {viewMode === 'direct' && (
          <div className="mt-2 text-xs text-pixel-accent-yellow font-bold">
            🔒 玩家私聊模式：与其他玩家进行秘密交流（在玩家列表中点击玩家选择私聊对象）
          </div>
        )}
      </div>
      
      {/* 谜题进度条 - 显示在标题栏下方 */}
      {currentPuzzle && viewMode !== 'direct' && (
        <div className="flex-shrink-0 mx-4 mt-2 p-3 bg-gradient-to-r from-purple-100 to-indigo-100 border-2 border-purple-300 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔮</span>
              <span className="text-sm font-bold text-purple-800">本章谜题</span>
              {puzzleProgress.solvedCount > 0 && (
                <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full">
                  {puzzleProgress.solvedCount}/{puzzleProgress.totalPlayers || room?.players?.length || '?'} 已解开
                </span>
              )}
            </div>
          </div>
          <p className="text-sm text-purple-900 font-medium">{currentPuzzle.question}</p>
          
          {/* 解谜进度 */}
          {puzzleProgress.solvedPlayers && puzzleProgress.solvedPlayers.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {puzzleProgress.solvedPlayers.map(p => (
                <span key={p.playerId} className="text-xs bg-green-200 text-green-700 px-2 py-0.5 rounded">
                  ✓ {p.playerName}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* 解谜成功全局通知 */}
      {puzzleSolvedNotification && (
        <div className="fixed top-1/3 left-1/2 transform -translate-x-1/2 z-50 
          bg-gradient-to-r from-green-500 to-emerald-500 text-white px-8 py-4 rounded-lg 
          shadow-2xl border-4 border-white animate-bounce">
          <div className="text-center">
            <div className="text-3xl mb-2">🎉</div>
            <p className="text-lg font-bold">{puzzleSolvedNotification.message}</p>
            <p className="text-sm mt-1">即将进入第 {puzzleSolvedNotification.nextChapterNumber} 章...</p>
          </div>
        </div>
      )}

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
            <MessageItem 
              key={message.id} 
              message={message} 
              viewMode={viewMode} 
              storyCharacters={storyCharacters}
              onCharacterClick={setSelectedCharacter}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* 角色卡片弹窗 */}
      {selectedCharacter && (
        <CharacterCard 
          characterId={selectedCharacter.id}
          characterName={selectedCharacter.name}
          onClose={() => setSelectedCharacter(null)}
        />
      )}
    </div>
  );
}

function MessageItem({ message, viewMode = 'global', storyCharacters = [], onCharacterClick }) {
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
    
    // 解析并渲染故事机消息内容（支持Markdown格式）
    const renderStoryMachineContent = (content) => {
      if (!content) return null;
      
      // 分割内容为段落
      const lines = content.split('\n').filter(line => line.trim() !== '');
      
      return lines.map((line, index) => {
        // 处理标题（**text**）
        if (line.includes('**')) {
          const parts = line.split(/\*\*(.*?)\*\*/g);
          return (
            <div key={index} className="mb-2">
              {parts.map((part, i) => 
                i % 2 === 1 
                  ? <span key={i} className="font-bold text-pixel-accent-red">{part}</span>
                  : <span key={i}>{part}</span>
              )}
            </div>
          );
        }
        
        // 处理引用（> text）
        if (line.startsWith('>') || line.startsWith('> ')) {
          const quoteContent = line.replace(/^>\s*/, '');
          return (
            <blockquote key={index} className="border-l-4 border-pixel-accent-yellow pl-3 my-2 py-1 bg-pixel-accent-yellow/10 italic text-pixel-wood-dark">
              "{quoteContent}"
            </blockquote>
          );
        }
        
        // 处理斜体（_text_）
        if (line.includes('_')) {
          const parts = line.split(/_(.*?)_/g);
          return (
            <div key={index} className="mb-1 text-sm text-pixel-text-muted italic">
              {parts.map((part, i) => 
                i % 2 === 1 
                  ? <span key={i} className="text-pixel-wood-dark">{part}</span>
                  : <span key={i}>{part}</span>
              )}
            </div>
          );
        }
        
        // 处理表情图标行
        if (line.match(/^[🤖📖💡🔮💬🤝🎭✨]/)) {
          return (
            <div key={index} className="mb-2 flex items-start gap-2">
              <span className="text-lg flex-shrink-0">{line.charAt(0)}</span>
              <span className="text-sm">{line.substring(line.charAt(1) === ' ' ? 2 : 1)}</span>
            </div>
          );
        }
        
        // 普通段落
        return <p key={index} className="mb-2 text-sm leading-relaxed">{line}</p>;
      });
    };
    
    return (
      <div className={`flex ${isSender ? 'justify-end' : isAI ? 'justify-start' : 'justify-start'}`}>
        <div className={`max-w-[85%] p-4 border-2 shadow-pixel-sm rounded-lg ${
          isAI 
            ? 'bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-300' 
            : 'bg-pixel-accent-red/20 border-pixel-accent-red'
        }`}>
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-purple-200">
            <div className="flex items-center gap-2">
              <span className="text-xl">🤖</span>
              <div className="text-sm font-bold text-purple-700">
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
          <div className="story-machine-content">
            {isAI ? renderStoryMachineContent(message.content) : <div className="text-sm">{message.content}</div>}
          </div>
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
      
      // 收集所有NPC标记
      while ((npcMatch = npcPattern.exec(content)) !== null) {
        npcMatches.push({
          start: npcMatch.index,
          end: npcMatch.index + npcMatch[0].length,
          name: npcMatch[1] || npcMatch[2],
          fullMatch: npcMatch[0]
        });
      }
      
      // 只有当有已知角色列表时，才尝试匹配角色名称
      // 不再使用引号内容的启发式匹配，避免误识别
      const knownCharacterNames = storyCharacters
        .filter(c => c.name && c.name.length >= 2 && c.name.length <= 10)
        .map(c => c.name);
      
      // 在文本中查找已知角色名称
      const characterMatches = [];
      if (knownCharacterNames.length > 0) {
        const charPattern = new RegExp(
          `(${knownCharacterNames.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
          'g'
        );
        let charMatch;
        while ((charMatch = charPattern.exec(content)) !== null) {
          // 检查这个位置是否已经被NPC标记覆盖
          const isOverlapping = npcMatches.some(
            npc => charMatch.index >= npc.start && charMatch.index < npc.end
          );
          if (!isOverlapping) {
            characterMatches.push({
              start: charMatch.index,
              end: charMatch.index + charMatch[0].length,
              name: charMatch[1],
              fullMatch: charMatch[0]
            });
          }
        }
      }
      
      // 合并NPC标记和已知角色匹配
      const allNpcs = [...npcMatches, ...characterMatches].sort((a, b) => a.start - b.start);
      
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
          // 获取清理后的NPC名称
          const displayName = part.fullMatch ? part.fullMatch.replace(/\[NPC:|@NPC:|["""]|「|《/g, '').replace(/\]|」|》/g, '') : part.content;
          
          // 查找是否有对应的角色信息
          const character = storyCharacters.find(c => 
            c.name === displayName || 
            c.name === part.content ||
            c.name.includes(displayName) ||
            displayName.includes(c.name)
          );
          
          // NPC高亮显示（橙色/黄色）- 可点击打开角色卡片
          return (
            <span 
              key={`npc-${partIndex}`} 
              className="text-pixel-accent-yellow font-bold drop-shadow-sm cursor-pointer hover:bg-yellow-200/50 px-0.5 rounded transition-colors underline decoration-dotted underline-offset-2"
              onClick={(e) => {
                e.stopPropagation();
                if (onCharacterClick) {
                  if (character) {
                    onCharacterClick(character);
                  } else {
                    // 如果没有找到角色，尝试用名称创建一个临时对象
                    onCharacterClick({ 
                      name: displayName, 
                      character_type: 'npc',
                      id: `temp-${displayName}`
                    });
                  }
                }
              }}
              title="点击查看角色详情"
            >
              {displayName}
            </span>
          );
        }
        
        // 处理文本片段中的玩家名称
        if (playerPattern && part.content) {
          const textParts = part.content.split(playerPattern);
          return textParts.map((textPart, textIndex) => {
            const isPlayerName = playerNames.some(name => name.toLowerCase() === textPart.toLowerCase());
            if (isPlayerName) {
              // 查找是否有对应的角色信息
              const character = storyCharacters.find(c => 
                c.name === textPart ||
                c.player_id === (room?.players?.find(p => p.username === textPart)?.id)
              );
              
              return (
                <span 
                  key={`player-${partIndex}-${textIndex}`} 
                  className="text-pixel-accent-blue font-bold drop-shadow-sm cursor-pointer hover:bg-blue-200/50 px-0.5 rounded transition-colors underline decoration-dotted underline-offset-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onCharacterClick) {
                      if (character) {
                        onCharacterClick(character);
                      } else {
                        // 创建临时角色对象
                        onCharacterClick({ 
                          name: textPart, 
                          character_type: 'player',
                          id: `temp-player-${textPart}`
                        });
                      }
                    }
                  }}
                  title="点击查看角色详情"
                >
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

