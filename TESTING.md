# StoryWeaver 本地测试指南

## 当前运行状态

✅ **后端服务器**: http://localhost:3000  
✅ **前端开发服务器**: http://localhost:5173

## 快速测试步骤

### 1. 访问前端界面

打开浏览器访问：http://localhost:5173

### 2. 测试功能

#### 创建房间
1. 输入用户名
2. 填写房间名称
3. 选择AI提供商（当前为开发模式，会返回模拟响应）
4. 点击"创建房间"

#### 加入房间
1. 在另一个浏览器标签页或设备上访问 http://localhost:5173
2. 输入房间ID（从创建房间的页面获取）
3. 输入用户名
4. 点击"加入房间"

#### 初始化故事
1. 在房间中，房主可以初始化故事
2. 填写故事标题和背景
3. 点击"初始化故事"

#### 发送消息生成故事
1. 在输入框中输入你的想法（例如："主角发现了一个神秘的宝箱"）
2. 点击"发送"
3. 等待AI生成故事内容（开发模式下会返回模拟响应）

### 3. API 测试

#### 健康检查
```bash
curl http://localhost:3000/health
```

#### 获取房间信息
```bash
curl http://localhost:3000/api/rooms/{roomId}
```

### 4. Socket.io 测试

可以使用浏览器控制台测试 Socket.io 连接：

```javascript
const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('已连接');
});

socket.emit('create_room', {
  name: '测试房间',
  playerId: 'test-player-1',
  username: '测试用户'
}, (response) => {
  console.log('创建房间响应:', response);
});
```

## 开发模式说明

当前运行在**开发模式**下：
- ✅ 服务器可以正常启动
- ✅ 数据库连接正常
- ⚠️  AI功能使用模拟响应（需要配置 API 密钥才能使用真实AI）

### 配置真实 AI 功能

要使用真实的 AI 功能，需要：

1. 创建 `.env` 文件（如果还没有）
2. 添加 API 密钥：

```env
# DeepSeek
DEEPSEEK_API_KEY=your_api_key_here

# 或使用 OpenAI
AI_PROVIDER=openai
OPENAI_API_KEY=your_api_key_here
```

3. 重启服务器

## 查看日志

### 后端服务器日志
```bash
tail -f /tmp/storyweaver-server.log
```

### 前端开发服务器日志
查看运行 `npm run dev` 的终端窗口

## 停止服务

### 停止后端
```bash
pkill -f "node.*server.js"
```

### 停止前端
在运行 `npm run dev` 的终端按 `Ctrl+C`

## 常见问题

### 端口被占用
如果端口 3000 或 5173 被占用，可以：
1. 修改 `.env` 中的 `PORT` 变量
2. 修改 `frontend/vite.config.js` 中的端口配置

### 数据库错误
确保 `./data` 目录存在且有写权限：
```bash
mkdir -p data
chmod 755 data
```

### Socket.io 连接失败
检查：
1. 后端服务器是否运行
2. 前端代理配置是否正确（`vite.config.js`）
3. 浏览器控制台是否有错误信息

## 下一步

- [ ] 配置真实的 AI API 密钥
- [ ] 测试多人协作功能
- [ ] 测试章节管理功能
- [ ] 测试记忆系统

