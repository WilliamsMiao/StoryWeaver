# 智能记忆管理系统

解决AI上下文限制问题的完整记忆管理系统，包含四个核心模块。

## 架构概述

```
记忆管理系统
├── ShortTermMemory (短期记忆管理器)
│   ├── 维护最近10-15条交互
│   ├── 自动淘汰旧消息
│   └── 重要性评分和压缩
│
├── ChapterSummarizer (章节总结引擎)
│   ├── 触发条件监测
│   ├── AI生成章节总结
│   └── 提取核心剧情
│
├── LongTermMemory (长期记忆存储)
│   ├── 关键事件记录
│   ├── 角色关系网络
│   └── 故事主题维护
│
└── MemoryRetrieval (记忆召回系统)
    ├── 相关性评分
    ├── 智能选择记忆
    └── Token限制优化
```

## 核心模块

### 1. ShortTermMemory (短期记忆管理器)

维护最近10-15条玩家-AI交互，自动淘汰旧消息，保留重要对话。

#### 主要方法

```javascript
import { ShortTermMemory } from './memory/index.js';

const shortTerm = new ShortTermMemory(storyId, {
  maxSize: 15,        // 最大保留数量
  minSize: 10,        // 最小保留数量
  importanceThreshold: 0.5  // 重要性阈值
});

// 添加交互
await shortTerm.addInteraction(
  playerInput,    // 玩家输入
  aiResponse,     // AI响应
  playerId,       // 玩家ID
  playerName      // 玩家名称
);

// 获取最近交互
const recent = shortTerm.getRecentInteractions(10);

// 从数据库加载
await shortTerm.loadFromDatabase();
```

#### 特性

- **重要性评分**: 基于关键词、长度、问题标记计算重要性
- **自动压缩**: 超过最大数量时自动压缩低重要性消息
- **关键词提取**: 自动提取交互中的关键词

### 2. ChapterSummarizer (章节总结引擎)

触发条件监测，调用AI生成章节总结，提取核心剧情。

#### 主要方法

```javascript
import { ChapterSummarizer } from './memory/index.js';

const summarizer = new ChapterSummarizer(storyId, {
  wordThreshold: 2000,  // 字数阈值
  keyEventKeywords: ['发现', '决定', '秘密']  // 关键事件关键词
});

// 检查是否应该总结
if (summarizer.shouldTriggerSummary(chapter)) {
  // 触发总结
  const summary = await summarizer.triggerChapterSummary(chapter);
}

// 批量总结
const summaries = await summarizer.summarizeChapters(chapters);

// 获取章节摘要
const chapterSummaries = summarizer.getChapterSummaries(10);
```

#### 触发条件

1. **字数阈值**: 章节字数 > 2000
2. **关键事件**: 包含关键事件关键词
3. **章节数量**: 每5章总结一次

### 3. LongTermMemory (长期记忆存储)

关键事件记录、角色关系网络、故事主题维护。

#### 主要方法

```javascript
import { LongTermMemory } from './memory/index.js';

const longTerm = new LongTermMemory(storyId);

// 添加关键事件
await longTerm.addKeyEvent(
  '主角发现了神秘的宝箱',
  4,  // 重要性 1-5
  { location: '地下城' }  // 元数据
);

// 更新角色关系
await longTerm.updateCharacterRelation(
  'character1',
  'character2',
  0.8,  // 关系度 -1到1
  '共同战斗后成为朋友'
);

// 获取关系
const relation = longTerm.getCharacterRelation('character1', 'character2');

// 添加故事主题
await longTerm.addStoryTheme('友情与冒险');

// 添加世界设定
await longTerm.addWorldSetting('魔法世界，存在五大元素');

// 从内容提取并保存记忆
await longTerm.extractAndSaveMemories(chapterContent);
```

#### 特性

- **关系网络**: 跟踪角色间关系变化（-1到1）
- **主题维护**: 自动去重相似主题
- **世界设定**: 维护故事世界观

### 4. MemoryRetrieval (记忆召回系统)

基于相关性召回历史记忆，智能选择注入AI提示词的记忆内容。

#### 主要方法

