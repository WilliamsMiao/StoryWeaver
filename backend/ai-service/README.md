# AI服务抽象层文档

## 概述

StoryWeaver的AI服务采用抽象层设计，支持多种AI提供商，包括：
- **DeepSeek**: 使用 deepseek-chat 模型（默认）
- **OpenAI**: 使用 GPT 模型
- **Qwen**: 使用通义千问模型（支持阿里云API和本地部署）
- **LocalAI**: 支持本地部署的模型（Ollama、本地DeepSeek、Qwen等）

## 架构设计

### 1. AIProvider 基类

所有AI提供商都继承自 `AIProvider` 基类，实现以下标准接口：

```javascript
class AIProvider {
  // 生成故事响应
  async generateStoryResponse(context, playerInput)
  
  // 总结章节
  async summarizeChapter(chapterContent)
  
  // 生成故事结局
  async generateEnding(storyContext)
  
  // 构建提示词
  buildPrompt(context, playerInput, taskType)
  
  // 处理上下文窗口限制
  truncateContext(messages, maxTokens)
}
```

### 2. 提供商实现

#### DeepSeekProvider
- API端点: `https://api.deepseek.com/v1/chat/completions`
- 模型: `deepseek-chat`
- 上下文窗口: 32K tokens

#### OpenAIProvider
- API端点: OpenAI官方API
- 模型: `gpt-3.5-turbo` (可配置)
- 上下文窗口: 16K tokens (GPT-3.5-turbo)

#### QwenProvider
- API端点: 阿里云 DashScope 或本地部署
- 模型: `qwen-turbo` (可配置)
- 上下文窗口: 32K tokens

#### LocalAIProvider
- 支持 Ollama API
- 支持 OpenAI 兼容的本地API
- 可配置模型: deepseek-chat, qwen, llama2, llama3, mistral等

## 记忆管理系统

### 三层记忆架构

1. **短期记忆 (Short-term Memory)**
   - 存储最近10条玩家交互
   - 用于保持对话连贯性
   - 存储在 `interactions` 表中

2. **章节记忆 (Chapter Memory)**
   - 每个章节的AI生成摘要
   - 用于快速回顾故事发展
   - 存储在 `chapters.summary` 字段

3. **长期记忆 (Long-term Memory)**
   - 关键事件、角色关系、世界设定
   - 按重要性排序（1-5级）
   - 存储在 `memories` 表中
   - 类型包括: character, event, world, emotion

### 记忆提取

系统会自动从生成的内容中提取重要信息：
- 角色信息（新角色、关系变化）
- 关键事件（决定、发现、冲突）
- 世界设定（新地点、规则）
- 情感线索（角色情感状态）

### 记忆升级

重要性 >= 4 的记忆或角色/世界设定记忆会自动升级为长期记忆。

## 提示词工程

### PromptBuilder 类

负责构建包含完整上下文的提示词，包括：

1. **故事信息**
   - 标题、当前章节、背景

2. **长期记忆**
   - 关键事件和角色关系

3. **章节摘要**
   - 最近章节的摘要

4. **短期记忆**
   - 最近玩家交互

5. **玩家角色**
   - 当前房间中的玩家列表

6. **最近章节内容**
   - 用于保持连贯性

7. **生成要求**
   - 字数、风格、连贯性等

## 配置

### 环境变量

```env
# AI提供商选择
AI_PROVIDER=deepseek  # deepseek, openai, qwen, local

# DeepSeek配置
DEEPSEEK_API_KEY=your_api_key

# OpenAI配置
OPENAI_API_KEY=your_api_key

# Qwen配置
QWEN_API_KEY=your_api_key
QWEN_BASE_URL=https://dashscope.aliyuncs.com

# 本地AI配置
LOCAL_AI_URL=http://localhost:11434
LOCAL_AI_MODEL=deepseek-chat
LOCAL_AI_API_TYPE=ollama  # ollama 或 openai-compatible
```

## 使用示例

### 生成故事响应

```javascript
import AIService from './ai-service/AIService.js';

const context = {
  title: '冒险之旅',
  background: '在一个魔法世界中...',
  currentChapter: 5,
  chapters: [...],
  memories: [...],
  interactions: [...],
  players: [...]
};

const response = await AIService.generateStoryResponse(
  context,
  '主角发现了一个神秘的宝箱'
);
```

### 总结章节

```javascript
const summary = await AIService.summarizeChapter(chapterContent);
```

### 生成结局

```javascript
const ending = await AIService.generateEnding(storyContext);
```

## 扩展新的提供商

要添加新的AI提供商：

1. 创建新的Provider类，继承 `AIProvider`
2. 实现所有必需的方法
3. 在 `AIService.js` 中添加初始化逻辑
4. 更新配置文件

示例：

```javascript
import { AIProvider } from './providers/AIProvider.js';

export class MyProvider extends AIProvider {
  constructor(config) {
    super(config);
    this.name = 'MyProvider';
  }
  
  async generateStoryResponse(context, playerInput) {
    // 实现逻辑
  }
  
  // ... 其他方法
}
```

## 性能优化

1. **上下文截断**: 根据模型上下文窗口自动截断
2. **异步摘要生成**: 章节摘要异步生成，不阻塞响应
3. **记忆去重**: 自动去除重复记忆
4. **智能记忆选择**: 优先使用高重要性记忆

## 错误处理

所有提供商都实现了统一的错误处理：
- API调用失败时抛出清晰的错误信息
- 自动重试机制（可扩展）
- 降级策略（可扩展）

