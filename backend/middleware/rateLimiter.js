/**
 * 请求限流中间件
 * 防止API滥用，限制请求频率
 */

class RateLimiter {
  constructor() {
    // 存储每个IP的请求记录
    this.requests = new Map();
    
    // 默认配置
    this.defaultConfig = {
      windowMs: 15 * 60 * 1000, // 15分钟
      maxRequests: 100, // 最大请求数
      message: '请求过于频繁，请稍后再试'
    };
  }
  
  /**
   * 创建限流中间件
   */
  createLimiter(config = {}) {
    const options = { ...this.defaultConfig, ...config };
    
    return (req, res, next) => {
      const key = req.ip || req.connection.remoteAddress || 'unknown';
      const now = Date.now();
      
      // 获取或创建该IP的请求记录
      if (!this.requests.has(key)) {
        this.requests.set(key, {
          count: 0,
          resetTime: now + options.windowMs
        });
      }
      
      const record = this.requests.get(key);
      
      // 如果窗口期已过，重置计数
      if (now > record.resetTime) {
        record.count = 0;
        record.resetTime = now + options.windowMs;
      }
      
      // 检查是否超过限制
      if (record.count >= options.maxRequests) {
        const retryAfter = Math.ceil((record.resetTime - now) / 1000);
        
        res.status(429).json({
          success: false,
          error: options.message,
          retryAfter: `${retryAfter}秒`
        });
        
        return;
      }
      
      // 增加计数
      record.count++;
      
      // 设置响应头
      res.setHeader('X-RateLimit-Limit', options.maxRequests);
      res.setHeader('X-RateLimit-Remaining', options.maxRequests - record.count);
      res.setHeader('X-RateLimit-Reset', new Date(record.resetTime).toISOString());
      
      next();
    };
  }
  
  /**
   * Socket限流
   */
  socketLimiter(socket, eventName, maxPerMinute = 30) {
    const key = `${socket.id}_${eventName}`;
    const now = Date.now();
    const windowMs = 60 * 1000; // 1分钟
    
    if (!this.requests.has(key)) {
      this.requests.set(key, {
        count: 0,
        resetTime: now + windowMs
      });
    }
    
    const record = this.requests.get(key);
    
    if (now > record.resetTime) {
      record.count = 0;
      record.resetTime = now + windowMs;
    }
    
    if (record.count >= maxPerMinute) {
      socket.emit('error', {
        error: '请求过于频繁，请稍后再试',
        code: 'RATE_LIMIT_EXCEEDED'
      });
      return false;
    }
    
    record.count++;
    return true;
  }
  
  /**
   * 清理过期记录
   */
  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.requests.entries()) {
      if (now > record.resetTime) {
        this.requests.delete(key);
      }
    }
  }
  
  /**
   * 启动定期清理
   */
  startCleanup(intervalMs = 5 * 60 * 1000) {
    setInterval(() => {
      this.cleanup();
    }, intervalMs);
  }
}

// 创建单例
const rateLimiter = new RateLimiter();
rateLimiter.startCleanup();

export default rateLimiter;
