# StoryWeaver - AI驱动的多人互动写作游戏

StoryWeaver 是一个基于AI的多人实时协作写作游戏，玩家可以共同创作故事，AI会根据玩家输入生成连贯的故事内容。

## 功能特性

- 🎮 **多人实时协作**: 使用Socket.io实现实时通信
- 🤖 **AI故事生成**: 支持OpenAI和本地AI模型
- 📚 **章节管理**: 自动管理故事章节和进度
- 🧠 **分层记忆系统**: AI能够记住重要情节，保持故事连贯性
- 💾 **数据持久化**: 使用SQLite存储游戏数据

## 技术栈

- **后端**: Node.js + Express + Socket.io
- **数据库**: SQLite3
- **AI服务**: OpenAI API / 本地AI模型（Ollama等）

## 项目结构

```
StoryWeaver/
├── backend/
│   ├── server.js              # 主服务器文件
│   ├── config/                # 配置管理
│   │   └── index.js
│   ├── game-engine/           # 游戏逻辑引擎
│   │   ├── GameEngine.js
│   │   └── models/
│   │       ├── Player.js
│   │       ├── GameStory.js
│   │       └── GameRoom.js
│   ├── ai-service/            # AI服务抽象层
│   │   └── AIService.js
│   └── storage/               # 数据持久化
│       └── database.js
├── package.json
└── README.md
```

## 安装和运行

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并填写配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# 服务器配置
PORT=3000
NODE_ENV=development

# AI服务配置
AI_PROVIDER=deepseek  # 可选: deepseek, openai, qwen, local

# DeepSeek API 密钥（如果使用 DeepSeek）
DEEPSEEK_API_KEY=your_deepseek_api_key_here

# OpenAI API 密钥（如果使用 OpenAI）
# OPENAI_API_KEY=your_openai_api_key_here

# 本地AI配置（如果使用本地模型）
# LOCAL_AI_URL=http://localhost:11434
# LOCAL_AI_MODEL=deepseek-chat

# 数据库配置
DB_PATH=./data/storyweaver.db

# CORS配置
CORS_ORIGIN=*
```

**重要**: `.env` 文件包含敏感信息，已添加到 `.gitignore`，不会被提交到 Git。

### 3. 启动服务器

```bash
npm start
```

或使用开发模式（自动重启）：

```bash
npm run dev
```

服务器将在 `http://localhost:3000` 启动。

## Socket.io 事件

### 客户端 → 服务器

#### `create_room`
创建新游戏房间

```javascript
socket.emit('create_room', {
  name: '我的故事房间',
  playerId: 'player123',
  username: 'Alice'
}, (response) => {
  console.log(response); // { success: true, room: {...} }
});
```

#### `join_room`
加入现有房间

```javascript
socket.emit('join_room', {
  roomId: 'room-uuid',
  playerId: 'player456',
  username: 'Bob'
}, (response) => {
  console.log(response); // { success: true, room: {...} }
});
```

#### `send_message`
发送消息并生成故事内容

```javascript
socket.emit('send_message', {
  message: '主角发现了一个神秘的宝箱'
}, (response) => {
  console.log(response); // { success: true, chapter: {...}, room: {...} }
});
```

#### `get_room_status`
获取房间当前状态

```javascript
socket.emit('get_room_status', {
  roomId: 'room-uuid'
}, (response) => {
  console.log(response); // { success: true, room: {...} }
});
```

#### `initialize_story`
初始化故事（仅房主）

```javascript
socket.emit('initialize_story', {
  title: '冒险之旅',
  background: '在一个遥远的魔法世界中...'
}, (response) => {
  console.log(response); // { success: true, room: {...} }
});
```

### 服务器 → 客户端

#### `room_updated`
房间状态更新

```javascript
socket.on('room_updated', (room) => {
  console.log('房间更新:', room);
});
```

#### `new_chapter`
新章节生成

```javascript
socket.on('new_chapter', (data) => {
  console.log('新章节:', data.chapter);
  console.log('作者:', data.author);
  console.log('房间状态:', data.room);
});
```

#### `story_initialized`
故事初始化完成

```javascript
socket.on('story_initialized', (data) => {
  console.log('故事已初始化:', data.story);
});
```

## 数据模型

### GameRoom
- `id`: 房间ID
- `name`: 房间名称
- `hostId`: 房主ID
- `status`: 房间状态 (waiting, playing, finished)
- `players`: 玩家列表
- `story`: 故事对象

### GameStory
- `id`: 故事ID
- `roomId`: 所属房间ID
- `title`: 故事标题
- `background`: 故事背景
- `chapters`: 章节列表
- `memories`: 记忆列表

### Player
- `id`: 玩家ID
- `username`: 用户名
- `role`: 角色 (host, player)
- `stats`: 统计数据

## API 端点

### GET `/health`
健康检查

```bash
curl http://localhost:3000/health
```

### GET `/api/rooms/:roomId`
获取房间信息

```bash
curl http://localhost:3000/api/rooms/room-uuid
```

## 开发说明

### AI服务配置

系统支持两种AI提供商：

1. **OpenAI**: 使用GPT模型
   - 设置 `AI_PROVIDER=openai`
   - 配置 `OPENAI_API_KEY`

2. **本地AI**: 使用Ollama等本地模型
   - 设置 `AI_PROVIDER=local`
   - 配置 `LOCAL_AI_URL` 和 `LOCAL_AI_MODEL`

### 记忆系统

系统实现了分层记忆管理：
- **事件记忆**: 重要情节和关键事件
- **角色记忆**: 角色信息和关系
- **世界记忆**: 世界观和设定

记忆按重要性排序，AI生成时会优先使用高重要性记忆。

## 下一步开发

- [ ] React前端界面
- [ ] 用户认证系统
- [ ] 故事导出功能
- [ ] 更丰富的AI提示工程
- [ ] 故事评分和统计
- [ ] 房间密码保护

## 许可证

MIT

