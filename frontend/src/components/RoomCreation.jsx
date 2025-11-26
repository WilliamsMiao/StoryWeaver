import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { v4 as uuidv4 } from 'uuid';

export default function RoomCreation() {
  const navigate = useNavigate();
  const { player, savePlayer, createRoom, joinRoom, room, error, setError } = useGame();
  const [mode, setMode] = useState('username'); // username, create, join
  const [username, setUsername] = useState(player?.username || '');
  const [roomName, setRoomName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [background, setBackground] = useState('');
  const [aiProvider, setAiProvider] = useState('deepseek');

  useEffect(() => {
    if (room) {
      navigate(`/room/${room.id}`);
    }
  }, [room, navigate]);

  const handleSetUsername = (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('请输入用户名');
      return;
    }
    
    const playerData = {
      id: player?.id || uuidv4(),
      username: username.trim()
    };
    savePlayer(playerData);
    setMode('create');
  };

  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (!roomName.trim()) {
      setError('请输入房间名称');
      return;
    }
    createRoom(roomName, background, aiProvider);
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!roomId.trim()) {
      setError('请输入房间ID');
      return;
    }
    joinRoom(roomId.trim());
  };

  const backgrounds = [
    { value: '', label: '自定义' },
    { value: '在一个遥远的魔法世界中，魔法师们掌握着强大的力量...', label: '魔法世界' },
    { value: '未来的地球，科技高度发达，人工智能与人类共存...', label: '科幻未来' },
    { value: '古代江湖，武林高手云集，恩怨情仇交织...', label: '武侠江湖' },
    { value: '现代都市，隐藏着超自然力量的秘密组织...', label: '现代都市' },
    { value: '末日废土，幸存者们为了生存而战斗...', label: '末日废土' }
  ];

  if (mode === 'username') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-pixel-bg">
        <div className="card max-w-md w-full bg-pixel-panel">
          <h1 className="text-4xl font-bold mb-2 text-center text-pixel-wood-dark" style={{ textShadow: '2px 2px 0 #fff' }}>StoryWeaver</h1>
          <p className="text-pixel-text-muted text-center mb-6">AI驱动的多人互动写作游戏</p>
          
          <form onSubmit={handleSetUsername}>
            <div className="mb-4">
              <label className="block text-lg font-bold mb-2 text-pixel-wood-dark">用户名</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-field w-full"
                placeholder="输入你的用户名"
                required
              />
            </div>
            
            {error && (
              <div className="mb-4 p-3 bg-pixel-accent-red/20 border-2 border-pixel-accent-red text-pixel-accent-red text-sm font-bold">
                {error}
              </div>
            )}
            
            <button type="submit" className="btn-primary w-full text-xl">
              开始游戏
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-pixel-bg">
      <div className="card max-w-2xl w-full bg-pixel-panel">
        <h1 className="text-3xl font-bold mb-6 text-center text-pixel-wood-dark" style={{ textShadow: '2px 2px 0 #fff' }}>创建或加入房间</h1>
        
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setMode('create')}
            className={`flex-1 py-2 px-4 font-bold transition-all transform active:translate-y-1 border-2 shadow-pixel ${
              mode === 'create'
                ? 'bg-pixel-accent-blue text-white border-white'
                : 'bg-pixel-wood-light text-pixel-wood-dark border-pixel-wood-dark hover:brightness-110'
            }`}
          >
            创建房间
          </button>
          <button
            onClick={() => setMode('join')}
            className={`flex-1 py-2 px-4 font-bold transition-all transform active:translate-y-1 border-2 shadow-pixel ${
              mode === 'join'
                ? 'bg-pixel-accent-blue text-white border-white'
                : 'bg-pixel-wood-light text-pixel-wood-dark border-pixel-wood-dark hover:brightness-110'
            }`}
          >
            加入房间
          </button>
        </div>

        {mode === 'create' ? (
          <form onSubmit={handleCreateRoom}>
            <div className="mb-4">
              <label className="block text-lg font-bold mb-2 text-pixel-wood-dark">房间名称</label>
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                className="input-field w-full"
                placeholder="输入房间名称"
                required
              />
            </div>

            <div className="mb-4">
              <label className="block text-lg font-bold mb-2 text-pixel-wood-dark">故事背景</label>
              <select
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                className="input-field w-full cursor-pointer"
              >
                {backgrounds.map(bg => (
                  <option key={bg.value} value={bg.value}>{bg.label}</option>
                ))}
              </select>
              {background && (
                <textarea
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  className="input-field w-full mt-2"
                  rows="3"
                  placeholder="或自定义故事背景..."
                />
              )}
            </div>

            <div className="mb-4">
              <label className="block text-lg font-bold mb-2 text-pixel-wood-dark">AI提供商</label>
              <select
                value={aiProvider}
                onChange={(e) => setAiProvider(e.target.value)}
                className="input-field w-full cursor-pointer"
              >
                <option value="deepseek">DeepSeek</option>
                <option value="openai">OpenAI</option>
                <option value="qwen">Qwen</option>
                <option value="local">本地模型</option>
              </select>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-pixel-accent-red/20 border-2 border-pixel-accent-red text-pixel-accent-red text-sm font-bold">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full text-xl">
              创建房间
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoinRoom}>
            <div className="mb-4">
              <label className="block text-lg font-bold mb-2 text-pixel-wood-dark">房间ID</label>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="input-field w-full"
                placeholder="输入房间ID"
                required
              />
            </div>

            {error && (
              <div className="mb-4 p-3 bg-pixel-accent-red/20 border-2 border-pixel-accent-red text-pixel-accent-red text-sm font-bold">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full text-xl">
              加入房间
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

