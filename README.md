# 古籍智解（WenDao）

AI 驱动的古籍深度阅读与学习平台 — 不只是翻译，更是逐字逐句的理解

## 项目简介

WenDao 是一个帮助普通人“真正读懂”古籍的 AI 阅读工具。它不是只服务于“手头正好有古籍扫描图的人”，而是把真实古籍库阅读放在最前面，同时保留检索、问答和图片识别这些辅助能力。

- **主阅读入口**：真实古籍库、继续阅读、字词沉淀
- **辅助理解入口**：问题追问、人物典故检索、原句定位
- **专业入口**：上传古籍图片，进入 OCR → 断句 → 翻译 → 对照阅读链路
- **持续学习入口**：生词积累、字词本、学习卡片、继续阅读推荐

它面向三层目标用户：

- **普通学生**：在课本、考试、课堂里遇到古文时，快速理解原文、典故和人物背景
- **传统文化爱好者**：低门槛阅读《论语》《孟子》《道德经》等经典
- **少量专业用户**：拥有古籍扫描图、影印页或馆藏图片，需要 OCR 解析链路

### 核心特性

- **真实古籍仓库**：内置基于 Kanripo 整理的 100 部公共版权古籍，全部按“完整文本 + 基础导读”统一入库
- **原文 / 标点文主阅读**：内置古籍默认提供完整原文与标点文，阅读链路围绕这两栏展开
- **阅读器渐进加载**：阅读页先加载首批分段，继续下滑时自动续载后续正文，避免打开大部头时一次性等待整本返回
- **同步滚动开关**：桌面端原文与标点文支持同步滚动，并保留开关，方便对照阅读或单栏细读
- **片段问答与问题检索**：支持从人物、概念、典故或一句原文切入理解古籍内容
- **OCR 古籍识别**：支持竖排文字上传识别（OCR 识别服务 + PaddleOCR 降级链）
- **AI 逐句精讲**：在阅读中点击一句古文，获取句义拆解、典故补充与继续追问建议
- **RAG 智能对话**：基于向量检索的古籍知识问答，引用原文片段
- **多模态增强**：古风诗词生成配图、语音交互
- **多类智能能力协同**：问答、释义、语音、向量检索等能力按场景组合使用

### 当前产品主链路

- **主阅读链路**：古籍库 -> 目录导航 -> 原文 / 标点文对照阅读 -> 逐句精讲 / 字词释义 -> 继续追问
- **课堂/考试链路**：问题提问 -> 人物典故检索 -> 原文引用 -> 背景理解
- **专业解析链路**：OCR 上传 -> 标点翻译 -> 对照阅读 -> 字词释义
- **持续学习链路**：搜索 -> 历史 / 字词本 -> 学习卡片 -> 继续阅读推荐

## 技术栈

### 前端
- React 19 + TypeScript
- Vite 6 + Tailwind CSS
- Zustand（状态管理）

### 后端
- FastAPI + Uvicorn
- FAISS 向量检索 + LangChain RAG
- PostgreSQL（文档存储）+ SQLite（对话历史）
- 多后端 Embedding 降级链（智谱 → fastembed → HF Inference → sklearn）

## 在线体验

无需本地部署，直接访问：**https://example.com**

当前生产环境采用“WenDao 前端 + TextTwin 命名的 Railway 后端”组合：

- 前端：`https://example.com`
- 后端：`https://api.example.com`

这是当前正式配置，不是误指向；若继续保持现状，请在前端部署环境里持续把 `VITE_API_URL` 设为该 Railway 域名。
首次进入前端需要先注册或登录，当前默认不提供游客模式。

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
# BAIDU_OCR_*         — OCR 识别服务凭据（当前实现）
# DATABASE_URL        — PostgreSQL 连接串（可选，降级到 SQLite）
#
# 编辑前端 .env：
# VITE_API_URL        — 后端 REST / SSE API 地址
```

如果前端和后端分开部署，务必把 `VITE_API_URL` 指向真实后端域名；本地开发默认使用 `http://localhost:8000`。
当前前端不再单独使用 `VITE_WS_URL`；聊天、OCR 流式处理、逐句精讲等能力都复用 `VITE_API_URL`。

