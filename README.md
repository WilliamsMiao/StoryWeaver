# StoryWeaver - AI驱动的多人互动写作游戏

StoryWeaver 是一个基于AI的多人实时协作写作游戏平台，玩家可以共同创作故事，AI会根据玩家输入智能生成连贯的故事内容，支持多种AI模型提供商。

## ✨ 功能特性

### 核心功能
- 🎮 **多人实时协作**: 使用 Socket.io 实现实时通信，支持多人在线同时创作
- 🤖 **多AI提供商支持**: 支持 DeepSeek、OpenAI、Qwen、本地AI模型（Ollama等）
- 📚 **智能章节管理**: 自动管理故事章节，支持章节过渡和进度追踪
- 🧠 **分层记忆系统**: 
  - 短期记忆：最近的情节和对话
  - 长期记忆：重要事件、角色信息、世界观设定
  - 章节摘要：自动生成章节摘要，优化记忆检索
- 💾 **数据持久化**: 使用 SQLite 存储游戏数据，支持状态恢复
- 📊 **实时进度可视化**: 故事进度图表、章节历史浏览
- 🎯 **请求队列管理**: 智能请求队列，支持并发控制和重试机制

### 技术特性
- ⚡ **高性能**: 请求限流、连接超时管理、优雅关闭
- 🛡️ **错误处理**: 完善的错误捕获和日志系统
- 📈 **监控指标**: 内置性能指标收集和健康检查
- 🐳 **容器化部署**: 支持 Docker 和 Docker Compose
- 🔒 **生产就绪**: 完整的中间件、错误处理、日志系统

## 🛠️ 技术栈

### 后端
- **运行时**: Node.js 18+
- **框架**: Express.js
- **实时通信**: Socket.io 4.7+
- **数据库**: SQLite3
- **AI服务**: 
  - OpenAI API
  - DeepSeek API
  - Qwen API
  - 本地AI模型（Ollama等）

### 前端
- **框架**: React 18
- **构建工具**: Vite 5
- **样式**: Tailwind CSS 3
- **路由**: React Router 6
- **实时通信**: Socket.io Client

### 部署
- **容器化**: Docker + Docker Compose
- **反向代理**: Nginx
- **健康检查**: 内置健康检查端点

## 📁 项目结构

```
StoryWeaver/
├── backend/                    # 后端服务
│   ├── server.js              # 主服务器文件
│   ├── config/                # 配置管理
│   │   ├── index.js           # 配置加载
│   │   └── production.js      # 生产环境配置
│   ├── game-engine/           # 游戏逻辑引擎
│   │   ├── GameEngine.js      # 游戏引擎核心
│   │   ├── chapters/          # 章节管理
│   │   │   ├── ChapterHistory.js
│   │   │   ├── ChapterTransition.js
│   │   │   ├── ChapterTrigger.js
│   │   │   └── RandomEventGenerator.js
│   │   └── models/            # 数据模型
│   │       ├── Player.js
│   │       ├── GameStory.js
│   │       └── GameRoom.js
│   ├── ai-service/            # AI服务抽象层
│   │   ├── AIService.js       # AI服务主类
│   │   ├── RequestQueue.js    # 请求队列管理
│   │   ├── prompt/            # 提示词构建
│   │   │   └── PromptBuilder.js
│   │   ├── memory/            # 记忆管理系统
│   │   │   ├── MemoryManager.js
│   │   │   ├── ShortTermMemory.js
│   │   │   ├── LongTermMemory.js
│   │   │   ├── MemoryRetrieval.js
│   │   │   └── ChapterSummarizer.js
│   │   └── providers/         # AI提供商
│   │       ├── AIProvider.js
│   │       ├── DeepSeekProvider.js
│   │       ├── OpenAIProvider.js
│   │       ├── QwenProvider.js
│   │       └── LocalAIProvider.js
│   ├── middleware/            # 中间件
│   │   ├── errorHandler.js    # 错误处理
│   │   ├── logger.js          # 日志记录
│   │   ├── rateLimiter.js     # 请求限流
│   │   └── metrics.js         # 性能指标
│   ├── storage/               # 数据持久化
│   │   └── database.js        # 数据库操作
│   ├── types/                 # TypeScript类型定义
│   │   ├── classes.ts
│   │   └── index.ts
│   └── utils/                 # 工具函数
│       └── logger.js
├── frontend/                  # 前端应用
│   ├── src/
│   │   ├── App.jsx            # 主应用组件
│   │   ├── main.jsx           # 入口文件
│   │   ├── components/        # React组件
│   │   │   ├── GameRoom.jsx
│   │   │   ├── RoomCreation.jsx
│   │   │   ├── ConnectionStatus.jsx
│   │   │   ├── ErrorBoundary.jsx
│   │   │   └── GameRoom/      # 游戏房间组件
│   │   │       ├── StoryPanel.jsx
│   │   │       ├── InputPanel.jsx
│   │   │       ├── StatusPanel.jsx
│   │   │       ├── ChapterHistory.jsx
│   │   │       └── ProgressChart.jsx
│   │   ├── context/           # React Context
│   │   │   └── GameContext.jsx
│   │   └── utils/            # 工具函数
│   │       └── socket.js
│   ├── package.json
│   └── vite.config.js
├── nginx/                     # Nginx配置
│   ├── nginx.conf
│   └── conf.d/
│       └── storyweaver.conf
├── scripts/                   # 部署脚本
│   ├── deploy.sh
│   ├── backup.sh
│   ├── health-check.sh
│   └── setup-static.sh
├── docker-compose.yml         # Docker Compose配置
├── Dockerfile                 # Docker镜像构建
├── package.json               # 后端依赖
└── README.md                  # 项目文档
```

