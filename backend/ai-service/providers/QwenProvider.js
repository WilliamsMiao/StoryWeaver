import { AIProvider } from './AIProvider.js';
import { PromptBuilder } from '../prompt/PromptBuilder.js';

/**
 * Qwen (通义千问) API提供商
 * 支持阿里云API和本地部署
 */
export class QwenProvider extends AIProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'Qwen';
    this.apiKey = config.apiKey || process.env.QWEN_API_KEY;
    this.baseURL = config.baseURL || process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com';
    this.model = config.model || 'qwen-turbo';
    this.maxTokens = config.maxTokens || 2000;
    this.isLocal = config.isLocal || false;
    
    // 如果未配置API密钥且不是本地模式，则使用本地提供商
    if (!this.apiKey && !this.isLocal) {
      console.warn('Qwen API密钥未配置，将使用本地模式');
      this.isLocal = true;
    }
  }
  
  async generateStoryResponse(context, playerInput) {
    const prompt = PromptBuilder.buildStoryPrompt(context, playerInput);
    
    if (this.isLocal) {
      // 使用本地部署的Qwen（通过OpenAI兼容API）
      return await this.callLocalAPI(prompt, {
        temperature: 0.8,
        max_tokens: 500
      });
    } else {
      // 使用阿里云API
      return await this.callDashScopeAPI(prompt, {
        temperature: 0.8,
        max_tokens: 500
      });
    }
  }
  
  async summarizeChapter(chapterContent) {
    const prompt = PromptBuilder.buildSummaryPrompt(chapterContent);
    
    let result;
    if (this.isLocal) {
      result = await this.callLocalAPI(prompt, {
        temperature: 0.3,
        max_tokens: 200
      });
    } else {
      result = await this.callDashScopeAPI(prompt, {
        temperature: 0.3,
        max_tokens: 200
      });
    }
    
    return result.content;
  }
  
  async generateEnding(storyContext) {
    const prompt = PromptBuilder.buildEndingPrompt(storyContext);
    
    let result;
    if (this.isLocal) {
      result = await this.callLocalAPI(prompt, {
        temperature: 0.7,
        max_tokens: 800
      });
    } else {
      result = await this.callDashScopeAPI(prompt, {
        temperature: 0.7,
        max_tokens: 800
      });
    }
    
    return result.content;
  }
  
  /**
   * 调用阿里云 DashScope API
   */
  async callDashScopeAPI(prompt, options = {}) {
    try {
      const messages = [
        {
          role: 'system',
          content: '你是一位专业的创意写作助手。'
        },
        {
          role: 'user',
          content: prompt
        }
      ];
      
      const response = await fetch(`${this.baseURL}/api/v1/services/aigc/text-generation/generation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          input: {
            messages: messages
          },
          parameters: {
            temperature: options.temperature || 0.7,
            max_tokens: options.max_tokens || this.maxTokens
          }
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Qwen API错误: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
      }
      
      const data = await response.json();
      
      if (!data.output || !data.output.choices || !data.output.choices[0]) {
        throw new Error('Qwen API返回格式错误');
      }
      
      return {
        content: data.output.choices[0].message.content.trim(),
        model: this.model,
        tokens: data.usage?.total_tokens || 0
      };
    } catch (error) {
      console.error('Qwen API调用错误:', error);
      throw new Error(`AI生成失败: ${error.message}`);
    }
  }
  
  /**
   * 调用本地部署的Qwen（OpenAI兼容API）
   */
  async callLocalAPI(prompt, options = {}) {
    const localURL = process.env.LOCAL_AI_URL || 'http://localhost:11434';
    const messages = [
      {
        role: 'system',
        content: '你是一位专业的创意写作助手。'
      },
      {
        role: 'user',
        content: prompt
      }
    ];
    
    try {
      const response = await fetch(`${localURL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages,
          temperature: options.temperature || 0.7,
          max_tokens: options.max_tokens || 500,
          stream: false
        })
      });
      
      if (!response.ok) {
        throw new Error(`本地Qwen API错误: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.choices || !data.choices[0]) {
        throw new Error('本地Qwen API返回格式错误');
      }
      
      return {
        content: data.choices[0].message.content.trim(),
        model: this.model,
        tokens: data.usage?.total_tokens || 0
      };
    } catch (error) {
      console.error('本地Qwen API调用错误:', error);
      throw new Error(`AI生成失败: ${error.message}`);
    }
  }
  
  truncateContext(messages, maxTokens = 8000) {
    // Qwen支持32K上下文
    return messages;
  }
}

