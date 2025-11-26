import { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import socketManager from '../../utils/socket';
import CharacterCard from './CharacterCard';

/**
 * 角色面板组件 - 显示故事中的所有角色列表
 */
export default function CharacterPanel() {
  const { story, player } = useGame();
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [playerRole, setPlayerRole] = useState(null);

  useEffect(() => {
    if (story?.id) {
      loadCharacters();
      loadPlayerRole();
    }
  }, [story?.id]);

  const loadCharacters = () => {
    setLoading(true);
    
    // 添加超时保护
    const timeoutId = setTimeout(() => {
      setLoading(false);
      console.warn('⚠️ 获取角色列表超时');
    }, 5000);
    
    socketManager.emit('get_characters', { storyId: story.id }, (response) => {
      clearTimeout(timeoutId);
      setLoading(false);
      console.log('📋 get_characters 响应:', response);
      if (response?.success) {
        setCharacters(response.characters || []);
      } else {
        console.error('获取角色失败:', response?.error);
      }
    });
  };

  const loadPlayerRole = () => {
    socketManager.emit('get_player_role', { storyId: story.id }, (response) => {
      console.log('🎭 get_player_role 响应:', response);
      if (response?.success) {
        setPlayerRole(response.role);
      }
    });
  };

  // 分类角色
  const npcCharacters = characters.filter(c => c.character_type === 'npc');
  const playerCharacters = characters.filter(c => c.character_type === 'player');

  // 获取角色类型图标
  const getCharacterIcon = (char) => {
    if (char.character_type === 'player') return '🎭';
    if (char.is_suspect) return '🔍';
    if (char.occupation?.includes('管家') || char.occupation?.includes('仆人')) return '🧹';
    if (char.occupation?.includes('警') || char.occupation?.includes('探')) return '🕵️';
    return '👤';
  };

  // 获取嫌疑等级颜色
  const getSuspicionBadge = (level) => {
    if (level >= 7) return { color: 'bg-red-500', text: '高度嫌疑' };
    if (level >= 4) return { color: 'bg-orange-500', text: '有嫌疑' };
    if (level >= 1) return { color: 'bg-yellow-500', text: '待调查' };
    return null;
  };

  if (!story) {
    return (
      <div className="p-4 text-center text-gray-500">
        <span className="text-2xl">📖</span>
        <p className="mt-2 text-sm">故事尚未开始</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-amber-50/50">
      {/* 标题栏 */}
      <div className="flex-shrink-0 px-4 py-3 border-b-2 border-amber-300 bg-amber-100">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-amber-900" style={{ textShadow: '1px 1px 0 #fff' }}>
            🎭 角色档案
          </h3>
          <button 
            onClick={loadCharacters}
            className="text-xs px-2 py-1 bg-amber-200 hover:bg-amber-300 border border-amber-400 text-amber-800 font-bold"
          >
            刷新
          </button>
        </div>
      </div>

      {/* 我的角色卡片 */}
      {playerRole && (
        <div className="flex-shrink-0 mx-3 mt-3 p-3 bg-gradient-to-r from-blue-100 to-indigo-100 border-2 border-blue-400 rounded">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">🎭</span>
            <div className="font-bold text-blue-900">我的角色</div>
          </div>
          <div className="text-sm">
            <div className="font-bold text-blue-800">{playerRole.character_name}</div>
            <div className="text-xs text-blue-600">{playerRole.occupation}</div>
            {playerRole.special_ability && (
              <div className="mt-1 text-xs bg-blue-200/50 px-2 py-1 rounded">
                ✨ {playerRole.special_ability}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 角色列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading ? (
          <div className="text-center py-6">
            <div className="text-3xl animate-bounce">🔍</div>
            <p className="text-sm text-gray-500 mt-2">加载中...</p>
          </div>
        ) : characters.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            <span className="text-3xl">📝</span>
            <p className="mt-2 text-sm">暂无角色登场</p>
          </div>
        ) : (
          <>
            {/* NPC角色 */}
            {npcCharacters.length > 0 && (
              <div>
                <div className="text-xs font-bold text-amber-700 mb-2 flex items-center gap-1">
                  <span>👤</span> NPC角色 ({npcCharacters.length})
                </div>
                <div className="space-y-2">
                  {npcCharacters.map(char => {
                    const suspicionBadge = getSuspicionBadge(char.suspicion_level);
                    return (
                      <button
                        key={char.id}
                        onClick={() => setSelectedCharacter(char.id)}
                        className="w-full text-left p-3 bg-white border-2 border-amber-200 hover:border-amber-400 hover:bg-amber-50 transition-all group"
                        style={{ boxShadow: '2px 2px 0 rgba(0,0,0,0.1)' }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xl group-hover:scale-110 transition-transform">
                            {getCharacterIcon(char)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm text-gray-900 truncate">
                              {char.name}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {char.occupation || '身份不明'}
                            </div>
                          </div>
                          {suspicionBadge && (
                            <span className={`text-xs px-2 py-0.5 ${suspicionBadge.color} text-white font-bold`}>
                              {suspicionBadge.text}
                            </span>
                          )}
                          <span className="text-gray-400 group-hover:text-amber-600">→</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 玩家角色 */}
            {playerCharacters.length > 0 && (
              <div>
                <div className="text-xs font-bold text-blue-700 mb-2 flex items-center gap-1">
                  <span>🎭</span> 玩家角色 ({playerCharacters.length})
                </div>
                <div className="space-y-2">
                  {playerCharacters.map(char => (
                    <button
                      key={char.id}
                      onClick={() => setSelectedCharacter(char.id)}
                      className={`w-full text-left p-3 border-2 hover:bg-blue-50 transition-all group ${
                        char.player_id === player?.id 
                          ? 'bg-blue-100 border-blue-400' 
                          : 'bg-white border-blue-200 hover:border-blue-400'
                      }`}
                      style={{ boxShadow: '2px 2px 0 rgba(0,0,0,0.1)' }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl group-hover:scale-110 transition-transform">🎭</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm text-gray-900 truncate">
                            {char.name}
                            {char.player_id === player?.id && (
                              <span className="ml-1 text-xs text-blue-600">(我)</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 truncate">
                            {char.occupation || '调查员'}
                          </div>
                        </div>
                        <span className="text-gray-400 group-hover:text-blue-600">→</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 角色卡片弹窗 */}
      {selectedCharacter && (
        <CharacterCard
          characterId={selectedCharacter}
          onClose={() => setSelectedCharacter(null)}
        />
      )}
    </div>
  );
}