## 🚀 快速开始

### 前置要求

- Node.js 18+ 
- npm 或 yarn
- SQLite3（通常随 Node.js 安装）

### 1. 克隆仓库

```bash
git clone git@github.com:WilliamsMiao/StoryWeaver.git
cd StoryWeaver
```

### 2. 安装依赖

#### 安装后端依赖

```bash
npm install
```

#### 安装前端依赖

```bash
cd frontend
npm install
cd ..
```

### 3. 配置环境变量

在项目根目录创建 `.env` 文件：

```env
# 服务器配置
PORT=3000
NODE_ENV=development

# AI服务配置（选择一种）
AI_PROVIDER=deepseek  # 可选: deepseek, openai, qwen, local

# DeepSeek API 配置
DEEPSEEK_API_KEY=your_deepseek_api_key_here

# OpenAI API 配置（如果使用 OpenAI）
# OPENAI_API_KEY=your_openai_api_key_here

# Qwen API 配置（如果使用 Qwen）
# QWEN_API_KEY=your_qwen_api_key_here
# QWEN_BASE_URL=https://dashscope.aliyuncs.com

# 本地AI配置（如果使用本地模型，如 Ollama）
# LOCAL_AI_URL=http://localhost:11434
# LOCAL_AI_MODEL=deepseek-chat

# 数据库配置
DB_PATH=./data/storyweaver.db

# CORS配置
CORS_ORIGIN=*
```

**重要**: `.env` 文件包含敏感信息，已添加到 `.gitignore`，不会被提交到 Git。

### 4. 启动服务

#### 开发模式

**启动后端服务器**:
```bash
npm run dev
```

**启动前端开发服务器**（新终端窗口）:
```bash
cd frontend
npm run dev
```

前端将在 `http://localhost:5173` 启动，后端在 `http://localhost:3000`。

#### 生产模式

**构建前端**:
```bash
cd frontend
npm run build
cd ..
```

**启动后端**:
```bash
npm start
```

### 5. 访问应用

打开浏览器访问 `http://localhost:5173`（开发模式）或 `http://localhost:3000`（生产模式）。

## 🐳 Docker 部署

### 使用 Docker Compose（推荐）

1. **配置环境变量**

创建 `.env.production` 文件（或修改 `docker-compose.yml` 中的环境变量）：

```env
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=your_api_key_here
CORS_ORIGIN=https://yourdomain.com
```

2. **构建和启动**

```bash
docker-compose build
docker-compose up -d
```

3. **查看日志**

```bash
docker-compose logs -f
```

4. **停止服务**

```bash
docker-compose down
```

### 使用 Dockerfile

```bash
# 构建镜像
docker build -t storyweaver .

# 运行容器
docker run -d \
  -p 3001:3001 \
  -v $(pwd)/data:/app/data \
  -e AI_PROVIDER=deepseek \
  -e DEEPSEEK_API_KEY=your_api_key \
  --name storyweaver \
  storyweaver
```

详细部署说明请参考 [DEPLOYMENT.md](./DEPLOYMENT.md)。

## 📡 API 文档

### REST API

#### `GET /health`
健康检查端点

```bash
curl http://localhost:3000/health
```

响应:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### `GET /api/info`
获取服务器信息

```bash
curl http://localhost:3000/api/info
```

#### `GET /api/rooms/:roomId`
获取房间信息

```bash
curl http://localhost:3000/api/rooms/room-uuid
```

### Socket.io 事件

#### 客户端 → 服务器

##### `create_room`
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

##### `join_room`
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

##### `send_message`
发送消息并生成故事内容

```javascript
socket.emit('send_message', {
  message: '主角发现了一个神秘的宝箱'
}, (response) => {
  console.log(response); // { success: true, chapter: {...}, room: {...} }
});
```

##### `initialize_story`
初始化故事（仅房主）

