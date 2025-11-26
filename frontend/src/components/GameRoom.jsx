import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import StoryPanel from './GameRoom/StoryPanel';
import InputPanel from './GameRoom/InputPanel';
import StatusPanel from './GameRoom/StatusPanel';

export default function GameRoom() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { room, story, joinRoom, leaveRoom, player, socketConnected } = useGame();
  const [initialized, setInitialized] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState('players'); // 'players' | 'history'

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
    return (
      <div className="min-h-screen flex items-center justify-center bg-pixel-bg">
        <div className="text-center card bg-pixel-panel">
          <div className="text-xl mb-4 font-bold">正在连接服务器...</div>
          <div className="flex justify-center">
            <div className="w-12 h-12 border-4 border-pixel-accent-blue border-t-transparent animate-spin"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pixel-bg">
        <div className="text-center card bg-pixel-panel">
          <div className="text-xl mb-4 font-bold">正在加入房间...</div>
          <div className="flex justify-center">
            <div className="w-12 h-12 border-4 border-pixel-accent-blue border-t-transparent animate-spin"></div>
          </div>
        </div>
      </div>
    );
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
              <div className="flex-shrink-0 flex border-b-4 border-pixel-wood-dark">
                <button
                  onClick={() => setSidebarTab('players')}
                  className={`flex-1 py-2 text-sm font-bold transition-colors ${
                    sidebarTab === 'players'
                      ? 'bg-pixel-accent-blue text-white'
                      : 'bg-pixel-wood-light text-pixel-wood-dark hover:brightness-110'
                  }`}
                >
                  👥 玩家
                </button>
                <button
                  onClick={() => setSidebarTab('history')}
                  className={`flex-1 py-2 text-sm font-bold transition-colors ${
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
                <StatusPanel activeTab={sidebarTab} />
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

