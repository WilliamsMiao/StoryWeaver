import { useGame } from '../../context/GameContext';
import { useState, useEffect } from 'react';
import ProgressChart from './ProgressChart';
import ChapterHistory from './ChapterHistory';

export default function StatusPanel({ activeTab = 'players' }) {
  const { room, story, player, playersProgress, chapterTodos, storyOutline } = useGame();

  const isHost = room?.hostId === player?.id;
  
  // 当前章节的调查任务
  const currentTasks = chapterTodos || [];

  // 玩家标签页内容
  const renderPlayersTab = () => (
    <div className="p-3 space-y-3">
      {/* 当前任务（新增）*/}
      {story && currentTasks.length > 0 && (
        <div className="mb-3">
          <h3 className="text-sm font-bold mb-2 text-pixel-wood-dark flex items-center gap-2">
            <span>📋</span>
            <span>本章任务</span>
          </h3>
          <div className="space-y-1.5">
            {currentTasks.map((task, index) => (
              <div 
                key={task.id || index}
                className={`p-2 border-2 text-xs ${
                  task.is_completed || task.completed
                    ? 'bg-green-100 border-green-400 line-through opacity-70'
                    : 'bg-pixel-wood-light border-pixel-wood-dark'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="flex-shrink-0">
                    {task.is_completed || task.completed ? '✅' : '⏳'}
                  </span>
                  <div className="flex-1">
                    <div className="font-bold">{task.task_description || task.description || task.content}</div>
                    {task.target_location && (
                      <div className="text-pixel-text-muted mt-0.5">
                        📍 {task.target_location}
                      </div>
                    )}
                    {task.target_character && (
                      <div className="text-pixel-text-muted mt-0.5">
                        👤 {task.target_character}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* 可调查地点提示（基于大纲）*/}
      {storyOutline?.locations && (
        <div className="mb-3 border-2 border-dashed border-pixel-accent-blue p-2 bg-blue-50">
          <h3 className="text-xs font-bold mb-1 text-pixel-accent-blue flex items-center gap-1">
            <span>🔍</span>
            <span>可调查地点</span>
          </h3>
          <div className="flex flex-wrap gap-1">
            {storyOutline.locations.map((loc, i) => (
              <span 
                key={i} 
                className="px-1.5 py-0.5 text-xs bg-white border border-pixel-accent-blue"
                title={loc.description}
              >
                {loc.name}
              </span>
            ))}
          </div>
          <p className="text-xs text-pixel-text-muted mt-1.5 italic">
            💡 在故事机对话中说"去XX调查"或"检查XX"
          </p>
        </div>
      )}

      {/* 玩家列表 */}
      <div>
        <h3 className="text-sm font-bold mb-2 text-pixel-wood-dark flex items-center gap-2">
          <span>👥</span>
          <span>在线玩家 ({room?.playerCount || 0})</span>
        </h3>
        <div className="space-y-2">
          {room?.players?.map((p) => {
            const lastActive = p.lastActiveAt ? new Date(p.lastActiveAt) : null;
            const isRecentlyActive = lastActive ? (Date.now() - lastActive.getTime()) < 5 * 60 * 1000 : true;
            const isCurrentPlayer = p.id === player?.id;
            
            return (
              <div
                key={p.id}
                onClick={() => {
                  if (!isCurrentPlayer) {
                    window.dispatchEvent(new CustomEvent('setRecipient', {
                      detail: { playerId: p.id, playerName: p.username }
                    }));
                  }
                }}
                className={`p-2 bg-pixel-wood-light border-2 border-pixel-wood-dark transition-all ${
                  !isCurrentPlayer ? 'cursor-pointer hover:brightness-110 active:translate-y-0.5' : ''
                }`}
                title={!isCurrentPlayer ? '点击私聊' : ''}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 border border-black ${
                    p.isOnline && isRecentlyActive ? 'bg-pixel-accent-green' : 'bg-gray-400'
                  }`}></div>
                  <span className="text-sm font-bold truncate flex-1">{p.username}</span>
                  {p.role === 'host' && <span className="text-xs">👑</span>}
                  {isCurrentPlayer && <span className="text-xs text-pixel-accent-blue">(你)</span>}
                </div>
                
                {/* 玩家进度条（紧凑） */}
                {playersProgress[p.id] && (
                  <div className="mt-1">
                    <div className="flex items-center gap-2 text-xs">
                      <div className="flex-1 bg-pixel-wood-dark h-1.5">
                        <div 
                          className={`h-full ${
                            (playersProgress[p.id].completionRate || 0) >= 0.8 
                              ? 'bg-pixel-accent-green' 
                              : 'bg-pixel-accent-blue'
                          }`}
                          style={{ width: `${Math.min((playersProgress[p.id].completionRate || 0) * 100, 100)}%` }}
                        ></div>
                      </div>
                      <span className="text-pixel-text-muted font-bold">
                        {Math.round((playersProgress[p.id].completionRate || 0) * 100)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 故事状态（只读展示） */}
      <div className="border-t-2 border-pixel-wood-dark pt-3">
        <h3 className="text-sm font-bold mb-2 text-pixel-wood-dark flex items-center gap-2">
          <span>📖</span>
          <span>故事状态</span>
        </h3>
        {story ? (
          <div className="text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-pixel-text-muted">标题</span>
              <span className="font-bold truncate ml-2">{story.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-pixel-text-muted">章节</span>
              <span className="font-bold">{story.chapters?.length || 0} 章</span>
            </div>
            <div className="flex justify-between">
              <span className="text-pixel-text-muted">状态</span>
              <span className="text-pixel-accent-green font-bold">进行中</span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-center py-2">
            <p className="text-pixel-text-muted">
              {isHost ? '请在主面板初始化故事' : '等待房主初始化...'}
            </p>
          </div>
        )}
      </div>

      {/* 故事进度图表 */}
      {story && story.chapters && story.chapters.length > 0 && (
        <div className="border-t-2 border-pixel-wood-dark pt-3">
          <ProgressChart compact={true} />
        </div>
      )}
    </div>
  );

  // 章节历史标签页内容
  const renderHistoryTab = () => (
    <div className="p-3">
      <ChapterHistory />
    </div>
  );

  return (
    <div className="h-full">
      {activeTab === 'players' ? renderPlayersTab() : renderHistoryTab()}
    </div>
  );
}

