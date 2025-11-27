import React, { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import socketManager from '../../utils/socket';

/**
 * 凶手专属引导面板
 * 只对凶手玩家可见
 */
export default function MurdererGuidePanel({ onClose }) {
  const { myCharacter, room, murdererGuide: contextGuide } = useGame();
  const [guidance, setGuidance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('strategy');

  // 检查是否是凶手
  const isMurderer = myCharacter?.isMurderer;

  // 获取凶手引导
  useEffect(() => {
    if (isMurderer && room) {
      fetchGuidance();
    }
  }, [isMurderer, room]);

  // 同步context中的引导
  useEffect(() => {
    if (contextGuide) {
      setGuidance(contextGuide);
    }
  }, [contextGuide]);

  const fetchGuidance = () => {
    setLoading(true);
    socketManager.emit('get_murderer_guidance', {}, (response) => {
      setLoading(false);
      if (response.success) {
        setGuidance(response.guidance);
      }
    });
  };

  if (!isMurderer) {
    return null;
  }

  // 默认引导数据
  const defaultGuidance = {
    chapter: 1,
    urgencyLevel: 'normal',
    tips: {
      strategy: ['保持冷静，不要过于积极或过于沉默', '适时提出合理怀疑转移注意力'],
      speech: ['我当时正在...', '我注意到了一些可疑的事情...'],
      interference: ['引导话题到其他嫌疑人身上', '提出似是而非的推理'],
      danger: ['被多人同时质疑时要小心', '避免前后矛盾的陈述'],
      safe: ['讨论案件发生的时间线', '询问其他人的不在场证明'],
      scapegoat: [],
      counterDetection: ['注意观察谁在记录你的发言']
    },
    warnings: []
  };

  const currentGuidance = guidance || defaultGuidance;

  const tabs = [
    { id: 'strategy', label: '策略', icon: '🎯' },
    { id: 'speech', label: '话术', icon: '💬' },
    { id: 'interference', label: '干扰', icon: '🌀' },
    { id: 'danger', label: '警告', icon: '⚠️' }
  ];

  const renderTabContent = () => {
    const tips = currentGuidance.tips || {};
    
    switch (activeTab) {
      case 'strategy':
        return (
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-amber-400 mb-2">策略建议</h4>
            {(tips.strategy || []).map((tip, i) => (
              <div key={i} className="flex items-start p-2 bg-slate-700/50 rounded">
                <span className="text-amber-500 mr-2">•</span>
                <span className="text-gray-200 text-sm">{tip}</span>
              </div>
            ))}
            {tips.scapegoat?.length > 0 && (
              <>
                <h4 className="text-sm font-bold text-amber-400 mt-3 mb-2">替罪羊策略</h4>
                {tips.scapegoat.map((tip, i) => (
                  <div key={i} className="flex items-start p-2 bg-red-900/30 rounded">
                    <span className="text-red-400 mr-2">🎯</span>
                    <span className="text-gray-200 text-sm">{tip}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        );

      case 'speech':
        return (
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-amber-400 mb-2">推荐话术</h4>
            {(tips.speech || []).map((speech, i) => (
              <div key={i} className="p-3 bg-slate-700/50 rounded border-l-2 border-amber-500">
                <span className="text-gray-100 text-sm italic">"{speech}"</span>
              </div>
            ))}
            {tips.safe?.length > 0 && (
              <>
                <h4 className="text-sm font-bold text-green-400 mt-3 mb-2">安全话题</h4>
                <div className="flex flex-wrap gap-2">
                  {tips.safe.map((topic, i) => (
                    <span key={i} className="px-2 py-1 bg-green-900/40 text-green-300 rounded text-xs">
                      {topic}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        );

      case 'interference':
        return (
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-amber-400 mb-2">干扰选项</h4>
            {(tips.interference || []).map((option, i) => (
              <div key={i} className="flex items-start p-2 bg-purple-900/30 rounded">
                <span className="text-purple-400 mr-2">🌀</span>
                <span className="text-gray-200 text-sm">{option}</span>
              </div>
            ))}
            {tips.counterDetection?.length > 0 && (
              <>
                <h4 className="text-sm font-bold text-amber-400 mt-3 mb-2">反侦察技巧</h4>
                {tips.counterDetection.map((tip, i) => (
                  <div key={i} className="flex items-start p-2 bg-blue-900/30 rounded">
                    <span className="text-blue-400 mr-2">🛡️</span>
                    <span className="text-gray-200 text-sm">{tip}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        );

      case 'danger':
        return (
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-red-400 mb-2">危险信号</h4>
            <p className="text-xs text-gray-400 mb-2">当以下情况发生时要特别小心！</p>
            {(tips.danger || []).map((signal, i) => (
              <div key={i} className="flex items-start p-2 bg-red-900/40 rounded border-l-2 border-red-500">
                <span className="text-red-500 mr-2">⚠️</span>
                <span className="text-gray-200 text-sm">{signal}</span>
              </div>
            ))}
            {currentGuidance.warnings?.length > 0 && (
              <div className="mt-3 p-3 bg-red-900/60 rounded animate-pulse">
                <h4 className="text-red-400 font-bold text-sm mb-1">🚨 紧急警告</h4>
                {currentGuidance.warnings.map((warning, i) => (
                  <p key={i} className="text-red-200 text-sm">{warning}</p>
                ))}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed top-20 right-4 z-50 w-80">
      {/* 主面板 */}
      <div className="bg-slate-900 rounded-lg shadow-xl border border-red-900/50">
        {/* 标题 */}
        <div className={`p-3 rounded-t-lg flex items-center justify-between
          ${currentGuidance.urgencyLevel === 'high' ? 'bg-red-900' : 'bg-slate-800'}`}>
          <h3 className="font-bold text-red-400 flex items-center">
            <span className="mr-2">🔪</span>
            凶手秘密指南
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">第{currentGuidance.chapter}章</span>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-lg"
            >
              ×
            </button>
          </div>
        </div>

        {/* 标签栏 */}
        <div className="flex border-b border-slate-700">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 text-xs transition-colors
                ${activeTab === tab.id 
                  ? 'bg-slate-700 text-amber-400' 
                  : 'text-gray-400 hover:bg-slate-800'}`}
            >
              <span className="mr-1">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* 内容区 */}
        <div className="p-4 max-h-64 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full"></div>
            </div>
          ) : (
            renderTabContent()
          )}
        </div>

        {/* 刷新按钮 */}
        <div className="p-2 border-t border-slate-700">
          <button
            onClick={fetchGuidance}
            disabled={loading}
            className="w-full py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            🔄 刷新建议
          </button>
        </div>
      </div>
    </div>
  );
}
