# 古籍智解（WenDao）

AI 驱动的古籍知识探索平台 — 让任何人都能轻松读懂古籍

## 项目简介

WenDao 是一个“帮助普通人读懂古籍”的 AI 阅读工具。它不是只服务于“手头正好有古籍扫描图的人”，而是把真实古籍库阅读放在最前面，同时保留检索、问答和图片识别这些辅助能力。

- **主阅读入口**：真实古籍库、精选导读、继续阅读、字词沉淀
- **辅助理解入口**：问题追问、人物典故检索、原句定位
- **专业入口**：上传古籍图片，进入 OCR → 断句 → 翻译 → 对照阅读链路
- **持续学习入口**：生词积累、阅读历史、学习卡片、继续阅读推荐

它面向三层目标用户：

- **普通学生**：在课本、考试、课堂里遇到古文时，快速理解原文、典故和人物背景
- **传统文化爱好者**：低门槛阅读《论语》《孟子》《道德经》等经典
- **少量专业用户**：拥有古籍扫描图、影印页或馆藏图片，需要 OCR 解析链路

### 核心特性

- **真实古籍仓库**：内置基于 Kanripo 整理的首批 13 部公共版权古籍，主阅读功能不再只依赖样例
- **精选导读**：保留小批量精选内容，帮助第一次进入的用户快速上手
- **片段问答与问题检索**：支持从人物、概念、典故或一句原文切入理解古籍内容
- **OCR 古籍识别**：支持竖排文字上传识别（百度 OCR + PaddleOCR 降级链）
- **三栏对照阅读**：原文 / 标点文 / 白话翻译并列展示，移动端 Tab 自适应
- **知识图谱**：200+ 节点力导向图可视化，支持动态 AI 扩展、典故溯源链
- **RAG 智能对话**：基于向量检索的古籍知识问答，引用原文片段
- **多模态增强**：图片辅助分析、古风诗词生成配图、语音交互
- **7 款 AI 工具 / 4 家供应商**：智谱 AI、Moonshot Kimi、讯飞 ASR/TTS、FAISS+Embedding

### 当前产品主链路

- **主阅读链路**：古籍库 -> 三栏阅读 -> 字词释义 -> 继续追问
- **课堂/考试链路**：问题提问 -> 人物典故检索 -> 原文引用 -> 背景理解
- **专业解析链路**：OCR 上传 -> 标点翻译 -> 三栏对照 -> 字词释义
- **持续学习链路**：搜索 -> 历史/字词本 -> 学习卡片 -> 继续阅读推荐

## 技术栈

### 前端
- React 19 + TypeScript
- Vite 6 + Tailwind CSS
- vis-network（知识图谱可视化）
- Zustand（状态管理）

### 后端
- FastAPI + Uvicorn
- FAISS 向量检索 + LangChain RAG
- PostgreSQL（文档存储）+ SQLite（对话历史）
- 多后端 Embedding 降级链（智谱 → fastembed → HF Inference → sklearn）

## 在线体验

无需本地部署，直接访问：**https://example.com**

## 快速开始

### 环境要求

- Node.js 18+
- Python 3.10+

### 1. 克隆项目

```bash
git clone <repository-url>
cd WenDao
```

### 2. 配置环境变量

```bash
cp src/backend-gateway/.env.example src/backend-gateway/.env
cp src/frontend-app/.env.example src/frontend-app/.env

# 编辑后端 .env，填入 API Keys：
# ZHIPUAI_API_KEY     — 智谱 AI（Embedding / GLM-4 / CogView / GLM-4V）
# MOONSHOT_API_KEY    — Moonshot Kimi（RAG 知识问答）
# IFLYTEK_*           — 讯飞 ASR/TTS 语音服务
# BAIDU_OCR_*         — 百度 OCR 文字识别
# DATABASE_URL        — PostgreSQL 连接串（可选，降级到 SQLite）
#
# 如需启用“新实体发现”的实时 LLM 抽取，可额外设置：
# ENTITY_DISCOVERY_USE_LLM=true
#
# 编辑前端 .env：
# VITE_API_URL        — 后端 REST API 地址
# VITE_WS_URL         — 后端 WebSocket 地址
```

如果前端和后端分开部署，务必把 `VITE_API_URL` 指向真实后端域名；本地开发默认使用 `http://localhost:8000`。

### 3. 启动服务

**前端**
```bash
cd src/frontend-app
npm install
npm run dev          # http://localhost:5173
```

**后端**
```bash
cd src/backend-gateway
python -m pip install -r requirements.txt
python scripts/build_kanripo_corpus.py   # 首次构建真实古籍库快照（已内置可直接跳过）
uvicorn main:app --reload --port 8000
```

## 项目结构

```
WenDao/
├── src/
│   ├── frontend-app/              # React 前端
│   │   ├── src/
│   │   │   ├── components/        # UI 组件
│   │   │   │   ├── ChatInterface.tsx      # AI 对话界面
│   │   │   │   ├── ThreeColumnReader.tsx   # 三栏阅读器
│   │   │   │   ├── DocumentUpload.tsx      # 文档上传
│   │   │   │   ├── OCRPreview.tsx          # OCR 预览编辑
│   │   │   │   ├── KnowledgeGraphPanel.tsx # 知识图谱
│   │   │   │   ├── WordPopover.tsx         # 字词释义弹窗
│   │   │   │   ├── ReadingHistory.tsx      # 阅读历史
│   │   │   │   └── FavoritesList.tsx       # 收藏夹
│   │   │   ├── store/             # Zustand 状态管理
│   │   │   └── hooks/             # 自定义 Hooks
│   │   └── package.json
│   │
│   └── backend-gateway/           # FastAPI 后端
│       ├── agents/                # AI Agent 模块
│       │   ├── rag.py             # RAG 知识检索
│       │   ├── ocr.py             # OCR 识别
│       │   ├── translator.py      # 断句标点翻译
│       │   ├── word_explainer.py  # 字词释义
│       │   ├── speech.py          # 讯飞 ASR/TTS
│       │   ├── vision.py          # 古建筑识别
│       │   └── creative.py        # 诗词生成
│       ├── core/
│       │   ├── embeddings.py      # 多后端 Embedding 适配器
│       │   ├── pg_database.py     # PostgreSQL 管理
│       │   └── scraper.py         # 知识图谱数据采集
│       ├── routers/               # API 路由
│       ├── data/                  # 知识图谱种子数据
│       ├── faiss_db/              # FAISS 向量索引
│       └── tests/                 # 后端测试
│
├── .planning/                     # 项目规划文档
└── README.md
```

## API 文档

启动后端后访问：
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Competition Materials

竞赛交付材料源码已放在 [deliverables/competition/CHECKLIST.md](./deliverables/competition/CHECKLIST.md)：

- [PPT_OUTLINE.md](./deliverables/competition/PPT_OUTLINE.md)
- [DEMO_SCRIPT.md](./deliverables/competition/DEMO_SCRIPT.md)
- [DEV_BRIEF.md](./deliverables/competition/DEV_BRIEF.md)
- [JUDGE_TALKING_POINTS.md](./deliverables/competition/JUDGE_TALKING_POINTS.md)

## 赛制合规

本项目参加 2026 年中国大学生计算机设计大赛 Web 应用与开发赛道。

## 许可证

本项目仅供学术研究和竞赛使用。