```javascript
socket.emit('initialize_story', {
  title: '冒险之旅',
  background: '在一个遥远的魔法世界中...'
}, (response) => {
  console.log(response); // { success: true, room: {...} }
});
```

##### `get_room_status`
获取房间当前状态

```javascript
socket.emit('get_room_status', {
  roomId: 'room-uuid'
}, (response) => {
  console.log(response); // { success: true, room: {...} }
});
```

#### 服务器 → 客户端

##### `room_updated`
房间状态更新

```javascript
socket.on('room_updated', (room) => {
  console.log('房间更新:', room);
});
```

##### `new_chapter`
新章节生成

```javascript
socket.on('new_chapter', (data) => {
  console.log('新章节:', data.chapter);
  console.log('作者:', data.author);
  console.log('房间状态:', data.room);
});
```

##### `story_initialized`
故事初始化完成

```javascript
socket.on('story_initialized', (data) => {
  console.log('故事已初始化:', data.story);
});
```

## 🧠 AI 服务配置

### 支持的 AI 提供商

1. **DeepSeek** (推荐)
   - 设置 `AI_PROVIDER=deepseek`
   - 配置 `DEEPSEEK_API_KEY`
   - 性价比高，响应速度快

2. **OpenAI**
   - 设置 `AI_PROVIDER=openai`
   - 配置 `OPENAI_API_KEY`
   - 支持 GPT-3.5/GPT-4 模型

3. **Qwen (通义千问)**
   - 设置 `AI_PROVIDER=qwen`
   - 配置 `QWEN_API_KEY` 和 `QWEN_BASE_URL`
   - 阿里云 AI 服务

4. **本地AI (Ollama等)**
   - 设置 `AI_PROVIDER=local`
   - 配置 `LOCAL_AI_URL` 和 `LOCAL_AI_MODEL`
   - 适合本地开发和隐私要求高的场景

### 记忆系统

StoryWeaver 实现了智能分层记忆管理：

- **短期记忆**: 存储最近的情节和对话，用于保持上下文连贯性
- **长期记忆**: 存储重要事件、角色信息、世界观设定
- **章节摘要**: 自动生成章节摘要，优化记忆检索效率
- **记忆检索**: 根据相关性自动检索相关记忆，确保故事连贯

记忆系统会自动管理记忆的重要性，优先使用高重要性记忆生成内容。

## 📊 数据模型

### GameRoom
- `id`: 房间ID (UUID)
- `name`: 房间名称
- `hostId`: 房主ID
- `status`: 房间状态 (`waiting`, `playing`, `finished`)
- `players`: 玩家列表
- `story`: 故事对象
- `createdAt`: 创建时间
- `updatedAt`: 更新时间

### GameStory
- `id`: 故事ID (UUID)
- `roomId`: 所属房间ID
- `title`: 故事标题
- `background`: 故事背景
- `chapters`: 章节列表
- `memories`: 记忆列表
- `progress`: 故事进度

### Player
- `id`: 玩家ID
- `username`: 用户名
- `role`: 角色 (`host`, `player`)
- `stats`: 统计数据（贡献章节数等）
- `isOnline`: 在线状态
- `lastActiveAt`: 最后活动时间

## 🔧 开发说明

### 项目架构

- **后端**: 采用模块化设计，各功能模块独立，易于维护和扩展
- **前端**: 使用 React Hooks 和 Context API 管理状态
- **通信**: Socket.io 实现实时双向通信
- **存储**: SQLite 数据库，支持事务和 WAL 模式

### 中间件系统

- **错误处理**: 统一的错误处理中间件，支持异步错误捕获
- **日志记录**: 请求日志、Socket 日志、错误日志
- **请求限流**: 防止 API 滥用，保护服务器资源
- **性能指标**: 收集请求统计、响应时间等指标

### 代码规范

- 使用 ES6+ 语法
- 模块化设计，单一职责原则
- 完善的错误处理和日志记录
- 代码注释和文档

## 📝 测试

运行测试（如果已配置）：

```bash
npm test
```

查看测试文档：[TESTING.md](./TESTING.md)

## 🤝 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 🔗 相关文档

- [部署指南](./DEPLOYMENT.md) - 详细的生产环境部署说明
- [测试文档](./TESTING.md) - 测试指南和示例
- [整合总结](./INTEGRATION_SUMMARY.md) - 项目功能整合说明

## 📞 联系方式

如有问题或建议，请通过以下方式联系：

- 提交 Issue: [GitHub Issues](https://github.com/WilliamsMiao/StoryWeaver/issues)
- 项目地址: [https://github.com/WilliamsMiao/StoryWeaver](https://github.com/WilliamsMiao/StoryWeaver)

---

**Star ⭐ 这个项目，如果你觉得它有用！**
