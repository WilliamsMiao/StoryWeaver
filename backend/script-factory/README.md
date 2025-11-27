# 🎭 剧本工厂 (Script Factory)

独立的剧本杀剧本生产系统，支持一键生成可玩的完整剧本。

## 📁 目录结构

```
script-factory/
├── README.md              # 本文件
├── index.js               # 模块导出入口
├── database.js            # 独立的剧本数据库
├── ScriptGenerator.js     # 剧本生成核心服务
├── ScriptAdapter.js       # 游戏适配器（转换格式）
├── api.js                 # REST API 路由
├── admin.html             # 管理后台界面
└── data/
    └── scripts.db         # SQLite数据库文件
```

## 🚀 快速开始

### 1. 访问管理后台
启动服务器后，访问：
```
http://localhost:3000/admin/scripts
```

### 2. 生成剧本
1. 点击"生成剧本"
2. 选择主题（庄园谋杀、公司机密、历史悬疑等）
3. 设置玩家人数（3-8人）
4. 选择难度等级
5. 点击"开始生成"

### 3. 管理剧本
- 查看剧本详情
- 发布/取消发布
- 导出为JSON
- 删除剧本

## 🎯 核心功能

### 1. 一键生成剧本
- 输入基本参数（玩家人数、难度、主题）
- 自动生成完整剧本结构
- 包含所有角色、线索、章节、谜题

### 2. 剧本结构
```
完整剧本
├── 基本信息（标题、背景、玩家数、难度）
├── 角色卡（每个玩家的角色信息）
│   ├── 公开身份
│   ├── 秘密信息
│   ├── 人物关系
│   └── 个人目标
├── 章节内容（3章结构）
│   ├── 第1章：案件发现
│   ├── 第2章：调查取证
│   └── 第3章：真相大白
├── 线索系统
│   ├── 物证线索
│   ├── 证词线索
│   └── 隐藏线索
├── 谜题设计
│   ├── 每章核心问题
│   ├── 标准答案
│   └── 验证关键词
└── 真相揭露
    ├── 凶手身份
    ├── 作案动机
    └── 完整案件还原
```

## 🔄 生成流程

```
1. 选择/输入参数
       ↓
2. 生成案件核心真相
       ↓
3. 创建角色和人物关系
       ↓
4. 设计线索分布
       ↓
5. 编写章节内容
       ↓
6. 设计谜题和验证规则
       ↓
7. 验证剧本完整性
       ↓
8. 保存到数据库
```

## 📊 数据库设计

### 主表：scripts（剧本主表）
- 基本信息、状态、统计数据

### 子表：
- script_characters（角色卡）
- script_chapters（章节内容）
- script_clues（线索库）
- script_puzzles（谜题）
- script_relationships（人物关系图）

## 🚀 API 接口

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /api/scripts/generate | 一键生成剧本 |
| GET | /api/scripts | 获取剧本列表 |
| GET | /api/scripts/:id | 获取剧本详情 |
| PUT | /api/scripts/:id | 更新剧本 |
| DELETE | /api/scripts/:id | 删除剧本 |
| POST | /api/scripts/:id/publish | 发布剧本 |
| POST | /api/scripts/:id/validate | 验证剧本 |
| GET | /api/scripts/:id/export | 导出剧本 |

## 🎮 与游戏系统集成

游戏开始时可选择：
1. **AI实时生成** - 使用现有AIService实时生成
2. **使用预制剧本** - 从剧本工厂选择已发布剧本

```javascript
// 使用预制剧本开始游戏
const script = await ScriptFactory.getPublishedScript(scriptId);
await GameEngine.startWithScript(roomId, script);
```
