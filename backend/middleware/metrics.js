/**
 * 性能指标收集中间件
 * 收集请求性能指标，用于监控和分析
 */

class MetricsCollector {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        byStatus: {},
        byMethod: {},
        duration: {
          sum: 0,
          count: 0,
          min: Infinity,
          max: 0
        }
      },
      errors: {
        total: 0,
        byType: {}
      },
      sockets: {
        connections: 0,
        disconnections: 0,
        active: 0
      },
      startTime: Date.now()
    };
  }
  
  /**
   * 记录HTTP请求指标
   */
  recordRequest(method, statusCode, duration) {
    this.metrics.requests.total++;
    
    // 按状态码统计
    this.metrics.requests.byStatus[statusCode] = 
      (this.metrics.requests.byStatus[statusCode] || 0) + 1;
    
    // 按方法统计
    this.metrics.requests.byMethod[method] = 
      (this.metrics.requests.byMethod[method] || 0) + 1;
    
    // 持续时间统计
    const durationMs = duration;
    this.metrics.requests.duration.sum += durationMs;
    this.metrics.requests.duration.count++;
    this.metrics.requests.duration.min = Math.min(
      this.metrics.requests.duration.min,
      durationMs
    );
    this.metrics.requests.duration.max = Math.max(
      this.metrics.requests.duration.max,
      durationMs
    );
  }
  
  /**
   * 记录错误
   */
  recordError(errorType) {
    this.metrics.errors.total++;
    this.metrics.errors.byType[errorType] = 
      (this.metrics.errors.byType[errorType] || 0) + 1;
  }
  
  /**
   * 记录Socket连接
   */
  recordSocketConnection() {
    this.metrics.sockets.connections++;
    this.metrics.sockets.active++;
  }
  
  /**
   * 记录Socket断开
   */
  recordSocketDisconnection() {
    this.metrics.sockets.disconnections++;
    this.metrics.sockets.active = Math.max(0, this.metrics.sockets.active - 1);
  }
  
  /**
   * 获取指标摘要
   */
  getSummary() {
    const uptime = Date.now() - this.metrics.startTime;
    const avgDuration = this.metrics.requests.duration.count > 0
      ? Math.round(this.metrics.requests.duration.sum / this.metrics.requests.duration.count)
      : 0;
    
    return {
      uptime: Math.floor(uptime / 1000), // 秒
      requests: {
        total: this.metrics.requests.total,
        perSecond: this.metrics.requests.total / (uptime / 1000),
        byStatus: this.metrics.requests.byStatus,
        byMethod: this.metrics.requests.byMethod,
        duration: {
          avg: avgDuration,
          min: this.metrics.requests.duration.min === Infinity 
            ? 0 
            : this.metrics.requests.duration.min,
          max: this.metrics.requests.duration.max
        }
      },
      errors: {
        total: this.metrics.errors.total,
        byType: this.metrics.errors.byType
      },
      sockets: {
        ...this.metrics.sockets
      }
    };
  }
  
  /**
   * 重置指标
   */
  reset() {
    this.metrics = {
      requests: {
        total: 0,
        byStatus: {},
        byMethod: {},
        duration: {
          sum: 0,
          count: 0,
          min: Infinity,
          max: 0
        }
      },
      errors: {
        total: 0,
        byType: {}
      },
      sockets: {
        connections: 0,
        disconnections: 0,
        active: 0
      },
      startTime: Date.now()
    };
  }
}

// 创建单例
const metricsCollector = new MetricsCollector();

/**
 * 性能指标中间件
 */
export function metricsMiddleware(req, res, next) {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    metricsCollector.recordRequest(req.method, res.statusCode, duration);
  });
  
  next();
}

/**
 * 获取指标端点中间件
 */
export function metricsEndpoint(req, res) {
  res.json({
    success: true,
    metrics: metricsCollector.getSummary()
  });
}

export { metricsCollector };
export default {
  metricsMiddleware,
  metricsEndpoint,
  metricsCollector
};

