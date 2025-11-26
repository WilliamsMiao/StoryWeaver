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
    // 生产环境配置会在运行时动态加载（如果需要）
    // 这里先使用环境变量配置
    
    // 开发环境配置
    this.port = parseInt(process.env.PORT, 10) || 3000;
    this.nodeEnv = nodeEnv;
    
    // AI配置
    this.aiProvider = process.env.AI_PROVIDER || 'deepseek'; // deepseek, openai, qwen, local
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
    this.deepseekApiKey = process.env.DEEPSEEK_API_KEY || '';
    this.qwenApiKey = process.env.QWEN_API_KEY || '';
    this.qwenBaseUrl = process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com';
    this.localAiUrl = process.env.LOCAL_AI_URL || 'http://localhost:11434';
    this.localAiModel = process.env.LOCAL_AI_MODEL || 'deepseek-chat';
    this.localAiApiType = process.env.LOCAL_AI_API_TYPE || 'ollama'; // ollama, openai-compatible
    
    // 数据库配置
    this.dbPath = process.env.DB_PATH || './data/storyweaver.db';
    
    // CORS配置
    this.corsOrigin = process.env.CORS_ORIGIN || '*';
    
    // Socket.io 配置（开发环境）
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
      level: process.env.LOG_LEVEL || (nodeEnv === 'production' ? 'info' : 'debug'),
      format: nodeEnv === 'production' ? 'json' : 'text',
      enableFileLogging: false,
      enableConsoleLogging: true
    };
    
    // 性能配置
    this.performance = {
      requestTimeout: 30000,
      maxRequestBodySize: '10mb',
      rateLimitWindow: 15 * 60 * 1000,
      rateLimitMax: 100
    };
  }
  
  validate() {
    // 生产环境使用生产配置的验证
    if (this.nodeEnv === 'production' && productionConfig) {
      return productionConfig.validate();
    }
    
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
    return true;
  }
}

export default new Config();

