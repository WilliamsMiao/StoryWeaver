import { useState, useEffect, useRef } from 'react';
import { useGame } from '../../context/GameContext';

/**
 * 防抖Hook
 */
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  
  return debouncedValue;
}

export default function InputPanel() {
  const { story, sendMessage, loading, player, room } = useGame();
  const [input, setInput] = useState('');
  const [charCount, setCharCount] = useState(0);
  const [messageType, setMessageType] = useState('global'); // 'global' | 'private' | 'player_to_player'
  const [recipientId, setRecipientId] = useState(null);
  const [recipientName, setRecipientName] = useState(null);
  const textareaRef = useRef(null);
  
  // 字符计数
  useEffect(() => {
    setCharCount(input.length);
  }, [input]);
  
  // 输入验证
  const validateInput = (text) => {
    if (text.length > 1000) {
      return { valid: false, error: '消息过长（最大1000字符）' };
    }
    if (text.trim().length === 0) {
      return { valid: false, error: '消息不能为空' };
    }
    return { valid: true };
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    
    const validation = validateInput(input);
    if (!validation.valid || loading) {
      return;
    }
    
    // 如果是玩家间消息但没有选择接收者，不允许发送
    if (messageType === 'player_to_player' && !recipientId) {
      return;
    }
    
    sendMessage(input.trim(), messageType, recipientId, recipientName);
    setInput('');
    setCharCount(0);
    
    // 重置接收者（私聊消息发送后重置）
    if (messageType === 'player_to_player') {
      setRecipientId(null);
      setRecipientName(null);
      setMessageType('global');
    }
    
    // 重置textarea高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };
  
  // 接收来自StatusPanel的私聊设置
  useEffect(() => {
    const handleSetRecipient = (event) => {
      if (event.detail && event.detail.playerId) {
        setRecipientId(event.detail.playerId);
        setRecipientName(event.detail.playerName);
        setMessageType('player_to_player');
        textareaRef.current?.focus();
      }
    };
    
    // 监听切换到故事机模式的事件（保留兼容性）
    const handleSwitchToStoryMachine = () => {
      setMessageType('private');
      setRecipientId(null);
      setRecipientName(null);
    };
    
    // 监听来自StoryPanel的消息类型切换事件
    const handleSwitchMessageType = (event) => {
      if (event.detail && event.detail.messageType) {
        setMessageType(event.detail.messageType);
        if (event.detail.messageType !== 'player_to_player') {
          setRecipientId(null);
          setRecipientName(null);
        }
      }
    };
    
    window.addEventListener('setRecipient', handleSetRecipient);
    window.addEventListener('switchToStoryMachine', handleSwitchToStoryMachine);
    window.addEventListener('switchMessageType', handleSwitchMessageType);
    return () => {
      window.removeEventListener('setRecipient', handleSetRecipient);
      window.removeEventListener('switchToStoryMachine', handleSwitchToStoryMachine);
      window.removeEventListener('switchMessageType', handleSwitchMessageType);
    };
  }, []);
  
  // 自动调整textarea高度
  const handleInputChange = (e) => {
    const value = e.target.value;
    setInput(value);
    
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  if (!story) {
    return (
      <div className="p-3 text-center">
        <p className="text-sm text-pixel-text-muted font-bold">
          ⏳ 等待故事初始化...
        </p>
      </div>
    );
  }

  return (
    <div className="p-3">
      {/* 消息类型 + 输入框 横向布局 */}
      <form onSubmit={handleSubmit} className="flex items-end gap-3">
        {/* 左侧：消息类型选择器（紧凑） */}
        <div className="flex-shrink-0 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => {
              setMessageType('global');
              setRecipientId(null);
              setRecipientName(null);
              window.dispatchEvent(new CustomEvent('switchViewMode', {
                detail: { viewMode: 'global' }
              }));
            }}
            className={`px-2 py-1 text-xs font-bold border-2 transition-all ${
              messageType === 'global'
                ? 'bg-pixel-accent-blue text-white border-white'
                : 'bg-pixel-wood-light text-pixel-wood-dark border-pixel-wood-dark hover:brightness-110'
            }`}
            title="全局消息：所有人可见"
          >
            💬
          </button>
          <button
            type="button"
            onClick={() => {
              setMessageType('private');
              setRecipientId(null);
              setRecipientName(null);
              window.dispatchEvent(new CustomEvent('switchViewMode', {
                detail: { viewMode: 'storyMachine' }
              }));
            }}
            className={`px-2 py-1 text-xs font-bold border-2 transition-all ${
              messageType === 'private'
                ? 'bg-pixel-accent-red text-white border-white'
                : 'bg-pixel-wood-light text-pixel-wood-dark border-pixel-wood-dark hover:brightness-110'
            }`}
            title="故事机：私密对话"
          >
            🤖
          </button>
          <button
            type="button"
            onClick={() => {
              setMessageType('player_to_player');
              window.dispatchEvent(new CustomEvent('switchViewMode', {
                detail: { viewMode: 'global' }
              }));
            }}
            className={`px-2 py-1 text-xs font-bold border-2 transition-all ${
              messageType === 'player_to_player'
                ? 'bg-pixel-accent-green text-white border-white'
                : 'bg-pixel-wood-light text-pixel-wood-dark border-pixel-wood-dark hover:brightness-110'
            }`}
            title="私聊：选择玩家私聊"
          >
            🤝
          </button>
        </div>

        {/* 中间：输入区域 */}
        <div className="flex-1 min-w-0">
          {/* 接收者提示（私聊时） */}
          {messageType === 'player_to_player' && (
            <div className={`mb-1 px-2 py-1 text-xs font-bold rounded ${
              recipientName 
                ? 'bg-pixel-accent-green/20 text-pixel-accent-green' 
                : 'bg-pixel-accent-yellow/20 text-pixel-accent-yellow'
            }`}>
              {recipientName ? (
                <span>
                  私聊 → {recipientName}
                  <button type="button" onClick={() => { setRecipientId(null); setRecipientName(null); }} className="ml-1 opacity-70 hover:opacity-100">✕</button>
                </span>
              ) : (
                '请从右侧选择玩家'
              )}
            </div>
          )}
          
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            className="input-field w-full resize-none text-sm"
            style={{ minHeight: '60px', maxHeight: '100px' }}
            placeholder={
              messageType === 'global' 
                ? '输入你的想法，影响故事发展...'
                : messageType === 'private'
                ? '与故事机私密对话...'
                : '输入私聊消息...'
            }
            disabled={loading}
            maxLength={1000}
          />
          
          {/* 字数提示 */}
          <div className="flex justify-between items-center mt-1 text-xs">
            <span className={`font-bold ${charCount > 900 ? 'text-pixel-accent-red' : 'text-pixel-text-muted'}`}>
              {charCount}/1000
            </span>
            <span className="text-pixel-text-muted">
              {messageType === 'global' && '💡 全局可见'}
              {messageType === 'private' && '🔒 仅你和AI'}
              {messageType === 'player_to_player' && '👤 玩家私聊'}
            </span>
          </div>
        </div>

        {/* 右侧：发送按钮 */}
        <button
          type="submit"
          disabled={loading || !input.trim() || charCount > 1000 || !story || (messageType === 'player_to_player' && !recipientId)}
          className="flex-shrink-0 btn-primary px-4 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          title={!story ? '请先初始化故事' : loading ? '生成中...' : '发送'}
        >
          {loading ? (
            <span className="flex items-center gap-1">
              <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
            </span>
          ) : (
            '发送'
          )}
        </button>
      </form>
    </div>
  );
}

