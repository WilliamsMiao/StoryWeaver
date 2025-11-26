import { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext';

/**
 * 章节历史浏览组件
 * 显示时间线视图和章节导航
 */
export default function ChapterHistory() {
  const { story } = useGame();
  const [selectedChapter, setSelectedChapter] = useState(null);
  
  // 无故事或无章节时显示空状态
  if (!story || !story.chapters || story.chapters.length === 0) {
    return (
      <div className="text-center py-6 text-pixel-text-muted">
        <div className="text-3xl mb-2">📜</div>
        <p className="text-sm font-bold">暂无章节历史</p>
        <p className="text-xs mt-1">故事开始后，章节将显示在这里</p>
      </div>
    );
  }
  
  const chapters = story.chapters;
  
  // 格式化日期（更紧凑）
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  return (
    <div>
      <h3 className="text-sm font-bold mb-3 text-pixel-wood-dark flex items-center gap-2">
        <span>📜</span>
        <span>章节历史 ({chapters.length})</span>
      </h3>
      
      {/* 时间线视图（紧凑） */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {chapters.map((chapter, index) => (
          <div
            key={chapter.id || index}
            className="relative pl-5 cursor-pointer group"
            onClick={() => setSelectedChapter(selectedChapter === chapter.id ? null : chapter.id)}
          >
            {/* 时间线 */}
            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-pixel-wood-dark"></div>
            <div className="absolute left-[-3px] top-2 w-2 h-2 bg-pixel-accent-yellow border border-pixel-wood-dark"></div>
            
            {/* 章节卡片 */}
            <div className={`p-2 bg-pixel-wood-light border-2 border-pixel-wood-dark transition-all ${
              selectedChapter === chapter.id ? 'bg-pixel-accent-yellow/20' : 'group-hover:brightness-110'
            }`}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-pixel-wood-dark">
                  第 {chapter.chapterNumber} 章
                </span>
                <span className="text-pixel-text-muted">
                  {formatDate(chapter.createdAt)}
                </span>
              </div>
              
              {/* 章节摘要 */}
              {chapter.summary && (
                <p className={`text-xs text-pixel-text-muted mt-1 ${
                  selectedChapter === chapter.id ? '' : 'line-clamp-1'
                }`}>
                  {chapter.summary}
                </p>
              )}
              
              {/* 展开的内容预览 */}
              {selectedChapter === chapter.id && chapter.content && (
                <div className="mt-2 p-2 bg-white/50 border border-pixel-wood-dark text-xs text-pixel-text max-h-24 overflow-y-auto">
                  {chapter.content.substring(0, 200)}...
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

