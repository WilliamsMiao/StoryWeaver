/**
 * 剧本选择器组件
 * 用于在游戏房间中选择预制剧本
 */

import { useState, useEffect } from 'react';

export default function ScriptSelector({ onSelect, onCancel }) {
  const [scripts, setScripts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedScript, setSelectedScript] = useState(null);
  const [filter, setFilter] = useState({
    theme: '',
    playerCount: '',
    difficulty: ''
  });

  // 加载可用剧本
  useEffect(() => {
    fetchScripts();
  }, []);

  const fetchScripts = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:3000/api/scripts?status=published');
      const data = await res.json();
      
      if (data.success) {
        setScripts(data.scripts);
      } else {
        setError('加载剧本失败');
      }
    } catch (err) {
      console.error('获取剧本列表失败:', err);
      setError('无法连接到服务器');
    } finally {
      setLoading(false);
    }
  };

  // 过滤剧本
  const filteredScripts = scripts.filter(script => {
    if (filter.theme && script.theme !== filter.theme) return false;
    if (filter.difficulty && script.difficulty !== parseInt(filter.difficulty)) return false;
    return true;
  });

  // 主题名称映射
  const themeNames = {
    mansion_murder: '🏰 庄园谋杀',
    corporate_secrets: '🏢 公司机密',
    historical_mystery: '📜 历史悬疑',
    campus_mystery: '🎓 校园悬疑',
    supernatural: '👻 超自然悬疑'
  };

  // 难度显示
  const getDifficultyStars = (level) => {
    return '⭐'.repeat(level) + '☆'.repeat(5 - level);
  };

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="text-4xl mb-4 animate-bounce">📚</div>
        <p className="text-pixel-text-muted">正在加载剧本库...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <div className="text-4xl mb-4">❌</div>
        <p className="text-red-500 mb-4">{error}</p>
        <button onClick={fetchScripts} className="btn-secondary">
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="script-selector">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-pixel-wood-dark flex items-center gap-2">
          📚 选择剧本
        </h2>
        <button
          onClick={onCancel}
          className="text-gray-500 hover:text-gray-700 text-xl"
        >
          ✕
        </button>
      </div>

      {/* 筛选器 */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <select
          value={filter.theme}
          onChange={(e) => setFilter(prev => ({ ...prev, theme: e.target.value }))}
          className="input-field text-sm py-1"
        >
          <option value="">全部主题</option>
          <option value="mansion_murder">庄园谋杀</option>
          <option value="corporate_secrets">公司机密</option>
          <option value="historical_mystery">历史悬疑</option>
          <option value="campus_mystery">校园悬疑</option>
          <option value="supernatural">超自然悬疑</option>
        </select>

        <select
          value={filter.difficulty}
          onChange={(e) => setFilter(prev => ({ ...prev, difficulty: e.target.value }))}
          className="input-field text-sm py-1"
        >
          <option value="">全部难度</option>
          <option value="1">⭐ 简单</option>
          <option value="2">⭐⭐ 较易</option>
          <option value="3">⭐⭐⭐ 中等</option>
          <option value="4">⭐⭐⭐⭐ 较难</option>
          <option value="5">⭐⭐⭐⭐⭐ 困难</option>
        </select>
      </div>

      {/* 剧本列表 */}
      {filteredScripts.length === 0 ? (
        <div className="text-center py-8 text-pixel-text-muted">
          <div className="text-4xl mb-2">📭</div>
          <p>暂无可用剧本</p>
          <p className="text-sm mt-2">请先在剧本工厂生成并发布剧本</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
          {filteredScripts.map(script => (
            <div
              key={script.id}
              onClick={() => setSelectedScript(script)}
              className={`
                p-4 rounded-lg border-2 cursor-pointer transition-all
                ${selectedScript?.id === script.id 
                  ? 'border-pixel-accent-yellow bg-pixel-accent-yellow/10' 
                  : 'border-pixel-wood-light hover:border-pixel-wood-dark bg-white'}
              `}
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-pixel-wood-dark">{script.title}</h3>
                <span className="text-xs px-2 py-0.5 bg-pixel-wood-light rounded">
                  {themeNames[script.theme] || script.theme}
                </span>
              </div>
              
              <p className="text-sm text-pixel-text-muted mb-2 line-clamp-2">
                {script.description || '暂无描述'}
              </p>
              
              <div className="flex gap-4 text-xs text-pixel-text-muted">
                <span>👥 {script.min_players}-{script.max_players}人</span>
                <span>{getDifficultyStars(script.difficulty)}</span>
                <span>⏱️ {script.estimated_duration || 90}分钟</span>
                {script.play_count > 0 && (
                  <span>🎮 {script.play_count}次游玩</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 选中剧本的详情和确认 */}
      {selectedScript && (
        <div className="mt-4 p-4 bg-pixel-accent-yellow/20 rounded-lg border-2 border-pixel-accent-yellow">
          <h4 className="font-bold mb-2">已选择: {selectedScript.title}</h4>
          <p className="text-sm text-pixel-text-muted mb-3">
            {selectedScript.description}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => onSelect(selectedScript)}
              className="btn-primary flex-1"
            >
              🎮 开始游戏
            </button>
            <button
              onClick={() => setSelectedScript(null)}
              className="btn-secondary"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 没有选中时的提示 */}
      {!selectedScript && filteredScripts.length > 0 && (
        <div className="mt-4 text-center text-sm text-pixel-text-muted">
          👆 点击选择一个剧本开始游戏
        </div>
      )}
    </div>
  );
}
