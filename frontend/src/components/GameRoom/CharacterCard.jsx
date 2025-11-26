import { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import socketManager from '../../utils/socket';

/**
 * 角色卡片组件 - 显示NPC/玩家角色信息和线索
 */
export default function CharacterCard({ characterId, characterName, onClose }) {
  const { story, player } = useGame();
  const [character, setCharacter] = useState(null);
  const [clueCards, setClueCards] = useState([]);
  const [playerRole, setPlayerRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('info'); // 'info' | 'clues' | 'relationships'

  useEffect(() => {
    if (characterId) {
      loadCharacterDetails();
    }
  }, [characterId]);

  const loadCharacterDetails = () => {
    setLoading(true);
    setError(null);
    
    socketManager.emit('get_character_details', { characterId }, (response) => {
      setLoading(false);
      if (response.success) {
        setCharacter(response.character);
        setClueCards(response.clueCards || []);
        setPlayerRole(response.playerRole);
      } else {
        setError(response.error || '加载失败');
      }
    });
  };

  const handleDiscoverClue = (clueCardId) => {
    socketManager.emit('discover_clue', { 
      clueCardId, 
      storyId: story?.id 
    }, (response) => {
      if (response.success) {
        // 刷新线索列表
        loadCharacterDetails();
      }
    });
  };

  // 获取角色类型图标
  const getCharacterIcon = (type) => {
    switch (type) {
      case 'player': return '🎭';
      case 'victim': return '💀';
      case 'suspect': return '🔍';
      case 'witness': return '👁️';
      default: return '👤';
    }
  };

  // 获取嫌疑等级颜色
  const getSuspicionColor = (level) => {
    if (level >= 7) return 'text-red-600 bg-red-100';
    if (level >= 4) return 'text-orange-600 bg-orange-100';
    if (level >= 1) return 'text-yellow-600 bg-yellow-100';
    return 'text-gray-600 bg-gray-100';
  };

  // 获取线索重要性样式
  const getImportanceStyle = (importance) => {
    switch (importance) {
      case 5: return 'border-red-500 bg-red-50';
      case 4: return 'border-orange-500 bg-orange-50';
      case 3: return 'border-yellow-500 bg-yellow-50';
      case 2: return 'border-blue-500 bg-blue-50';
      default: return 'border-gray-300 bg-gray-50';
    }
  };

  // 获取线索类别图标
  const getClueCategoryIcon = (category) => {
    switch (category) {
      case '行为线索': return '🕵️';
      case '物证': return '🔎';
      case '证词': return '💬';
      case '关系': return '🔗';
      case '背景': return '📜';
      default: return '📌';
    }
  };

  if (!characterId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="relative w-full max-w-md mx-4 bg-gradient-to-b from-amber-50 to-white border-4 border-amber-800 shadow-2xl max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ 
          boxShadow: '8px 8px 0 rgba(0,0,0,0.3)',
          borderRadius: '4px'
        }}
      >
        {/* 卡片顶部装饰 */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600"></div>
        
        {/* 关闭按钮 */}
        <button 
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center bg-red-500 text-white font-bold border-2 border-red-700 hover:bg-red-600 transition-colors"
          style={{ boxShadow: '2px 2px 0 rgba(0,0,0,0.3)' }}
        >
          ✕
        </button>

        {loading ? (
          <div className="p-8 text-center">
            <div className="text-4xl animate-bounce mb-4">🔍</div>
            <p className="text-amber-800 font-bold">调查中...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <div className="text-4xl mb-4">❌</div>
            <p className="text-red-600">{error}</p>
          </div>
        ) : character ? (
          <>
            {/* 头部信息 */}
            <div className="p-4 pt-6 bg-gradient-to-b from-amber-100 to-transparent">
              <div className="flex items-start gap-4">
                {/* 角色头像 */}
                <div className="flex-shrink-0 w-20 h-20 bg-amber-200 border-4 border-amber-700 flex items-center justify-center text-4xl"
                  style={{ boxShadow: '3px 3px 0 rgba(0,0,0,0.2)' }}>
                  {getCharacterIcon(character.character_type)}
                </div>
                
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-amber-900" style={{ textShadow: '1px 1px 0 #fff' }}>
                    {character.name}
                  </h2>
                  <p className="text-sm text-amber-700">{character.occupation || '身份不明'}</p>
                  {character.age && <p className="text-xs text-amber-600">年龄: {character.age}</p>}
                  
                  {/* 嫌疑等级 */}
                  {character.is_suspect === 1 && (
                    <div className={`inline-block mt-2 px-2 py-0.5 text-xs font-bold rounded ${getSuspicionColor(character.suspicion_level)}`}>
                      嫌疑度: {'★'.repeat(Math.min(character.suspicion_level, 5))}{'☆'.repeat(Math.max(5 - character.suspicion_level, 0))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 选项卡 */}
            <div className="flex border-b-2 border-amber-300 bg-amber-50">
              <button 
                onClick={() => setActiveTab('info')}
                className={`flex-1 px-4 py-2 text-sm font-bold transition-colors ${
                  activeTab === 'info' 
                    ? 'bg-amber-200 text-amber-900 border-b-2 border-amber-600' 
                    : 'text-amber-700 hover:bg-amber-100'
                }`}
              >
                📋 资料
              </button>
              <button 
                onClick={() => setActiveTab('clues')}
                className={`flex-1 px-4 py-2 text-sm font-bold transition-colors relative ${
                  activeTab === 'clues' 
                    ? 'bg-amber-200 text-amber-900 border-b-2 border-amber-600' 
                    : 'text-amber-700 hover:bg-amber-100'
                }`}
              >
                🔍 线索
                {clueCards.length > 0 && (
                  <span className="absolute top-1 right-2 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                    {clueCards.length}
                  </span>
                )}
              </button>
              <button 
                onClick={() => setActiveTab('relationships')}
                className={`flex-1 px-4 py-2 text-sm font-bold transition-colors ${
                  activeTab === 'relationships' 
                    ? 'bg-amber-200 text-amber-900 border-b-2 border-amber-600' 
                    : 'text-amber-700 hover:bg-amber-100'
                }`}
              >
                🔗 关系
              </button>
            </div>

            {/* 内容区域 */}
            <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 220px)' }}>
              {activeTab === 'info' && (
                <div className="space-y-3">
                  {character.personality && (
                    <div className="bg-white p-3 border-2 border-amber-300">
                      <div className="text-xs text-amber-600 font-bold mb-1">性格特点</div>
                      <p className="text-sm text-gray-800">{character.personality}</p>
                    </div>
                  )}
                  {character.background && (
                    <div className="bg-white p-3 border-2 border-amber-300">
                      <div className="text-xs text-amber-600 font-bold mb-1">背景信息</div>
                      <p className="text-sm text-gray-800">{character.background}</p>
                    </div>
                  )}
                  {character.secret && character.secret !== '???' && (
                    <div className="bg-red-50 p-3 border-2 border-red-300">
                      <div className="text-xs text-red-600 font-bold mb-1">🔒 隐藏秘密</div>
                      <p className="text-sm text-red-800">{character.secret}</p>
                    </div>
                  )}
                  {character.secret === '???' && (
                    <div className="bg-gray-100 p-3 border-2 border-gray-300 text-center">
                      <span className="text-2xl">🔒</span>
                      <p className="text-xs text-gray-500 mt-1">需要发现更多线索才能解锁秘密</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'clues' && (
                <div className="space-y-2">
                  {clueCards.length === 0 ? (
                    <div className="text-center py-6 text-gray-500">
                      <span className="text-3xl">🔎</span>
                      <p className="mt-2 text-sm">暂未发现相关线索</p>
                      <p className="text-xs mt-1">继续调查以获取更多信息</p>
                    </div>
                  ) : (
                    clueCards.map((clue, index) => (
                      <div 
                        key={clue.id || index}
                        className={`p-3 border-2 ${getImportanceStyle(clue.clue_importance)}`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">{getClueCategoryIcon(clue.clue_category)}</span>
                          <span className="text-xs px-2 py-0.5 bg-amber-200 text-amber-800 font-bold">
                            {clue.clue_category}
                          </span>
                          <span className="flex-1"></span>
                          <span className="text-xs text-gray-400">
                            {'⭐'.repeat(clue.clue_importance)}
                          </span>
                        </div>
                        <h4 className="font-bold text-sm text-gray-900">{clue.clue_title}</h4>
                        <p className="text-sm text-gray-700 mt-1">{clue.clue_content}</p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'relationships' && (
                <div className="space-y-2">
                  {character.relationships && Object.keys(character.relationships).length > 0 ? (
                    Object.entries(character.relationships).map(([name, relation], index) => (
                      <div key={index} className="flex items-center gap-3 p-2 bg-white border-2 border-amber-200">
                        <span className="text-xl">👤</span>
                        <div className="flex-1">
                          <div className="font-bold text-sm">{name}</div>
                          <div className="text-xs text-gray-600">{relation}</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 text-gray-500">
                      <span className="text-3xl">🔗</span>
                      <p className="mt-2 text-sm">暂无已知关系</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 底部装饰 */}
            <div className="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600"></div>
          </>
        ) : null}
      </div>
    </div>
  );
}
