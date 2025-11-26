/**
 * 统一日志工具
 * 支持结构化日志（JSON格式）和文本格式
 * 根据环境自动选择日志格式
 */

import config from '../config/index.js';

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

/**
 * 创建日志记录器
 * @param {string} category - 日志类别
 * @returns {Object} 日志记录器对象
 */
export function createLogger(category = 'app') {
  const logConfig = config.logging || {
    level: 'info',
    format: 'text',
    enableConsoleLogging: true
  };
  
  const currentLevel = LOG_LEVELS[logConfig.level] || LOG_LEVELS.info;
  const isJsonFormat = logConfig.format === 'json';
  
  /**
   * 格式化日志消息
   */
  function formatLog(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    
    if (isJsonFormat) {
      return JSON.stringify({
        timestamp,
        level,
        category,
        message,
        ...data
      });
    } else {
      // 文本格式
      const dataStr = Object.keys(data).length > 0 
        ? ' ' + JSON.stringify(data)
        : '';
      return `[${timestamp}] [${level.toUpperCase()}] [${category}] ${message}${dataStr}`;
    }
  }
  
  /**
   * 记录日志
   */
  function log(level, message, data = {}) {
    const levelNum = LOG_LEVELS[level];
    if (levelNum === undefined || levelNum > currentLevel) {
      return;
    }
    
    if (!logConfig.enableConsoleLogging) {
      return;
    }
    
    const formatted = formatLog(level, message, data);
    
    // 根据级别选择输出方法
    if (level === 'error') {
      console.error(formatted);
    } else if (level === 'warn') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  }
  
  return {
    error: (message, data) => log('error', message, data),
    warn: (message, data) => log('warn', message, data),
    info: (message, data) => log('info', message, data),
    debug: (message, data) => log('debug', message, data)
  };
}

/**
 * 默认日志记录器
 */
export const logger = createLogger('app');

export default logger;

