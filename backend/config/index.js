import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
const nodeEnv = process.env.NODE_ENV || 'development';
dotenv.config({ path: join(__dirname, '../../.env') });

class Config {
  constructor() {
    // 基础配置
    this.port = parseInt(process.env.PORT, 10) || 3000;
    this.nodeEnv = nodeEnv;
    this.isProduction = nodeEnv === 'production';
    
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
    this.dbPath = process.env.DB_PATH || './data/storyweaver.db';
    
    // CORS配置 - 支持多个域名
    this.corsOrigin = this.parseCorsOrigin(process.env.CORS_ORIGIN);
    
    // Socket.io 配置
    this.socketio = {
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
      allowEIO3: true,
      cors: {
        origin: this.corsOrigin,
        methods: ['GET', 'POST'],
        credentials: true
      }
    };
    
    // 日志配置
    this.logging = {
      level: process.env.LOG_LEVEL || (this.isProduction ? 'info' : 'debug'),
      format: this.isProduction ? 'json' : 'text',
      enableFileLogging: this.isProduction,
      enableConsoleLogging: true
    };
    
    // 性能配置
    this.performance = {
      requestTimeout: 30000,
      maxRequestBodySize: '10mb',
      rateLimitWindow: 15 * 60 * 1000,
      rateLimitMax: this.isProduction ? 200 : 1000
    };
    
    // 服务器域名配置（用于生产环境）
    this.serverDomain = process.env.SERVER_DOMAIN || 'localhost';
  }
  
  /**
   * 解析 CORS Origin 配置
   * 支持: "*", "https://domain.com", "https://a.com,https://b.com"
   */
  parseCorsOrigin(origin) {
    if (!origin || origin === '*') {
      return '*';
    }
    
    // 支持逗号分隔的多个域名
    const origins = origin.split(',').map(o => o.trim()).filter(Boolean);
    
    if (origins.length === 1) {
      return origins[0];
    }
    
    // 多个域名时返回数组
    return origins;
  }
  
  validate() {
    // 开发环境验证
    if (this.aiProvider === 'openai' && !this.openaiApiKey) {
      console.warn('警告: OpenAI API密钥未设置');
    }
    if (this.aiProvider === 'deepseek' && !this.deepseekApiKey) {
      console.warn('警告: DeepSeek API密钥未设置');
    }
    if (this.aiProvider === 'qwen' && !this.qwenApiKey) {
      console.warn('警告: Qwen API密钥未设置，将使用本地模式');
    }
    
    // 生产环境额外检查
    if (this.isProduction) {
      if (this.corsOrigin === '*') {
        console.warn('警告: 生产环境建议设置具体的 CORS_ORIGIN 域名');
      }
    }
    
    return true;
  }
  
  /**
   * 获取完整的服务器 URL
   */
  getServerUrl() {
    if (this.isProduction && this.serverDomain !== 'localhost') {
      const protocol = process.env.ENABLE_HTTPS === 'true' ? 'https' : 'http';
      return `${protocol}://${this.serverDomain}`;
    }
    return `http://localhost:${this.port}`;
  }
}

export default new Config();

