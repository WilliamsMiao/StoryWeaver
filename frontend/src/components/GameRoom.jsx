import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import StoryPanel from './GameRoom/StoryPanel';
import InputPanel from './GameRoom/InputPanel';
import StatusPanel from './GameRoom/StatusPanel';
import CharacterPanel from './GameRoom/CharacterPanel';
import SkillPanel from './GameRoom/SkillPanel';
import MurdererGuidePanel from './GameRoom/MurdererGuidePanel';
import NpcDialoguePanel from './GameRoom/NpcDialoguePanel';
import { FullPagePixelLoader } from './PixelLoader';

export default function GameRoom() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { room, story, joinRoom, leaveRoom, player, socketConnected } = useGame();
  const [initialized, setInitialized] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState('players'); // 'players' | 'history' | 'characters' | 'skills' | 'npc'
  const [copied, setCopied] = useState(false);
  const [showMurdererGuide, setShowMurdererGuide] = useState(false);

  // 复制房间ID
  const copyRoomId = useCallback(() => {
    if (room?.id) {
      navigator.clipboard.writeText(String(room.id)).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }, [room?.id]);

  // 切换侧边栏
  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev);
  }, []);

  useEffect(() => {
    if (!player) {
      navigate('/');
      return;
    }

    if (!room && roomId) {
      joinRoom(roomId);
    } else if (room && room.id !== roomId) {
      joinRoom(roomId);
    }

    return () => {};
  }, [roomId, room, player, joinRoom, navigate]);

  // 加载状态
  if (!socketConnected) {
    return <FullPagePixelLoader text="正在连接服务器" icon="🌐" />;
  }

  if (!room) {
    return <FullPagePixelLoader text="正在加入房间" icon="🚪" />;
  }

  return (
    <div className="h-screen flex flex-col bg-pixel-bg overflow-hidden">
      {/* 顶部导航栏 - 精简高度 */}
      <header className="flex-shrink-0 bg-pixel-wood border-b-4 border-pixel-wood-dark px-4 py-2 shadow-pixel">
        <div className="max-w-full mx-auto flex items-center justify-between">
          {/* 左侧：房间信息 */}
          <div className="flex items-center gap-4">
            <div className="text-white">
              <h1 className="text-xl font-bold text-white" style={{ textShadow: '2px 2px 0 #5e3613' }}>
                📖 {room.name}
              </h1>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-sm text-pixel-text-light">
              {/* 房间ID复制按钮 */}
              <button
                onClick={copyRoomId}
                className="bg-pixel-wood-dark/50 px-2 py-0.5 rounded hover:bg-pixel-wood-dark/70 transition-colors flex items-center gap-1"
                title="点击复制房间ID，分享给好友加入"
              >
                <span className="text-xs opacity-70">ID:</span>
                <span className="font-mono text-xl font-bold tracking-widest">{room.id}</span>
                <span>{copied ? '✓' : '📋'}</span>
              </button>
              <span className="bg-pixel-wood-dark/50 px-2 py-0.5 rounded">
                {room.playerCount} 位冒险者
              </span>
              {room.hostId === player?.id && (
                <span className="bg-pixel-accent-yellow/80 text-pixel-wood-dark px-2 py-0.5 rounded font-bold">
                  👑 房主
                </span>
              )}
            </div>
          </div>

          {/* 右侧：操作按钮 */}
          <div className="flex items-center gap-2">
            {/* 侧边栏切换按钮 */}
            <button
              onClick={toggleSidebar}
              className="p-2 bg-pixel-wood-light border-2 border-pixel-wood-dark hover:brightness-110 transition-all"
              title={sidebarOpen ? '收起侧边栏' : '展开侧边栏'}
            >
              <span className="text-lg">{sidebarOpen ? '◀' : '▶'}</span>
            </button>
            {/* 凶手指南按钮 - 仅凶手可见 */}
            {player?.isMurderer && (
              <button
                onClick={() => setShowMurdererGuide(!showMurdererGuide)}
                className={`p-2 border-2 border-pixel-wood-dark hover:brightness-110 transition-all ${
                  showMurdererGuide ? 'bg-red-600 text-white' : 'bg-pixel-wood-light'
                }`}
                title="凶手秘密指南"
              >
                <span className="text-lg">🔪</span>
              </button>
            )}
            <button
              onClick={() => {
                leaveRoom();
                navigate('/');
              }}
              className="btn-secondary text-sm py-1.5 px-3"
            >
              离开
            </button>
          </div>
        </div>
      </header>

      {/* 凶手指南面板 - 浮动显示 */}
      {showMurdererGuide && player?.isMurderer && (
        <MurdererGuidePanel onClose={() => setShowMurdererGuide(false)} />
      )}

      {/* 主内容区 - 双栏布局 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：故事 + 输入（核心区域） */}
        <main className={`flex-1 flex flex-col transition-all duration-300 ${sidebarOpen ? 'mr-0' : ''}`}>
          {/* 故事面板 - 可滚动 */}
          <div className="flex-1 overflow-hidden">
            <StoryPanel />
          </div>
          
          {/* 输入面板 - 底部固定 */}
          <div className="flex-shrink-0 border-t-4 border-pixel-wood-dark bg-pixel-panel">
            <InputPanel />
          </div>
        </main>

        {/* 右侧边栏：玩家/历史（可折叠） */}
        <aside 
          className={`flex-shrink-0 border-l-4 border-pixel-wood-dark bg-pixel-panel overflow-hidden transition-all duration-300 ${
            sidebarOpen ? 'w-72 xl:w-80' : 'w-0'
          }`}
        >
          {sidebarOpen && (
            <div className="h-full flex flex-col w-72 xl:w-80">
              {/* 侧边栏标签切换 */}
              <div className="flex-shrink-0 flex flex-wrap border-b-4 border-pixel-wood-dark">
                <button
                  onClick={() => setSidebarTab('players')}
                  className={`flex-1 min-w-[60px] py-2 text-xs font-bold transition-colors ${
                    sidebarTab === 'players'
                      ? 'bg-pixel-accent-blue text-white'
                      : 'bg-pixel-wood-light text-pixel-wood-dark hover:brightness-110'
                  }`}
                >
                  👥 玩家
                </button>
                <button
                  onClick={() => setSidebarTab('characters')}
                  className={`flex-1 min-w-[60px] py-2 text-xs font-bold transition-colors ${
                    sidebarTab === 'characters'
                      ? 'bg-pixel-accent-yellow text-pixel-wood-dark'
                      : 'bg-pixel-wood-light text-pixel-wood-dark hover:brightness-110'
                  }`}
                >
                  🎭 角色
                </button>
                <button
                  onClick={() => setSidebarTab('skills')}
                  className={`flex-1 min-w-[60px] py-2 text-xs font-bold transition-colors ${
                    sidebarTab === 'skills'
                      ? 'bg-pixel-accent-purple text-white'
                      : 'bg-pixel-wood-light text-pixel-wood-dark hover:brightness-110'
                  }`}
                >
                  ⚔️ 技能
                </button>
                <button
                  onClick={() => setSidebarTab('npc')}
                  className={`flex-1 min-w-[60px] py-2 text-xs font-bold transition-colors ${
                    sidebarTab === 'npc'
                      ? 'bg-pixel-accent-green text-white'
                      : 'bg-pixel-wood-light text-pixel-wood-dark hover:brightness-110'
                  }`}
                >
                  🤖 NPC
                </button>
                <button
                  onClick={() => setSidebarTab('history')}
                  className={`flex-1 min-w-[60px] py-2 text-xs font-bold transition-colors ${
                    sidebarTab === 'history'
                      ? 'bg-pixel-accent-blue text-white'
                      : 'bg-pixel-wood-light text-pixel-wood-dark hover:brightness-110'
                  }`}
                >
                  📜 章节
                </button>
              </div>
              
              {/* 侧边栏内容 */}
              <div className="flex-1 overflow-y-auto">
                {sidebarTab === 'characters' ? (
                  <CharacterPanel />
                ) : sidebarTab === 'skills' ? (
                  <SkillPanel />
                ) : sidebarTab === 'npc' ? (
                  <NpcDialoguePanel />
                ) : (
                  <StatusPanel activeTab={sidebarTab} />
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

