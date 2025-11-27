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
    <div className="h-full flex flex-col bg-slate-900/50">
      {/* NPC列表 */}
      <div className="flex-shrink-0 p-3 border-b border-slate-700">
        <h3 className="text-xs text-gray-400 uppercase mb-2">选择角色对话</h3>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {npcList.map(npc => (
            <button
              key={npc.id}
              onClick={() => setSelectedNpc(npc)}
              className={`w-full text-left p-2 rounded text-sm transition-colors
                ${selectedNpc?.id === npc.id 
                  ? 'bg-indigo-600 text-white' 
                  : 'hover:bg-slate-700 text-gray-300 bg-slate-800'}`}
            >
              <div className="font-bold truncate">{npc.name}</div>
              {npc.occupation && (
                <div className="text-xs opacity-70 truncate">{npc.occupation}</div>
              )}
            </button>
          ))}
          {npcList.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-2">暂无可对话角色</p>
          )}
        </div>
      </div>

      {/* 对话区域 */}
      {selectedNpc ? (
        <div className="flex-1 flex flex-col min-h-0">
          {/* 对话头部 */}
          <div className="p-2 border-b border-slate-700 bg-slate-800/30">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-sm">{selectedNpc.name}</span>
              <label className="flex items-center text-xs">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  className="mr-1 w-3 h-3"
                />
                <span className={isPrivate ? 'text-amber-400' : 'text-gray-400'}>
                  🔒 私密
                </span>
              </label>
            </div>
          </div>

          {/* 对话历史 */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {dialogueHistory
              .filter(d => !d.npcName || d.npcName === selectedNpc.name)
              .map((dialogue, index) => (
                <div key={index} className={`
                  ${dialogue.type === 'player' ? 'text-right' : ''}
                  ${dialogue.type === 'public' ? 'opacity-70' : ''}
                `}>
                  {dialogue.type === 'player' && (
                    <div className="inline-block bg-indigo-600 text-white rounded-lg px-3 py-1.5 max-w-[85%] text-sm">
                      <p>{dialogue.message}</p>
                      {dialogue.isPrivate && (
                        <span className="text-xs opacity-70">🔒</span>
                      )}
                    </div>
                  )}
                  {dialogue.type === 'npc' && (
                    <div className="inline-block bg-slate-700 text-gray-100 rounded-lg px-3 py-1.5 max-w-[85%] text-sm">
                      <div className="flex items-center mb-1 text-xs">
                        <span className="font-bold text-amber-400">{dialogue.npcName}</span>
                        <span className="ml-1">{getEmotionIcon(dialogue.emotionalTone)}</span>
                      </div>
                      <p>{dialogue.response}</p>
                      {dialogue.revealedInfo?.length > 0 && (
                        <div className="mt-1 text-xs text-green-400 border-t border-slate-600 pt-1">
                          💡 {dialogue.revealedInfo.join(', ')}
                        </div>
                      )}
                    </div>
                  )}
                  {dialogue.type === 'error' && (
                    <div className="bg-red-900/30 text-red-400 rounded-lg px-3 py-1.5 text-center text-xs">
                      {dialogue.message}
                    </div>
                  )}
                </div>
              ))}
            <div ref={dialogueEndRef} />
          </div>

          {/* 输入区 */}
          <div className="p-2 border-t border-slate-700">
            <div className="flex gap-1">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder={`说...`}
                className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                disabled={loading}
              />
              <button
                onClick={handleSendMessage}
                disabled={!message.trim() || loading}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded text-sm transition-colors"
              >
                {loading ? '⏳' : '→'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-500 p-4">
          <div className="text-center text-sm">
            <span className="text-2xl mb-2 block">👆</span>
            <p>选择角色开始对话</p>
          </div>
        </div>
      )}
    </div>
  );
}
