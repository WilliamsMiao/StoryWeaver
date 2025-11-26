# StoryWeaver 前端

React + Tailwind CSS 前端应用，提供多人实时协作写作游戏的用户界面。

## 功能特性

- 🎨 **暗色主题**: 使用 Tailwind CSS 实现的现代化暗色界面
- 📱 **响应式设计**: 移动端友好的布局
- 🔌 **实时通信**: Socket.io 客户端集成，支持自动重连
- 🎮 **三栏布局**: 故事显示 | 玩家输入 | 状态面板
- 💬 **消息区分**: 清晰区分玩家消息和AI生成内容
- 📊 **进度追踪**: 章节进度指示器和状态面板

## 技术栈

- **React 18**: UI框架
- **React Router**: 路由管理
- **Tailwind CSS**: 样式框架
- **Socket.io Client**: 实时通信
- **Vite**: 构建工具

## 安装和运行

### 1. 安装依赖

```bash
cd frontend
npm install
```

### 2. 配置环境变量

创建 `.env` 文件（可选）：

```env
VITE_SERVER_URL=http://localhost:3000
```

### 3. 启动开发服务器

```bash
npm run dev
```

前端将在 `http://localhost:5173` 启动。

### 4. 构建生产版本

```bash
npm run build
```

## 项目结构

```
frontend/
├── src/
│   ├── components/          # React组件
│   │   ├── RoomCreation.jsx      # 房间创建/加入
│   │   ├── GameRoom.jsx          # 主游戏界面
│   │   ├── GameRoom/
│   │   │   ├── StoryPanel.jsx    # 故事显示面板
│   │   │   ├── InputPanel.jsx    # 玩家输入面板
│   │   │   └── StatusPanel.jsx   # 状态面板
│   │   └── ConnectionStatus.jsx  # 连接状态指示器
│   ├── context/
│   │   └── GameContext.jsx        # 全局状态管理
│   ├── utils/
│   │   └── socket.js              # Socket.io客户端管理
│   ├── App.jsx                    # 主应用组件
│   ├── main.jsx                   # 入口文件
│   └── index.css                  # 全局样式
├── package.json
├── vite.config.js
├── tailwind.config.js
└── README.md
```

## 组件说明

### App.jsx
- 主应用组件
- 路由配置
- 全局状态提供者

### RoomCreation
- 用户名设置
- 房间创建表单（背景选择、AI提供商）
- 房间加入界面（输入房间ID）

### GameRoom
- 主游戏界面
- 三栏响应式布局
- 集成所有子组件

### StoryPanel
- 故事内容显示
- 消息列表（区分玩家/AI消息）
- 自动滚动到底部

### InputPanel
- 玩家输入框
- 发送消息功能
- 加载状态显示

### StatusPanel
- 玩家列表
- 故事状态
- 章节进度指示器
- 故事初始化（仅房主）

## Socket事件

### 发送事件

- `create_room`: 创建房间
- `join_room`: 加入房间
- `send_message`: 发送消息生成故事
- `initialize_story`: 初始化故事
- `get_room_status`: 获取房间状态

### 接收事件

- `room_updated`: 房间状态更新
- `new_chapter`: 新章节生成
- `story_initialized`: 故事初始化完成

## 样式系统

### 颜色主题

- `dark-bg`: 背景色 (#0f172a)
- `dark-surface`: 表面色 (#1e293b)
- `dark-card`: 卡片色 (#334155)
- `dark-border`: 边框色 (#475569)
- `dark-text`: 文本色 (#f1f5f9)
- `dark-muted`: 次要文本色 (#94a3b8)

### 组件类

- `btn-primary`: 主要按钮样式
- `btn-secondary`: 次要按钮样式
- `input-field`: 输入框样式
- `card`: 卡片容器样式

## 响应式设计

- **移动端**: 单列布局，垂直堆叠
- **平板**: 两列布局
- **桌面**: 三列布局（故事 | 输入 | 状态）

使用 Tailwind 的 `lg:` 断点实现响应式布局。

## 开发说明

### 添加新组件

1. 在 `src/components/` 创建组件文件
2. 使用 Tailwind CSS 类名
3. 通过 `useGame()` hook 访问全局状态

### 自定义样式

编辑 `tailwind.config.js` 添加自定义颜色和样式。

### Socket连接

Socket连接在 `GameProvider` 中自动初始化，所有组件通过 `useGame()` hook 访问Socket功能。

## 故障排除

### Socket连接失败

1. 确保后端服务器正在运行
2. 检查 `VITE_SERVER_URL` 配置
3. 查看浏览器控制台的错误信息

### 样式不生效

1. 确保 Tailwind CSS 已正确配置
2. 检查 `index.css` 是否导入
3. 重启开发服务器

## 下一步开发

- [ ] 添加消息时间戳显示
- [ ] 实现消息搜索功能
- [ ] 添加故事导出功能
- [ ] 实现用户头像系统
- [ ] 添加通知系统
- [ ] 优化移动端体验

