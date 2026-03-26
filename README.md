# 古籍智解（TextTwin）

AI 驱动的古籍知识探索平台 — 让任何人都能轻松读懂古籍

## 项目简介

TextTwin 是一个面向古籍阅读与研究的 AI 知识平台。通过 OCR 识别、自动断句标点、白话文翻译、知识图谱可视化等功能，帮助用户跨越古文阅读障碍，探索古典文献中的知识关联。

### 核心特性

- **OCR 古籍识别**：支持竖排文字上传识别（百度 OCR + PaddleOCR 降级链）
- **三栏对照阅读**：原文 / 标点文 / 白话翻译并列展示，移动端 Tab 自适应
- **知识图谱**：200+ 节点力导向图可视化，支持动态 AI 扩展、典故溯源链
- **RAG 智能对话**：基于向量检索的古籍知识问答，引用原文片段
- **多模态增强**：图片辅助分析、古风诗词生成配图、语音交互
- **7 款 AI 工具 / 4 家供应商**：智谱 AI、Moonshot Kimi、讯飞 ASR/TTS、FAISS+Embedding

### 国赛主打链路

- **读懂闭环**：OCR 上传 -> 标点翻译 -> 三栏对照 -> 字词释义
- **可解释检索**：RAG 对话 -> 原文引用 -> 知识图谱联动
- **二次阅读沉淀**：搜索 -> 历史/收藏 -> 继续追问

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

## 快速开始

### 环境要求

- Node.js 18+
- Python 3.10+

### 1. 克隆项目

```bash
git clone <repository-url>
cd TextTwin
```

### 2. 配置环境变量

```bash
cp src/backend-gateway/.env.example src/backend-gateway/.env

# 编辑 .env，填入 API Keys：
# ZHIPUAI_API_KEY     — 智谱 AI（Embedding / GLM-4 / CogView / GLM-4V）
# MOONSHOT_API_KEY    — Moonshot Kimi（RAG 知识问答）
# IFLYTEK_*           — 讯飞 ASR/TTS 语音服务
# BAIDU_OCR_*         — 百度 OCR 文字识别
# DATABASE_URL        — PostgreSQL 连接串（可选，降级到 SQLite）
```

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
uvicorn main:app --reload --port 8000
```

## 项目结构

```
TextTwin/
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

竞赛交付材料源码已放在 [deliverables/competition/CHECKLIST.md](//workspace/deliverables/competition/CHECKLIST.md)：

- [PPT_OUTLINE.md](//workspace/deliverables/competition/PPT_OUTLINE.md)
- [DEMO_SCRIPT.md](//workspace/deliverables/competition/DEMO_SCRIPT.md)
- [DEV_BRIEF.md](//workspace/deliverables/competition/DEV_BRIEF.md)
- [JUDGE_TALKING_POINTS.md](//workspace/deliverables/competition/JUDGE_TALKING_POINTS.md)

## 赛制合规

本项目参加 2026 年中国大学生计算机设计大赛 Web 应用与开发赛道。

## 许可证

本项目仅供学术研究和竞赛使用。
