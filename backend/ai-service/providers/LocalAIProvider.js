import { AIProvider } from './AIProvider.js';
import { PromptBuilder } from '../prompt/PromptBuilder.js';

/**
 * 本地AI提供商
 * 支持 Ollama、本地部署的 DeepSeek、Qwen 等模型
 */
export class LocalAIProvider extends AIProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'LocalAI';
    this.baseURL = config.baseURL || process.env.LOCAL_AI_URL || 'http://localhost:11434';
    this.model = config.model || process.env.LOCAL_AI_MODEL || 'llama2';
    this.apiType = config.apiType || 'ollama'; // ollama, openai-compatible
    
    // 支持的模型列表
    this.supportedModels = {
      'deepseek-chat': { provider: 'deepseek', context: 32000 },
      'qwen': { provider: 'qwen', context: 32000 },
      'qwen2': { provider: 'qwen', context: 32000 },
      'llama2': { provider: 'llama', context: 4096 },
      'llama3': { provider: 'llama', context: 8192 },
      'mistral': { provider: 'mistral', context: 8192 }
    };
  }
  
  async generateStoryResponse(context, playerInput) {
    const prompt = PromptBuilder.buildStoryPrompt(context, playerInput);
    
    if (this.apiType === 'ollama') {
      return await this.callOllamaAPI(prompt, {
        temperature: 0.8,
        max_tokens: 500
      });
    } else {
      // OpenAI兼容API
      return await this.callOpenAICompatibleAPI(prompt, {
        temperature: 0.8,
        max_tokens: 500
      });
    }
  }
  
  async summarizeChapter(chapterContent) {
    const prompt = PromptBuilder.buildSummaryPrompt(chapterContent);
    
    let result;
    if (this.apiType === 'ollama') {
      result = await this.callOllamaAPI(prompt, {
        temperature: 0.3,
        max_tokens: 200
      });
    } else {
      result = await this.callOpenAICompatibleAPI(prompt, {
        temperature: 0.3,
        max_tokens: 200
      });
    }
    
    return result.content;
  }
  
  async generateEnding(storyContext) {
    const prompt = PromptBuilder.buildEndingPrompt(storyContext);
    
    let result;
    if (this.apiType === 'ollama') {
      result = await this.callOllamaAPI(prompt, {
        temperature: 0.7,
        max_tokens: 800
      });
    } else {
      result = await this.callOpenAICompatibleAPI(prompt, {
        temperature: 0.7,
        max_tokens: 800
      });
    }
    
    return result.content;
  }
  
  /**
   * 调用 Ollama API
   */
  async callOllamaAPI(prompt, options = {}) {
    try {
      const response = await fetch(`${this.baseURL}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          prompt: prompt,
          stream: false,
          options: {
            temperature: options.temperature || 0.7,
            num_predict: options.max_tokens || 500
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`Ollama API错误: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      return {
        content: data.response.trim(),
        model: this.model,
        tokens: 0 // Ollama不返回token计数
      };
    } catch (error) {
      console.error('Ollama API调用错误:', error);
      throw new Error(`AI生成失败: ${error.message}`);
    }
  }
  
  /**
   * 调用 OpenAI 兼容的 API（如本地部署的 DeepSeek、Qwen）
   */
  async callOpenAICompatibleAPI(prompt, options = {}) {
    try {
      const messages = [
        {
          role: 'system',
          content: '你是一位专业的剧本杀游戏主持人（DM），擅长根据玩家行动推进剧情，营造悬疑氛围。'
        },
        {
          role: 'user',
          content: prompt
        }
      ];
      
      const response = await fetch(`${this.baseURL}/v1/chat/completions`, {
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
        throw new Error(`本地AI API错误: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.choices || !data.choices[0]) {
        throw new Error('本地AI API返回格式错误');
      }
      
      return {
        content: data.choices[0].message.content.trim(),
        model: this.model,
        tokens: data.usage?.total_tokens || 0
      };
    } catch (error) {
      console.error('本地AI API调用错误:', error);
      throw new Error(`AI生成失败: ${error.message}`);
    }
  }
  
  truncateContext(messages, maxTokens = 8000) {
    // 根据模型类型调整上下文窗口
    const modelInfo = this.supportedModels[this.model];
    const contextLimit = modelInfo?.context || 4096;
    
    // 简单截断逻辑，实际可以更智能
    return messages;
  }

  async checkAvailability() {
    const endpoint = this.apiType === 'ollama'
      ? `${this.baseURL}/api/tags`
      : `${this.baseURL}/v1/models`;
    try {
      const response = await fetch(endpoint, { method: 'GET' });
      if (!response.ok) {
        return {
          available: false,
          reason: `本地AI服务响应异常: ${response.status}`
        };
      }
      return { available: true };
    } catch (error) {
      console.error('本地AI 可用性检查失败:', error);
      return {
        available: false,
        reason: error.message
      };
    }
  }
}