当前线上配置可直接写为：

```bash
VITE_API_URL=https://api.example.com
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
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python scripts/build_kanripo_corpus.py   # 首次构建真实古籍库快照（已内置可直接跳过）
.venv\Scripts\python -m uvicorn main:app --reload --port 8000
```

说明：

- 后端优先使用项目内 `.venv` 解释器。若直接调用系统 `python` / `pytest`，启动时会提示解释器不在项目虚拟环境中。
- `ZHIPUAI_API_KEY` 是当前统一命名；旧变量 `ZHIPU_API_KEY` 仍可兼容读取，但建议尽快迁移。
- 若更换了 embedding 后端或相关环境变量，请执行一次 `.venv\Scripts\python scripts/rebuild_corpus_faiss.py` 重建主库 FAISS 索引，索引元数据会记录构建时所用 backend。
- 云端 Docker 部署默认复用仓库内已提交的 `faiss_db` 索引文件，不在镜像构建阶段强制重建，避免外部模型下载限流导致构建失败。

### 4. 运行测试

```bash
cd src/frontend-app
npm test

cd ../backend-gateway
.venv\Scripts\python -m pytest
```

## 阅读器说明

- 打开内置古籍时，前端会先请求阅读器专用接口，只拿首批分段内容；滚动接近底部时再继续请求后续分段。
- 当前 100 部内置古籍已经全部入库，并且都带完整原文与标点文。
- 当前 100 部内置古籍已经全部入库，并且都带完整原文与标点文。
- 桌面端支持原文和标点文同步滚动，也支持手动关闭同步，便于单独细读某一栏。

## 项目结构

```WenDao/
├── src/
│   ├── frontend-app/              # React 前端
│   │   ├── src/
│   │   │   ├── components/        # UI 组件
│   │   │   │   ├── ChatInterface.tsx      # AI 对话界面
│   │   │   │   ├── ThreeColumnReader.tsx   # 三栏阅读器（含目录导航面板）
│   │   │   │   ├── OCRPreview.tsx          # OCR 预览编辑
│   │   │   │   ├── ReaderTocPanel.tsx      # 目录导航面板
│   │   │   │   ├── ReaderExplainPanel.tsx  # 逐句精讲面板
│   │   │   │   ├── ReaderNotesPanel.tsx    # 阅读笔记与收藏操作
│   │   │   │   ├── StudyCardsPanel.tsx     # 学习卡片
│   │   │   │   ├── WordPopover.tsx         # 字词释义弹窗
│   │   │   │   ├── FavoritesList.tsx       # 收藏夹
│   │   │   │   └── WordbookPanel.tsx       # 字词本
│   │   │   ├── lib/               # API 与业务辅助
│   │   │   ├── store/             # Zustand 状态管理
│   │   │   └── utils/             # 阅读器文本工具
│   │   └── package.json
│   │
│   └── backend-gateway/           # FastAPI 后端
│       ├── agents/                # AI Agent 模块
│       │   ├── rag.py             # RAG 知识检索
│       │   ├── ocr.py             # OCR 识别
│       │   ├── sentence_explainer.py # 逐句精讲
│       │   ├── translator.py      # 断句标点翻译
│       │   ├── word_explainer.py  # 字词释义
│       │   ├── speech.py          # 讯飞 ASR/TTS
│       │   └── creative.py        # 诗词生成
│       ├── core/
│       │   ├── embeddings.py      # 多后端 Embedding 适配器
│       │   ├── pg_database.py     # PostgreSQL 管理
│       │   └── reading_guides.py    # 阅读引导与章节摘要
│       ├── routers/               # API 路由
│       ├── data/                  # Kanripo 古籍索引与快照数据
│       ├── faiss_db/              # FAISS 向量索引
│       └── tests/                 # 后端测试
│
├── infrastructure/                # 部署与基础设施配置
├── docker-compose.yml             # 本地联调配置
├── railway.json                   # Railway 部署配置
├── vercel.json                    # Vercel 部署配置
└── README.md
```

## API 文档

启动后端后访问：
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## 赛制合规

本项目参加 2026 年中国大学生计算机设计大赛 Web 应用与开发赛道。

## 许可证

本项目仅供学术研究和竞赛使用。
