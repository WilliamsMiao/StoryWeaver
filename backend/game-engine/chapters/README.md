# 自动章节管理机制

完整的章节管理系统，实现平滑的章节过渡、历史管理和随机事件生成。

## 架构概述

```
章节管理系统
├── ChapterTrigger (章节触发器)
│   ├── 字数阈值检测
│   ├── 时间阈值检测
│   ├── 关键事件检测
│   └── 玩家活跃度检测
│
├── ChapterTransition (章节过渡器)
│   ├── AI生成章节结尾
│   ├── 提取关键记忆
│   ├── 生成新章节开场
│   └── 随机事件集成
│
├── ChapterHistory (章节历史管理器)
│   ├── 完整章节记录
│   ├── 时间线浏览
│   └── 章节导航
│
└── RandomEventGenerator (随机事件生成器)
    ├── 事件类型管理
    ├── 智能事件生成
    └── 防重复机制
```

## 核心模块

### 1. ChapterTrigger (章节触发器)

检查各种条件，决定是否应该开始新章节。

#### 触发条件

- **字数阈值**: 默认2500字
- **时间阈值**: 默认30分钟
- **关键事件数量**: 默认3个
- **玩家不活跃**: 默认10分钟
- **消息数量**: 默认15条

#### 使用示例

```javascript
import { ChapterTrigger } from './chapters/index.js';

const trigger = new ChapterTrigger({
  wordCount: 2500,
  timeElapsed: 30,
  keyEvents: 3,
  playerInactivity: 10,
  messageCount: 15
});

// 检查是否应该触发新章节
const result = trigger.shouldTriggerNewChapter(story, {
  lastPlayerActivity: new Date(),
  playerMessage: '...'
});

if (result.shouldTrigger) {
  console.log(`触发原因: ${result.reason}, 优先级: ${result.priority}`);
}

// 记录玩家活动
trigger.recordPlayerActivity();

// 记录关键事件
trigger.recordKeyEvent();

// 重置状态（新章节开始时）
trigger.resetChapterState();
```

### 2. ChapterTransition (章节过渡器)

AI生成章节结尾总结，提取关键信息，生成新章节开场。

#### 主要方法

```javascript
import { ChapterTransition } from './chapters/index.js';

const transition = new ChapterTransition(storyId, {
  enableRandomEvents: true,
  randomEventProbability: 0.3
});

// 执行章节过渡
const result = await transition.transitionToNewChapter(
  currentChapter,
  story,
  context
);

// result包含:
// - ending: 章节结尾
// - newChapterOpening: 新章节开场
// - keyMemories: 提取的关键记忆
// - randomEvent: 随机事件（如果有）

// 创建新章节
const newChapter = await transition.createNewChapter(
  story,
  result.newChapterOpening,
  result.randomEvent
);
```

#### AI提示词模板

章节过渡使用以下提示词模板：

```
请为当前章节生成一个总结，并基于以下关键事件开始新章节：

故事背景：{background}
上一章节结尾：{ending}
章节摘要：{chapterSummaries}
关键记忆：{keyMemories}

请生成新章节开场：
```

### 3. ChapterHistory (章节历史管理器)

存储完整章节记录，支持时间线浏览和章节间导航。

#### 主要方法

```javascript
import { ChapterHistory } from './chapters/index.js';

const history = new ChapterHistory(storyId);

// 加载历史
await history.loadHistory();

// 获取章节列表
const chapters = history.getChapters({
  limit: 10,
  offset: 0,
  sortBy: 'number', // 'number' | 'time' | 'wordCount'
  order: 'asc'
});

// 获取章节详情
const chapter = history.getChapter(chapterId);
const chapterByNumber = history.getChapterByNumber(5);

// 获取时间线
const timeline = history.getTimeline({
  startDate: new Date('2024-01-01'),
  endDate: new Date(),
  limit: 20
});

// 获取相邻章节
const adjacent = history.getAdjacentChapters(chapterId);
// { previous, current, next }

// 搜索章节
const results = history.searchChapters('关键词');

// 获取统计信息
const stats = history.getStatistics();
// {
//   totalChapters, totalWords, averageWords,
//   longestChapter, shortestChapter, averageChapterLength
// }

// 导出历史
const exported = history.exportHistory({
  includeContent: true,
  includeSummary: true,
  format: 'markdown' // 'json' | 'markdown' | 'text'
});
```

### 4. RandomEventGenerator (随机事件生成器)

在章节过渡时引入意外事件，平衡玩家控制与AI引导。

#### 事件类型

- **discovery**: 意外发现
- **encounter**: 神秘访客
- **environment**: 环境变化
- **conflict**: 角色冲突
- **clue**: 新线索出现
- **time**: 时间跳跃
- **twist**: 剧情转折

#### 使用示例

