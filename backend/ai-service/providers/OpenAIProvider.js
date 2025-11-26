import OpenAI from 'openai';
import { AIProvider } from './AIProvider.js';
import { PromptBuilder } from '../prompt/PromptBuilder.js';

/**
 * OpenAI API提供商
 * 使用 GPT 模型
 */
export class OpenAIProvider extends AIProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'OpenAI';
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.model = config.model || 'gpt-3.5-turbo';
    this.maxTokens = config.maxTokens || 2000;
    
    if (!this.apiKey) {
      throw new Error('OpenAI API密钥未配置');
    }
    
    this.client = new OpenAI({
      apiKey: this.apiKey
    });
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
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || this.maxTokens
      });
      
      return {
        content: response.choices[0].message.content.trim(),
        model: this.model,
        tokens: response.usage?.total_tokens || 0
      };
    } catch (error) {
      console.error('OpenAI API调用错误:', error);
      throw new Error(`AI生成失败: ${error.message}`);
    }
  }
  
  truncateContext(messages, maxTokens = 8000) {
    // GPT-3.5-turbo支持16K上下文，GPT-4支持更大
    // 这里实现简单的截断逻辑
    return messages;
  }
}

