/**
 * 生产环境配置
 * 提供生产环境的默认配置和验证
 */

class ProductionConfig {
  constructor() {
    this.port = parseInt(process.env.PORT, 10) || 3001;
    this.nodeEnv = 'production';
    
    // AI配置
    this.aiProvider = process.env.AI_PROVIDER || 'deepseek';
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
    this.deepseekApiKey = process.env.DEEPSEEK_API_KEY || '';
    this.qwenApiKey = process.env.QWEN_API_KEY || '';
    this.qwenBaseUrl = process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com';
    this.localAiUrl = process.env.LOCAL_AI_URL || 'http://localhost:11434';
    this.localAiModel = process.env.LOCAL_AI_MODEL || 'deepseek-chat';
    this.localAiApiType = process.env.LOCAL_AI_API_TYPE || 'ollama';
    
    // 数据库配置
    this.dbPath = process.env.DB_PATH || '/app/data/storyweaver.db';
    
    // CORS配置
    this.corsOrigin = process.env.CORS_ORIGIN || '*';
    
    // Socket.io 配置
    this.socketio = {
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
      allowEIO3: true,
      cors: {
        origin: this.corsOrigin,
        methods: ['GET', 'POST']
      }
    };
    
    // 日志配置
    this.logging = {
      level: process.env.LOG_LEVEL || 'info',
      format: 'json', // json 或 text
      enableFileLogging: false, // 生产环境使用 stdout/stderr
      enableConsoleLogging: true
    };
    
    // 性能配置
    this.performance = {
      requestTimeout: 30000,
      maxRequestBodySize: '10mb',
      rateLimitWindow: 15 * 60 * 1000, // 15分钟
      rateLimitMax: 100
    };
  }
  
  /**
   * 验证生产环境配置
   */
  validate() {
    const errors = [];
    
    // 验证端口
    if (this.port < 1 || this.port > 65535) {
      errors.push('PORT 必须在 1-65535 之间');
    }
    
    // 验证AI提供商配置
    if (this.aiProvider === 'openai' && !this.openaiApiKey) {
      errors.push('使用 OpenAI 时必须设置 OPENAI_API_KEY');
    }
    
    if (this.aiProvider === 'deepseek' && !this.deepseekApiKey) {
      errors.push('使用 DeepSeek 时必须设置 DEEPSEEK_API_KEY');
    }
    
    // 验证数据库路径
    if (!this.dbPath) {
      errors.push('DB_PATH 不能为空');
    }
    
    // 验证日志级别
    const validLogLevels = ['error', 'warn', 'info', 'debug'];
    if (!validLogLevels.includes(this.logging.level)) {
      errors.push(`LOG_LEVEL 必须是以下之一: ${validLogLevels.join(', ')}`);
    }
    
    if (errors.length > 0) {
      throw new Error(`生产环境配置验证失败:\n${errors.join('\n')}`);
    }
    
    return true;
  }
  
  /**
   * 获取配置摘要（不包含敏感信息）
   */
  getSummary() {
    return {
      port: this.port,
      nodeEnv: this.nodeEnv,
      aiProvider: this.aiProvider,
      dbPath: this.dbPath,
      logging: {
        level: this.logging.level,
        format: this.logging.format
      }
    };
  }
}

export default new ProductionConfig();

