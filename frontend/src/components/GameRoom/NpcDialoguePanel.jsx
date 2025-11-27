import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../../context/GameContext';
import socketManager from '../../utils/socket';

/**
 * NPC对话面板
 * 允许玩家与NPC进行公开或私密对话
 */
export default function NpcDialoguePanel() {
  const { myCharacter, room, npcs: contextNpcs, npcDialogues, chatWithNpc } = useGame();
  const [selectedNpc, setSelectedNpc] = useState(null);
  const [message, setMessage] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [dialogueHistory, setDialogueHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const dialogueEndRef = useRef(null);

  // 获取NPC列表（其他玩家的角色 + 脚本NPC）
  const npcList = [
    ...(contextNpcs || []),
    ...(room?.players?.filter(p => 
      p.characterId && p.id !== myCharacter?.playerId
    ).map(p => ({
      id: p.characterId,
      name: p.characterName || p.username,
      occupation: p.occupation
    })) || [])
  ];

  // 滚动到对话底部
  useEffect(() => {
    dialogueEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dialogueHistory]);

  // 监听NPC响应
  useEffect(() => {
    const handleNpcResponse = (data) => {
      if (data.playerId !== myCharacter?.playerId) {
        // 其他玩家与NPC的公开对话
        setDialogueHistory(prev => [...prev, {
          type: 'public',
          playerName: data.playerName,
          npcName: data.npcName,
          response: data.response,
          emotionalTone: data.emotionalTone,
          timestamp: Date.now()
        }]);
      }
    };

    socketManager.on('npc_response', handleNpcResponse);
    return () => socketManager.off('npc_response', handleNpcResponse);
  }, [myCharacter]);

  // 同步context中的对话历史
  useEffect(() => {
    if (selectedNpc && npcDialogues[selectedNpc.id]) {
      const contextMessages = npcDialogues[selectedNpc.id].map(msg => ({
        type: msg.isNpc ? 'npc' : 'player',
        npcName: msg.isNpc ? msg.sender : selectedNpc.name,
        message: msg.content,
        response: msg.content,
        emotionalTone: msg.emotion,
        timestamp: msg.timestamp
      }));
      setDialogueHistory(contextMessages);
    }
  }, [selectedNpc, npcDialogues]);

  // 发送消息给NPC
  const handleSendMessage = async () => {
    if (!selectedNpc || !message.trim()) return;

    setLoading(true);
    
    // 添加玩家消息到历史
    setDialogueHistory(prev => [...prev, {
      type: 'player',
      npcName: selectedNpc.name,
      message: message.trim(),
      isPrivate,
      timestamp: Date.now()
    }]);

    try {
      const response = await chatWithNpc(selectedNpc.id, message.trim(), !isPrivate);
      
      if (response.success) {
        setDialogueHistory(prev => [...prev, {
          type: 'npc',
          npcName: response.npcName || selectedNpc.name,
          response: response.response,
          emotionalTone: response.emotionalTone || response.emotion,
          isPrivate,
          revealedInfo: response.revealedInfo,
          timestamp: Date.now()
        }]);
        setMessage('');
      } else {
        setDialogueHistory(prev => [...prev, {
          type: 'error',
          message: response.error || '对话失败',
          timestamp: Date.now()
        }]);
      }
    } catch (error) {
      setDialogueHistory(prev => [...prev, {
        type: 'error',
        message: error.message || '对话失败',
        timestamp: Date.now()
      }]);
    } finally {
      setLoading(false);
    }
  };

  // 获取情感图标
  const getEmotionIcon = (tone) => {
    switch (tone) {
      case 'nervous': return '😰';
      case 'angry': return '😠';
      case 'sad': return '😢';
      case 'suspicious': return '🤨';
      case 'cooperative': return '😊';
      case 'defensive': return '😤';
      case 'evasive': return '👀';
      default: return '😐';
    }
  };

  return (
    <div className="h-full flex flex-col bg-pixel-panel border-2 border-pixel-wood-dark font-pixel relative">
      {/* 装饰性边角 */}
      <div className="absolute top-1 left-1 right-1 bottom-1 border border-pixel-wood opacity-30 pointer-events-none"></div>

      {/* NPC列表 */}
      <div className="flex-shrink-0 p-3 border-b-2 border-pixel-wood-dark relative z-10">
        <h3 className="text-lg text-pixel-wood-dark font-bold uppercase mb-2 flex items-center">
          <span className="mr-2">👥</span> 选择角色对话
        </h3>
        <div className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar pr-1">
          {npcList.map(npc => (
            <button
              key={npc.id}
              onClick={() => setSelectedNpc(npc)}
              className={`w-full text-left p-2 border-2 transition-all transform active:scale-95
                ${selectedNpc?.id === npc.id 
                  ? 'bg-pixel-wood text-white border-pixel-wood-dark shadow-pixel-sm' 
                  : 'bg-pixel-bg/20 hover:bg-pixel-wood-light/30 text-pixel-wood-dark border-transparent hover:border-pixel-wood-dark'}`}
            >
              <div className="font-bold truncate text-lg">{npc.name}</div>
              {npc.occupation && (
                <div className="text-sm opacity-80 truncate">{npc.occupation}</div>
              )}
            </button>
          ))}
          {npcList.length === 0 && (
            <p className="text-pixel-text-muted text-lg text-center py-2 italic">暂无可对话角色</p>
          )}
        </div>
      </div>

      {/* 对话区域 */}
      {selectedNpc ? (
        <div className="flex-1 flex flex-col min-h-0 relative z-10">
          {/* 对话头部 */}
          <div className="p-2 border-b-2 border-pixel-wood-dark bg-pixel-bg/10 flex items-center justify-between">
            <span className="font-bold text-pixel-wood-dark text-lg">{selectedNpc.name}</span>
            <label className="flex items-center text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="mr-1 w-4 h-4 accent-pixel-wood-dark"
              />
              <span className={`font-bold ${isPrivate ? 'text-pixel-accent-red' : 'text-pixel-text-muted'}`}>
                {isPrivate ? '🔒 私密' : '🔓 公开'}
              </span>
            </label>
          </div>

          {/* 对话历史 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar bg-pixel-bg/5">
            {dialogueHistory
              .filter(d => !d.npcName || d.npcName === selectedNpc.name)
              .map((dialogue, index) => (
                <div key={index} className={`
                  ${dialogue.type === 'player' ? 'text-right' : ''}
                  ${dialogue.type === 'public' ? 'opacity-70' : ''}
                `}>
                  {dialogue.type === 'player' && (
                    <div className="inline-block bg-pixel-wood text-white border-2 border-pixel-wood-dark px-3 py-2 max-w-[90%] text-lg shadow-sm text-left">
                      <p>{dialogue.message}</p>
                      {dialogue.isPrivate && (
                        <span className="text-xs opacity-70 block mt-1 border-t border-white/30 pt-1">🔒 私密发送</span>
                      )}
                    </div>
                  )}
                  {dialogue.type === 'npc' && (
                    <div className="inline-block bg-white text-pixel-wood-dark border-2 border-pixel-wood-dark px-3 py-2 max-w-[90%] text-lg shadow-sm text-left">
                      <div className="flex items-center mb-1 text-sm border-b border-pixel-wood-dark/20 pb-1">
                        <span className="font-bold text-pixel-wood-dark">{dialogue.npcName}</span>
                        <span className="ml-2 text-xl">{getEmotionIcon(dialogue.emotionalTone)}</span>
                      </div>
                      <p>{dialogue.response}</p>
                      {dialogue.revealedInfo?.length > 0 && (
                        <div className="mt-2 text-sm text-pixel-accent-green font-bold border-t border-pixel-wood-dark/20 pt-1">
                          💡 {dialogue.revealedInfo.join(', ')}
                        </div>
                      )}
                    </div>
                  )}
                  {dialogue.type === 'error' && (
                    <div className="bg-pixel-accent-red/20 border-2 border-pixel-accent-red text-pixel-accent-red px-3 py-2 text-center text-sm font-bold">
                      {dialogue.message}
                    </div>
                  )}
                </div>
              ))}
            <div ref={dialogueEndRef} />
          </div>

          {/* 输入区 */}
          <div className="p-2 border-t-2 border-pixel-wood-dark bg-pixel-panel">
            <div className="flex gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder={`与 ${selectedNpc.name} 对话...`}
                className="flex-1 bg-white border-2 border-pixel-wood-dark px-3 py-2 text-pixel-wood-dark text-lg placeholder-pixel-text-muted focus:outline-none focus:border-pixel-accent-yellow font-pixel"
                disabled={loading}
              />
              <button
                onClick={handleSendMessage}
                disabled={!message.trim() || loading}
                className="px-4 py-2 bg-pixel-wood hover:bg-pixel-wood-light disabled:bg-gray-400 disabled:cursor-not-allowed text-white border-2 border-pixel-wood-dark shadow-pixel active:translate-y-1 active:shadow-none transition-all font-bold text-xl"
              >
                {loading ? '⏳' : '发送'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-pixel-text-muted p-4 relative z-10">
          <div className="text-center">
            <span className="text-4xl mb-4 block animate-bounce">👆</span>
            <p className="text-xl">请选择角色开始对话</p>
          </div>
        </div>
      )}
    </div>
  );
}
