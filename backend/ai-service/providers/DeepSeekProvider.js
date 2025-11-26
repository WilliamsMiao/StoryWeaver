import { AIProvider } from './AIProvider.js';
import { PromptBuilder } from '../prompt/PromptBuilder.js';

/**
 * DeepSeek API提供商
 * 使用 deepseek-chat 模型
 */
export class DeepSeekProvider extends AIProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'DeepSeek';
    this.apiKey = config.apiKey || process.env.DEEPSEEK_API_KEY;
    this.baseURL = config.baseURL || 'https://api.deepseek.com';
    this.model = config.model || 'deepseek-chat';
    this.maxTokens = config.maxTokens || 2000;
    
    // 开发模式支持（无API密钥）
    this.devMode = !this.apiKey || this.apiKey === 'dev-mode';
    if (this.devMode) {
      console.warn('⚠️  DeepSeekProvider 运行在开发模式（无API密钥，将返回模拟响应）');
    }
  }
  
  async generateStoryResponse(context, playerInput) {
    const prompt = PromptBuilder.buildStoryPrompt(context, playerInput);
    const messages = [
      {
        role: 'system',
        content: '你是一位专业的创意写作助手，擅长根据上下文生成连贯、有趣的故事内容。'
      },
      {
        role: 'user',
        content: prompt
      }
    ];
    
    return await this.callAPI(messages, {
      temperature: 0.8,
      max_tokens: 500
    });
  }
  
  async summarizeChapter(chapterContent) {
    const prompt = PromptBuilder.buildSummaryPrompt(chapterContent);
    const messages = [
      {
        role: 'system',
        content: '你是一位专业的文本摘要助手。'
      },
      {
        role: 'user',
        content: prompt
      }
    ];
    
    const result = await this.callAPI(messages, {
      temperature: 0.3,
      max_tokens: 200
    });
    
    return result.content;
  }
  
  async generateEnding(storyContext) {
    const prompt = PromptBuilder.buildEndingPrompt(storyContext);
    const messages = [
      {
        role: 'system',
        content: '你是一位专业的创意写作助手，擅长为故事创作令人满意的结局。'
      },
      {
        role: 'user',
        content: prompt
      }
    ];
    
    const result = await this.callAPI(messages, {
      temperature: 0.7,
      max_tokens: 800
    });
    
    return result.content;
  }
  
  async callAPI(messages, options = {}) {
    // 开发模式：返回模拟响应
    if (this.devMode) {
      const lastMessage = messages[messages.length - 1]?.content || '';
      return {
        content: `[开发模式] 这是对 "${lastMessage.substring(0, 50)}..." 的模拟AI响应。请配置 DEEPSEEK_API_KEY 环境变量以使用真实的AI功能。`,
        model: this.model,
        tokens: 100
      };
    }
    
    try {
      const response = await fetch(`${this.baseURL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages,
          temperature: options.temperature || 0.7,
          max_tokens: options.max_tokens || this.maxTokens,
          stream: false
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`DeepSeek API错误: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
      }
      
      const data = await response.json();
      
      if (!data.choices || !data.choices[0]) {
        throw new Error('DeepSeek API返回格式错误');
      }
      
      return {
        content: data.choices[0].message.content.trim(),
        model: this.model,
        tokens: data.usage?.total_tokens || 0
      };
    } catch (error) {
      console.error('DeepSeek API调用错误:', error);
      throw new Error(`AI生成失败: ${error.message}`);
    }
  }
  
  truncateContext(messages, maxTokens = 8000) {
    // DeepSeek支持32K上下文，这里实现简单的截断逻辑
    // 实际使用时可以根据需要优化
    return messages;
  }
}