```javascript
import { RandomEventGenerator } from './chapters/index.js';

const generator = new RandomEventGenerator({
  enabled: true,
  probability: 0.3, // 30%概率
  intensity: 'medium' // 'low' | 'medium' | 'high'
});

// 生成随机事件
const event = await generator.generateRandomEvent(story, {
  recentEvents: ['事件1', '事件2']
});

// 检查是否应该生成事件
if (generator.shouldGenerateEvent(story, context)) {
  const event = await generator.generateRandomEvent(story, context);
}

// 获取统计信息
const stats = generator.getStatistics();
```

## 完整使用示例

### 集成到游戏引擎

```javascript
import { createChapterManager } from './chapters/index.js';

// 创建章节管理系统
const chapterManager = createChapterManager(storyId, {
  trigger: {
    wordCount: 2500,
    timeElapsed: 30,
    keyEvents: 3
  },
  transition: {
    enableRandomEvents: true,
    randomEventProbability: 0.3
  },
  randomEvents: {
    enabled: true,
    probability: 0.3,
    intensity: 'medium'
  }
});

// 在游戏循环中检查章节过渡
async function gameLoop(story, context) {
  // 检查是否应该触发新章节
  const transitionResult = await chapterManager.checkAndTransition(
    story,
    context
  );
  
  if (transitionResult.triggered) {
    console.log(`章节过渡: ${transitionResult.reason}`);
    
    // 创建新章节
    const newChapter = await chapterManager.transition.createNewChapter(
      story,
      transitionResult.newChapterOpening,
      transitionResult.randomEvent
    );
    
    // 添加到故事
    story.chapters.push(newChapter);
    
    // 更新历史
    chapterManager.history.addChapter(newChapter);
  }
}

// 手动触发章节分割
async function manualSplit() {
  const result = await chapterManager.manualChapterSplit(story, {
    reason: '玩家手动分割'
  });
  
  return result;
}
```

### 在GameEngine中集成

```javascript
import { createChapterManager } from './chapters/index.js';

class GameEngine {
  constructor() {
    this.chapterManagers = new Map(); // storyId -> chapterManager
  }
  
  async processMessage(roomId, playerId, message) {
    const room = this.rooms.get(roomId);
    const story = room.story;
    
    // 获取或创建章节管理器
    if (!this.chapterManagers.has(story.id)) {
      this.chapterManagers.set(
        story.id,
        createChapterManager(story.id)
      );
    }
    
    const chapterManager = this.chapterManagers.get(story.id);
    
    // 记录玩家活动
    chapterManager.trigger.recordPlayerActivity();
    
    // 处理消息...
    const aiResponse = await AIService.generateStoryResponse(...);
    
    // 检查章节过渡
    const transitionResult = await chapterManager.checkAndTransition(
      story,
      {
        lastPlayerActivity: new Date(),
        playerMessage: message
      }
    );
    
    if (transitionResult.triggered) {
      // 执行章节过渡
      const newChapter = await chapterManager.transition.createNewChapter(
        story,
        transitionResult.newChapterOpening,
        transitionResult.randomEvent
      );
      
      // 广播章节过渡事件
      this.io.to(roomId).emit('chapter_transition', {
        oldChapter: transitionResult.ending,
        newChapter: newChapter,
        randomEvent: transitionResult.randomEvent
      });
    }
    
    return aiResponse;
  }
}
```

## Socket事件

### 章节过渡事件

```javascript
// 服务器 -> 客户端
socket.on('chapter_transition', (data) => {
  // data包含:
  // - oldChapter: 旧章节结尾
  // - newChapter: 新章节信息
  // - randomEvent: 随机事件（如果有）
});
```

### 手动分割事件

```javascript
// 客户端 -> 服务器
socket.emit('manual_chapter_split', {
  roomId: '...',
  reason: '玩家手动分割'
});
```

## 配置选项

### ChapterTrigger配置

```javascript
{
  wordCount: 2500,           // 字数阈值
  timeElapsed: 30,           // 分钟阈值
  keyEvents: 3,              // 关键事件数量
  playerInactivity: 10,      // 玩家不活跃分钟数
  messageCount: 15,          // 消息数量阈值
  enableAutoTrigger: true    // 是否启用自动触发
}
```

### ChapterTransition配置

```javascript
{
  enableRandomEvents: true,      // 启用随机事件
  randomEventProbability: 0.3   // 随机事件概率
}
```

### RandomEventGenerator配置

```javascript
{
  enabled: true,        // 是否启用
  probability: 0.3,    // 生成概率
  intensity: 'medium'   // 事件强度
}
```

## 最佳实践

1. **平滑过渡**: 确保章节结尾和新章节开场自然衔接
2. **记忆提取**: 及时提取关键信息到长期记忆
3. **随机事件**: 适度使用随机事件，避免过度干扰
4. **手动控制**: 提供手动章节分割功能
5. **历史管理**: 定期加载和更新章节历史

## 故障排除

### 章节过渡不触发
- 检查触发条件配置
- 确认当前章节状态
- 查看触发器状态: `trigger.getState()`

### AI生成失败
- 检查AI服务连接
- 查看错误日志
- 使用备用方案（简单生成）

### 随机事件过于频繁
- 降低probability配置
- 检查recentEvents过滤
- 调整intensity设置

