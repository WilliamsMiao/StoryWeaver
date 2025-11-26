/**
 * 请求日志中间件
 * 记录所有HTTP请求和响应信息
 * 支持结构化日志（JSON格式）
 */

import config from '../config/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('http');
const socketLog = createLogger('socket');
const errorLog = createLogger('error');

/**
 * HTTP请求日志中间件
 */
export function requestLogger(req, res, next) {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // 添加请求ID到请求对象
  req.requestId = requestId;
  
  // 记录请求信息
  const requestInfo = {
    requestId,
    method: req.method,
    url: req.url,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    timestamp: new Date().toISOString()
  };
  
  logger.info('HTTP请求', requestInfo);
  
  // 监听响应完成
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const responseInfo = {
      requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      durationMs: duration,
      timestamp: new Date().toISOString()
    };
    
    if (res.statusCode >= 400) {
      logger.error('HTTP响应错误', responseInfo);
    } else {
      logger.info('HTTP响应', responseInfo);
    }
  });
  
  next();
}

/**
 * Socket连接日志
 */
export function socketLogger(socket, event, data = {}) {
  const logData = {
    event,
    socketId: socket.id,
    roomId: socket.data?.roomId,
    playerId: socket.data?.playerId,
    ...data,
    timestamp: new Date().toISOString()
  };
  
  socketLog.info(`Socket事件: ${event}`, logData);
}

/**
 * 错误日志记录
 */
export function errorLogger(error, context = {}) {
  const logData = {
    message: error.message,
    stack: error.stack,
    code: error.code,
    ...context,
    timestamp: new Date().toISOString()
  };
  
  errorLog.error('错误发生', logData);
}

export default {
  requestLogger,
  socketLogger,
  errorLogger
};
