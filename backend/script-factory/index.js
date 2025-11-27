/**
 * 剧本工厂 - 导出入口
 */

import scriptDatabase from './database.js';
import scriptGenerator, { ScriptGenerator, THEME_TEMPLATES, CHARACTER_ARCHETYPES, CLUE_TYPES } from './ScriptGenerator.js';
import scriptRouter from './api.js';
import scriptAdapter from './ScriptAdapter.js';

// 初始化函数
async function initScriptFactory(aiProvider = null) {
  console.log('[剧本工厂] 初始化中...');
  
  // 连接数据库
  await scriptDatabase.connect();
  
  // 设置AI提供者（可选）
  if (aiProvider) {
    scriptGenerator.setAIProvider(aiProvider);
    console.log('[剧本工厂] AI提供者已设置');
  }
  
  console.log('[剧本工厂] 初始化完成');
}

// 关闭函数
async function closeScriptFactory() {
  await scriptDatabase.close();
  console.log('[剧本工厂] 已关闭');
}

export {
  scriptDatabase,
  scriptGenerator,
  scriptRouter,
  scriptAdapter,
  initScriptFactory,
  closeScriptFactory,
  ScriptGenerator,
  THEME_TEMPLATES,
  CHARACTER_ARCHETYPES,
  CLUE_TYPES
};

export default {
  database: scriptDatabase,
  generator: scriptGenerator,
  router: scriptRouter,
  adapter: scriptAdapter,
  init: initScriptFactory,
  close: closeScriptFactory
};
