# StoryWeaver TypeScript 类型定义

完整的TypeScript类型定义，提供类型检查和自动补全支持。

## 文件结构

- `index.ts`: 所有接口和类型定义
- `classes.ts`: 类型安全的类实现
- `tsconfig.json`: TypeScript编译配置

## 核心类型

### 游戏状态管理

- `GameRoom`: 游戏房间接口
- `GameStory`: 游戏故事接口
- `StoryMemory`: 故事记忆系统接口
- `StoryStatus`: 故事状态指标接口

### 玩家和消息

- `Player`: 玩家接口
- `PlayerStats`: 玩家统计数据
- `GameMessage`: 游戏消息接口
- `StoryChapter`: 故事章节接口

### AI服务

- `AIResponse`: AI响应接口
- `AIContext`: AI生成上下文
- `AIConfig`: AI配置

### Socket事件

- `SocketEvents`: Socket事件类型映射

## 使用方法

### 在JavaScript项目中使用

虽然项目使用JavaScript，但可以通过JSDoc注释获得类型提示：

```javascript
// @ts-check
import type { GameRoom, Player } from './types/index.js';

/**
 * @param {GameRoom} room
 * @param {Player} player
 */
function addPlayerToRoom(room, player) {
  // 类型检查会在这里生效
}
```

### 在TypeScript项目中使用

```typescript
import { GameRoom, Player, GameRoomClass } from './types/index.js';
import { GameRoomClass } from './types/classes.js';

const room = new GameRoomClass({
  name: '我的房间',
  creator: 'player1',
  creatorName: 'Alice',
  status: 'waiting',
  settings: {}
});
```

## 类型导出

所有类型都从 `index.ts` 导出：

```typescript
export type {
  GameRoom,
  GameStory,
  Player,
  GameMessage,
  StoryChapter,
  StoryMemory,
  StoryStatus,
  AIResponse,
  // ... 更多类型
};
```

## 类实现

所有类都从 `classes.ts` 导出：

```typescript
export {
  PlayerClass,
  GameMessageClass,
  StoryMemoryClass,
  StoryStatusClass,
  StoryChapterClass,
  GameSettingsClass,
  GameStoryClass,
  GameRoomClass,
};
```

## 类型检查

运行类型检查：

```bash
npx tsc --noEmit
```

## 注意事项

1. 所有类型定义都使用 `interface` 而不是 `type`，以便扩展
2. 类实现提供了类型安全的方法和属性
3. Map类型在JSON序列化时会转换为数组
4. 所有日期字段使用 `Date` 类型
5. 数值范围有明确的类型约束（如0-1的范围）

