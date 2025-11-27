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
    <div className="bg-pixel-panel border-4 border-pixel-wood-dark p-4 mt-4 shadow-pixel relative">
      {/* 装饰性边角 */}
      <div className="absolute top-2 left-2 right-2 bottom-2 border-2 border-pixel-wood opacity-30 pointer-events-none"></div>
      
      <h3 className="text-xl font-bold text-pixel-wood-dark mb-4 flex items-center font-pixel tracking-wide">
        <span className="mr-2 text-2xl">⚡</span>
        角色技能
      </h3>
      
      {/* 技能列表 */}
      <div className="space-y-4 relative z-10">
        {skills.map(skill => (
          <div 
            key={skill.id}
            className={`bg-pixel-bg/10 border-2 border-pixel-wood-dark p-3 transition-all transform ${
              skill.canUse 
                ? 'hover:bg-pixel-wood-light/20 hover:-translate-y-1 cursor-pointer shadow-pixel-sm' 
                : 'opacity-60 grayscale'
            }`}
            onClick={() => handleUseSkill(skill)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <span className="text-3xl mr-3 filter drop-shadow-sm">{getSkillIcon(skill.type)}</span>
                <div>
                  <h4 className="font-bold text-pixel-wood-dark text-lg font-pixel">{skill.name}</h4>
                  <p className="text-sm text-pixel-text-muted font-pixel">{getSkillTypeName(skill.type)}</p>
                </div>
              </div>
              <div className="text-right font-pixel">
                <span className={`text-lg ${skill.canUse ? 'text-pixel-accent-green' : 'text-pixel-text-muted'}`}>
                  {skill.remainingUses}/{skill.maxUses}
                </span>
                {!skill.isAvailable && skill.remainingUses > 0 && (
                  <p className="text-sm text-pixel-accent-yellow">冷却中</p>
                )}
              </div>
            </div>
            <p className="text-base text-pixel-text mt-2 font-pixel leading-tight border-t border-pixel-wood/30 pt-2">{skill.description}</p>
          </div>
        ))}
      </div>

      {/* 技能结果显示 */}
      {skillResult && (
        <div className={`mt-4 p-3 border-2 font-pixel text-lg relative z-10 ${
          skillResult.success 
            ? 'bg-pixel-accent-green/20 border-pixel-accent-green text-pixel-wood-dark' 
            : 'bg-pixel-accent-red/20 border-pixel-accent-red text-pixel-accent-red'
        }`}>
          <h4 className="font-bold">
            {skillResult.success ? `✅ ${skillResult.skillName} 发动成功！` : '❌ 技能使用失败'}
          </h4>
          <p className="mt-1">{skillResult.message}</p>
        </div>
      )}

      {/* 目标选择模态框 */}
      {showTargetModal && selectedSkill && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 font-pixel">
          <div className="bg-pixel-panel border-4 border-pixel-wood-dark p-6 max-w-md w-full mx-4 shadow-pixel relative">
            <h3 className="text-2xl font-bold text-pixel-wood-dark mb-4 border-b-2 border-pixel-wood-dark pb-2">
              选择目标 - {selectedSkill.name}
            </h3>
            <p className="text-pixel-text mb-4 text-lg">{selectedSkill.description}</p>
            
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
              {room?.players?.filter(p => p.id !== myCharacter?.playerId).map(player => (
                <button
                  key={player.id}
                  onClick={() => {
                    setTargetCharacter(player.characterId);
                    executeSkill(selectedSkill.id, player.characterId);
                  }}
                  className="w-full text-left p-3 bg-pixel-bg/5 hover:bg-pixel-wood-light/30 border-2 border-transparent hover:border-pixel-wood-dark transition-all"
                >
                  <span className="font-bold text-pixel-wood-dark text-xl">{player.characterName || player.username}</span>
                  {player.occupation && (
                    <span className="text-pixel-text-muted ml-2 text-lg">({player.occupation})</span>
                  )}
                </button>
              ))}
            </div>
            
            <button
              onClick={() => {
                setShowTargetModal(false);
                setSelectedSkill(null);
              }}
              className="mt-6 w-full py-2 bg-pixel-wood hover:bg-pixel-wood-light text-white border-2 border-pixel-wood-dark shadow-pixel active:translate-y-1 active:shadow-none transition-all text-xl"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 加载状态 */}
      {loading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 font-pixel">
          <div className="bg-pixel-panel border-4 border-pixel-wood-dark p-6 flex items-center shadow-pixel">
            <div className="animate-spin w-8 h-8 border-4 border-pixel-wood-dark border-t-transparent rounded-full mr-4"></div>
            <span className="text-pixel-wood-dark text-xl font-bold">技能发动中...</span>
          </div>
        </div>
      )}
    </div>
  );
}