```javascript
import { MemoryRetrieval, createMemorySystem } from './memory/index.js';

// 创建完整记忆系统
const memorySystem = createMemorySystem(storyId, {
  maxTokens: 4000,
  charsPerToken: 3
});

// 获取相关记忆
const memories = await memorySystem.getRelevantMemories(
  currentTopic,  // 当前话题
  {
    shortTermLimit: 10,
    chapterLimit: 5,
    longTermLimit: 15,
    maxContextLength: 12000  // 最大上下文长度（字符）
  }
);

// 添加交互（自动管理短期记忆）
await memorySystem.addInteraction(
  playerInput,
  aiResponse,
  playerId,
  playerName
);

// 触发章节总结
await memorySystem.triggerChapterSummary(chapter);

// 压缩记忆以适应token限制
const compressed = await memorySystem.compressMemory({
  memories: allMemories,
  currentTopic: '当前话题',
  maxLength: 12000
});
```

#### 特性

- **相关性评分**: 基于Jaccard相似度和关键词匹配
- **智能选择**: 优先选择高相关性记忆
- **Token优化**: 自动压缩以适应上下文限制

## 使用示例

### 完整工作流

```javascript
import { createMemorySystem } from './memory/index.js';

// 1. 创建记忆系统
const memorySystem = createMemorySystem(storyId);

// 2. 处理玩家消息时添加交互
await memorySystem.addInteraction(
  '主角发现了一个神秘的宝箱',
  '宝箱中闪烁着奇异的光芒...',
  playerId,
  playerName
);

// 3. 检查章节是否需要总结
const chapter = { number: 5, content: '...', wordCount: 2500 };
if (memorySystem.chapterSummarizer.shouldTriggerSummary(chapter)) {
  await memorySystem.triggerChapterSummary(chapter);
}

// 4. 生成AI响应前获取相关记忆
const relevantMemories = await memorySystem.getRelevantMemories(
  '主角打开宝箱',
  {
    shortTermLimit: 10,
    chapterLimit: 5,
    longTermLimit: 15
  }
);

// 5. 将记忆注入AI上下文
const aiContext = {
  background: story.background,
  ...relevantMemories,
  currentTopic: '主角打开宝箱'
};

const aiResponse = await AIService.generateStoryResponse(aiContext, playerInput);
```

## 数据库表结构

### interactions 表
- `id`: 交互ID
- `story_id`: 故事ID
- `player_id`: 玩家ID
- `player_name`: 玩家名称
- `input`: 玩家输入
- `response`: AI响应
- `created_at`: 创建时间

### memories 表
- `id`: 记忆ID
- `story_id`: 故事ID
- `memory_type`: 记忆类型 (event, character_relation, theme, world)
- `content`: 记忆内容
- `importance`: 重要性 1-5
- `created_at`: 创建时间

### chapters 表
- `id`: 章节ID
- `story_id`: 故事ID
- `chapter_number`: 章节号
- `content`: 章节内容
- `summary`: 章节摘要（AI生成）
- `author_id`: 作者ID
- `created_at`: 创建时间

## 配置选项

### ShortTermMemory
```javascript
{
  maxSize: 15,              // 最大保留数量
  minSize: 10,              // 最小保留数量
  importanceThreshold: 0.5  // 重要性阈值
}
```

### ChapterSummarizer
```javascript
{
  wordThreshold: 2000,       // 字数阈值
  keyEventKeywords: [...]   // 关键事件关键词
}
```

### MemoryRetrieval
```javascript
{
  maxTokens: 4000,           // 最大token数
  charsPerToken: 3           // 字符与token比例
}
```

## 性能优化

1. **内存缓存**: 所有记忆模块在内存中缓存，减少数据库查询
2. **异步加载**: 支持异步从数据库加载历史记忆
3. **智能压缩**: 自动压缩低重要性内容以适应token限制
4. **相关性排序**: 优先使用高相关性记忆，提高AI响应质量

## 最佳实践

1. **定期总结**: 每5章或达到字数阈值时触发章节总结
2. **重要性评分**: 重要事件和角色关系应设置较高重要性
3. **相关性优化**: 根据当前话题动态调整记忆召回
4. **Token管理**: 监控上下文长度，避免超过模型限制

## 故障排除

### 记忆未保存
- 检查数据库连接
- 确认storyId正确
- 查看错误日志

### 相关性评分不准确
- 调整关键词提取逻辑
- 优化相似度计算算法
- 增加更多训练数据

### Token超限
- 降低记忆数量限制
- 启用更激进的压缩
- 增加maxTokens配置

