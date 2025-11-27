import React, { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import socketManager from '../../utils/socket';

/**
 * 角色技能面板组件
 */
export default function SkillPanel() {
  const { myCharacter, room, skills: contextSkills, skillCooldowns, useSkill } = useGame();
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [targetCharacter, setTargetCharacter] = useState('');
  const [skillResult, setSkillResult] = useState(null);
  const [showTargetModal, setShowTargetModal] = useState(false);

  // 获取技能列表
  useEffect(() => {
    if (room) {
      socketManager.emit('get_player_skills', {}, (response) => {
        if (response.success) {
          setSkills(response.skills || []);
        }
      });
    }
  }, [room, myCharacter]);

  // 合并context中的技能
  useEffect(() => {
    if (contextSkills && contextSkills.length > 0) {
      setSkills(contextSkills);
    }
  }, [contextSkills]);

  // 使用技能
  const handleUseSkill = (skill) => {
    if (!skill.canUse) return;
    
    // 如果技能需要选择目标
    if (skill.type === 'investigation' || skill.type === 'deduction') {
      setSelectedSkill(skill);
      setShowTargetModal(true);
    } else {
      executeSkill(skill.id, null);
    }
  };

  // 执行技能
  const executeSkill = async (skillId, targetCharacterId) => {
    setLoading(true);
    setSkillResult(null);
    
    try {
      const response = await useSkill(skillId, targetCharacterId, {});
      setShowTargetModal(false);
      setSelectedSkill(null);
      setTargetCharacter('');
      
      if (response.success) {
        setSkillResult({
          success: true,
          skillName: response.skillName,
          message: response.message,
          effect: response.effect
        });
        
        // 更新技能列表
        setSkills(prev => prev.map(s => 
          s.id === skillId 
            ? { ...s, remainingUses: s.remainingUses - 1, canUse: s.remainingUses > 1 && s.isAvailable }
            : s
        ));
      } else {
        setSkillResult({
          success: false,
          message: response.error || '技能使用失败'
        });
      }
    } catch (error) {
      setSkillResult({
        success: false,
        message: error.message || '技能使用失败'
      });
    } finally {
      setLoading(false);
    }
  };

  // 获取技能图标
  const getSkillIcon = (type) => {
    switch (type) {
      case 'investigation': return '🔍';
      case 'information': return '💻';
      case 'deduction': return '🧠';
      case 'social': return '🤝';
      default: return '✨';
    }
  };

  // 获取技能类型名称
  const getSkillTypeName = (type) => {
    switch (type) {
      case 'investigation': return '调查类';
      case 'information': return '情报类';
      case 'deduction': return '推理类';
      case 'social': return '社交类';
      default: return '特殊';
    }
  };

  if (!skills || skills.length === 0) {
    return null;
  }

  return (
    <div className="bg-slate-800 rounded-lg p-4 mt-4">
      <h3 className="text-lg font-bold text-amber-400 mb-3 flex items-center">
        <span className="mr-2">⚡</span>
        角色技能
      </h3>
      
      {/* 技能列表 */}
      <div className="space-y-3">
        {skills.map(skill => (
          <div 
            key={skill.id}
            className={`bg-slate-700 rounded-lg p-3 ${skill.canUse ? 'hover:bg-slate-600 cursor-pointer' : 'opacity-60'}`}
            onClick={() => handleUseSkill(skill)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <span className="text-2xl mr-3">{getSkillIcon(skill.type)}</span>
                <div>
                  <h4 className="font-bold text-white">{skill.name}</h4>
                  <p className="text-xs text-gray-400">{getSkillTypeName(skill.type)}</p>
                </div>
              </div>
              <div className="text-right">
                <span className={`text-sm ${skill.canUse ? 'text-green-400' : 'text-gray-500'}`}>
                  {skill.remainingUses}/{skill.maxUses}
                </span>
                {!skill.isAvailable && skill.remainingUses > 0 && (
                  <p className="text-xs text-yellow-500">冷却中</p>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-300 mt-2">{skill.description}</p>
          </div>
        ))}
      </div>

      {/* 技能结果显示 */}
      {skillResult && (
        <div className={`mt-4 p-3 rounded-lg ${skillResult.success ? 'bg-green-900/50' : 'bg-red-900/50'}`}>
          <h4 className={`font-bold ${skillResult.success ? 'text-green-400' : 'text-red-400'}`}>
            {skillResult.success ? `✅ ${skillResult.skillName} 发动成功！` : '❌ 技能使用失败'}
          </h4>
          <p className="text-gray-200 mt-1">{skillResult.message}</p>
        </div>
      )}

      {/* 目标选择模态框 */}
      {showTargetModal && selectedSkill && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-amber-400 mb-4">
              选择目标 - {selectedSkill.name}
            </h3>
            <p className="text-gray-300 mb-4">{selectedSkill.description}</p>
            
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {room?.players?.filter(p => p.id !== myCharacter?.playerId).map(player => (
                <button
                  key={player.id}
                  onClick={() => {
                    setTargetCharacter(player.characterId);
                    executeSkill(selectedSkill.id, player.characterId);
                  }}
                  className="w-full text-left p-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                >
                  <span className="font-bold text-white">{player.characterName || player.username}</span>
                  {player.occupation && (
                    <span className="text-gray-400 ml-2">({player.occupation})</span>
                  )}
                </button>
              ))}
            </div>
            
            <button
              onClick={() => {
                setShowTargetModal(false);
                setSelectedSkill(null);
              }}
              className="mt-4 w-full py-2 bg-gray-600 hover:bg-gray-500 rounded-lg text-white"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 加载状态 */}
      {loading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 flex items-center">
            <div className="animate-spin w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full mr-3"></div>
            <span className="text-white">技能发动中...</span>
          </div>
        </div>
      )}
    </div>
  );
}
