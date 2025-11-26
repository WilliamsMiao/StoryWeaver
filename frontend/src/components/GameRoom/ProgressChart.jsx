import { useGame } from '../../context/GameContext';

/**
 * 故事进度可视化组件
 * 显示章节进度条和统计信息
 */
export default function ProgressChart({ compact = false }) {
  const { story } = useGame();
  
  if (!story || !story.chapters || story.chapters.length === 0) {
    return null;
  }
  
  const totalChapters = story.chapters.length;
  const completedChapters = story.chapters.filter(ch => ch.status === 'completed' || ch.summary).length;
  const progress = totalChapters > 0 ? (completedChapters / totalChapters) * 100 : 0;
  
  // 计算总字数
  const totalWords = story.chapters.reduce((sum, ch) => {
    return sum + (ch.wordCount || ch.content?.length || 0);
  }, 0);
  
  // 紧凑模式（用于侧边栏）
  if (compact) {
    return (
      <div>
        <h3 className="text-sm font-bold mb-2 text-pixel-wood-dark flex items-center gap-2">
          <span>📊</span>
          <span>故事进度</span>
        </h3>
        
        {/* 进度条（紧凑） */}
        <div className="mb-2">
          <div className="flex justify-between items-center text-xs mb-1">
            <span className="text-pixel-text-muted">{totalChapters} 章</span>
            <span className="font-bold text-pixel-wood-dark">{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-pixel-wood-dark h-2">
            <div
              className="bg-pixel-accent-blue h-full transition-all"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
        
        {/* 章节块状指示器 */}
        <div className="flex gap-0.5 flex-wrap">
          {story.chapters.slice(-8).map((chapter, index) => (
            <div
              key={chapter.id || index}
              className={`w-3 h-3 border border-pixel-wood-dark ${
                chapter.summary || chapter.status === 'completed'
                  ? 'bg-pixel-accent-green'
                  : chapter.status === 'active'
                  ? 'bg-pixel-accent-blue'
                  : 'bg-pixel-wood-light'
              }`}
              title={`第${chapter.chapterNumber}章`}
            ></div>
          ))}
        </div>
        
        {/* 简要统计 */}
        <div className="flex justify-between text-xs text-pixel-text-muted mt-2">
          <span>总字数: {totalWords.toLocaleString()}</span>
        </div>
      </div>
    );
  }
  
  // 完整模式（原版）
  const avgChapterLength = totalChapters > 0 
    ? Math.round(totalWords / totalChapters) 
    : 0;
  
  return (
    <div className="card bg-pixel-panel">
      <h3 className="text-lg font-bold mb-3 text-pixel-wood-dark">故事进度</h3>
      
      {/* 进度条 */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-pixel-text-muted font-bold">总体进度</span>
          <span className="text-sm font-bold text-pixel-wood-dark">{Math.round(progress)}%</span>
        </div>
        <div className="w-full bg-pixel-wood-dark h-4 border-2 border-pixel-wood-dark">
          <div
            className="bg-pixel-accent-blue h-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      </div>
      
      {/* 统计信息 */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-pixel-wood-light border-2 border-pixel-wood-dark p-2 shadow-pixel-sm">
          <div className="text-pixel-text-muted text-xs mb-1 font-bold">总章节</div>
          <div className="text-lg font-bold text-pixel-wood-dark">{totalChapters}</div>
        </div>
        <div className="bg-pixel-wood-light border-2 border-pixel-wood-dark p-2 shadow-pixel-sm">
          <div className="text-pixel-text-muted text-xs mb-1 font-bold">已完成</div>
          <div className="text-lg font-bold text-pixel-wood-dark">{completedChapters}</div>
        </div>
        <div className="bg-pixel-wood-light border-2 border-pixel-wood-dark p-2 shadow-pixel-sm">
          <div className="text-pixel-text-muted text-xs mb-1 font-bold">总字数</div>
          <div className="text-lg font-bold text-pixel-wood-dark">{totalWords.toLocaleString()}</div>
        </div>
        <div className="bg-pixel-wood-light border-2 border-pixel-wood-dark p-2 shadow-pixel-sm">
          <div className="text-pixel-text-muted text-xs mb-1 font-bold">平均长度</div>
          <div className="text-lg font-bold text-pixel-wood-dark">{avgChapterLength.toLocaleString()}</div>
        </div>
      </div>
      
      {/* 章节进度可视化 */}
      <div className="mt-4">
        <div className="text-xs text-pixel-text-muted mb-2 font-bold">章节分布</div>
        <div className="flex gap-1 flex-wrap">
          {story.chapters.slice(-10).map((chapter, index) => (
            <div
              key={chapter.id || index}
              className={`h-4 flex-1 min-w-[20px] border-2 border-black ${
                chapter.summary || chapter.status === 'completed'
                  ? 'bg-pixel-accent-green'
                  : chapter.status === 'active'
                  ? 'bg-pixel-accent-blue'
                  : 'bg-pixel-wood-light'
              }`}
              title={`第${chapter.chapterNumber}章`}
            ></div>
          ))}
        </div>
      </div>
    </div>
  );
}

