/**
 * 全局错误处理中间件
 * 统一处理所有错误，返回标准格式的错误响应
 */

/**
 * Express错误处理中间件
 */
export function errorHandler(err, req, res, next) {
  // 记录错误日志
  console.error('错误详情:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });
  
  // 根据错误类型返回不同的状态码
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || '服务器内部错误';
  
  // 开发环境显示详细错误信息
  if (process.env.NODE_ENV === 'development') {
    return res.status(statusCode).json({
      success: false,
      error: message,
      stack: err.stack,
      details: err.details || null
    });
  }
  
  // 生产环境只返回通用错误信息
  return res.status(statusCode).json({
    success: false,
    error: statusCode === 500 ? '服务器内部错误' : message
  });
}

/**
 * 异步错误包装器
 * 自动捕获异步函数中的错误
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 创建自定义错误
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = statusCode;
    this.details = details;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Socket错误处理
 */
export function socketErrorHandler(socket, error, eventName) {
  console.error(`Socket错误 [${eventName}]:`, {
    message: error.message,
    stack: error.stack,
    socketId: socket.id,
    timestamp: new Date().toISOString()
  });
  
  socket.emit('error', {
    error: error.message || '处理请求时发生错误',
    code: error.code || 'UNKNOWN_ERROR',
    event: eventName
  });
}

export default {
  errorHandler,
  asyncHandler,
  AppError,
  socketErrorHandler
};
