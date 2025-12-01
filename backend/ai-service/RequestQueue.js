/**
 * AI请求队列管理器
 * 防止并发过多，管理请求排队和重试
 */

class RequestQueue {
  constructor(options = {}) {
    this.maxConcurrent = options.maxConcurrent || 3; // 最大并发数
    this.maxRetries = options.maxRetries || 3; // 最大重试次数
    this.retryDelay = options.retryDelay || 1000; // 重试延迟（毫秒）
    this.queue = []; // 请求队列
    this.running = 0; // 当前运行中的请求数
    this.stats = {
      total: 0,
      success: 0,
      failed: 0,
      retries: 0,
      averageTime: 0
    };
  }
  
  /**
   * 添加请求到队列
   * @param {Function} requestFn - 请求函数（返回Promise）
   * @param {Object} options - 选项
   * @returns {Promise} 请求结果
   */
  async enqueue(requestFn, options = {}) {
    return new Promise((resolve, reject) => {
      const request = {
        id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        fn: requestFn,
        options: {
          priority: options.priority || 0, // 优先级，数字越大优先级越高
          timeout: options.timeout || 30000, // 超时时间（毫秒）
          retries: options.retries !== undefined ? options.retries : this.maxRetries,
          ...options
        },
        resolve,
        reject,
        startTime: null,
        attempts: 0
      };
      
      // 按优先级插入队列
      this.insertByPriority(request);
      
      // 尝试处理队列
      this.processQueue();
    });
  }
  
  /**
   * 按优先级插入队列
   * Optimized: Use binary search for O(log n) insertion instead of O(n)
   */
  insertByPriority(request) {
    const priority = request.options.priority;
    
    // Binary search to find insertion point
    let left = 0;
    let right = this.queue.length;
    
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (this.queue[mid].options.priority >= priority) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    
    // Insert at the found position
    this.queue.splice(left, 0, request);
  }
  
  /**
   * 处理队列
   */
  async processQueue() {
    // 如果已达到最大并发数或队列为空，返回
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }
    
    // 取出下一个请求
    const request = this.queue.shift();
    if (!request) {
      return;
    }
    
    this.running++;
    request.startTime = Date.now();
    request.attempts++;
    
    try {
      // 执行请求（带超时）
      const result = await this.executeWithTimeout(
        request.fn,
        request.options.timeout
      );
      
      // 更新统计
      this.updateStats(true, Date.now() - request.startTime);
      
      // 成功
      request.resolve(result);
    } catch (error) {
      // 检查是否需要重试
      if (request.attempts < request.options.retries && this.shouldRetry(error)) {
        this.stats.retries++;
        
        // 延迟后重试
        await this.delay(this.retryDelay * request.attempts); // 指数退避
        
        // 重新加入队列
        this.insertByPriority(request);
      } else {
        // 失败，更新统计
        this.updateStats(false, Date.now() - request.startTime);
        request.reject(error);
      }
    } finally {
      this.running--;
      // 继续处理队列
      this.processQueue();
    }
  }
  
  /**
   * 执行请求（带超时）
   */
  async executeWithTimeout(fn, timeout) {
    return Promise.race([
      fn(),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`请求超时（${timeout}ms）`));
        }, timeout);
      })
    ]);
  }
  
  /**
   * 判断是否应该重试
   */
  shouldRetry(error) {
    // 网络错误、超时错误可以重试
    const retryableErrors = [
      'ETIMEDOUT',
      'ECONNRESET',
      'ENOTFOUND',
      '请求超时',
      'timeout'
    ];
    
    return retryableErrors.some(keyword => 
      error.message?.includes(keyword) || error.code === keyword
    );
  }
  
  /**
   * 延迟函数
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * 更新统计信息
   */
  updateStats(success, duration) {
    this.stats.total++;
    if (success) {
      this.stats.success++;
    } else {
      this.stats.failed++;
    }
    
    // 更新平均时间（移动平均）
    if (this.stats.total === 1) {
      this.stats.averageTime = duration;
    } else {
      this.stats.averageTime = (this.stats.averageTime * 0.9) + (duration * 0.1);
    }
  }
  
  /**
   * 获取队列状态
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      running: this.running,
      maxConcurrent: this.maxConcurrent,
      stats: { ...this.stats }
    };
  }
  
  /**
   * 清空队列
   */
  clear() {
    this.queue.forEach(request => {
      request.reject(new Error('队列已清空'));
    });
    this.queue = [];
  }
}

export default RequestQueue;
