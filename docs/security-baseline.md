# WenDao Security Baseline

> 更新日期：2026-04-03
> 当前基线对应代码状态：`main`

## 1. 这份文档说明什么

这是一份面向项目维护者的安全基线说明。

它回答 4 个问题：

1. 现在系统已经收口了哪些核心安全问题。
2. 认证、授权、配额和数据隔离目前是如何实现的。
3. 当前部署时必须满足哪些前置条件。
4. 后续如果继续加固，优先级应该怎么排。

## 2. 当前安全结论

截至当前版本，WenDao 已完成以下核心安全收口：

- JWT 密钥在非开发环境缺失时会拒绝启动，不再静默使用固定默认值。
- 登录态已切换为后端 `httpOnly cookie` 主路径，前端不再把 token 或用户名持久化到 `localStorage`。
- 用户私有文档已有所有者概念，读取、推荐、引用定位和搜索都遵循“公共文档 + 本人私有文档”的可见性规则。
- 高成本接口已要求登录，并加入统一限流。
- 图片上传和 ASR 音频增加了包体大小限制，降低资源滥用风险。
- 聊天错误信息已脱敏，不再向前端直接暴露内部异常文本。

## 3. 关键实现位置

### 3.1 认证与会话

- JWT 密钥与 cookie 策略：
  `src/backend-gateway/core/auth.py`
- 启动期 JWT 密钥校验：
  `src/backend-gateway/main.py`
- 登录、注册、登出接口：
  `src/backend-gateway/routers/auth.py`
- 前端会话恢复与带 cookie 请求：
  `src/frontend-app/src/store/useAuthStore.ts`

当前行为：

- 生产/预发布环境若未配置 `JWT_SECRET`，服务启动应失败。
- 登录和注册成功后，后端通过 `httpOnly cookie` 写入会话。
- 前端通过 `GET /api/v1/auth/me` 恢复登录态。
- 前端请求统一带 `credentials: 'include'`。

### 3.2 文档所有权与数据隔离

- SQLite 文档表和迁移：
  `src/backend-gateway/core/database.py`
- PostgreSQL 文档表和迁移：
  `src/backend-gateway/core/pg_database.py`
- 文档访问控制 helper：
  `src/backend-gateway/routers/document.py`
- 搜索结果可见性控制：
  `src/backend-gateway/routers/search.py`

当前规则：

- `source_type == 'corpus'` 的文档视为公共文档。
- `source_type == 'user'` 的文档必须匹配 `owner_user_id == 当前用户` 才可访问。
- 文档详情、推荐、引用定位、搜索候选都必须复用这套规则。

### 3.3 限流与滥用防护

- 统一限流 key 与处理器：
  `src/backend-gateway/core/rate_limit.py`
- 应用挂载：
  `src/backend-gateway/main.py`

当前已纳入限流的入口包括：

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/chat`
- `GET /api/v1/search`
- `POST /api/v1/documents/upload`
- `POST|GET /api/v1/documents/process/{document_id}`
- `POST /api/v1/documents/{document_id}/translation-cache`
- `POST /api/v1/documents/explain`
- `POST /api/v1/vision/analyze`
- `POST /api/v1/speech/asr`
- `POST /api/v1/speech/tts`
- `POST /api/v1/creative/poem`

### 3.4 请求体大小限制

当前已收口的包体限制：

- OCR 图片上传最大 `5MB`
  `src/backend-gateway/routers/document.py`
- 视觉识图最大 `5MB`
  `src/backend-gateway/routers/vision.py`
- ASR 音频最大 `8MB`
  `src/backend-gateway/routers/speech_api.py`

## 4. 部署前必须确认的配置

### 4.1 必填

- `JWT_SECRET`
  生产环境必须配置，且必须是随机高熵值。

### 4.2 强烈建议显式配置

- `AUTH_COOKIE_SECURE`
  建议在生产环境显式设为 `true`，不要完全依赖环境推断。
- `APP_ENV` / `WENDAO_ENV` / `ENVIRONMENT`
  建议明确为 `production`、`staging`、`development` 等值。
- `CORS_ALLOWED_ORIGINS`
  仅允许可信前端来源。
- `CORS_ALLOW_ORIGIN_REGEX`
  若开启预览域名，请确保只匹配受控域。

### 4.3 第三方能力

如果启用以下能力，还需要确保其配额与告警机制可观测：

- 智谱 AI
- Moonshot Kimi
- 讯飞 ASR/TTS
- OCR 识别服务

## 5. 当前仍建议继续加固的方向

以下内容不属于“当前明显漏洞”，但如果系统继续面向更真实的多用户公网环境，建议优先推进：

1. 将对象级授权从应用层 helper 进一步下沉到数据库侧约束。
2. 为限流增加更细的用户级配额和运维监控。
3. 给上传链路增加 MIME、扩展名和内容一致性校验。
4. 为关键写操作补充审计日志和异常告警。
5. 视部署模型决定是否加入 CSRF token 机制，而不只依赖 `SameSite=Lax`。

## 6. 验证基线

最近一轮验证结果：

- 后端全量测试通过：`212 passed`
- 前端定向测试通过：`27 passed`
- 前端 `build:check` 通过

建议在每次涉及认证、文档访问、搜索可见性、上传链路的变更后，至少重新执行：

```bash
cd src/backend-gateway
.venv\Scripts\python -m pytest

cd ../frontend-app
npm run build:check
npm test
```

## 7. 维护约定

后续只要发生以下任一变化，就应更新本文件：

- 认证方式变化
- cookie 策略变化
- 文档所有权模型变化
- 搜索可见性规则变化
- 限流策略变化
- 上传大小限制变化
- 新增高成本 AI/文件处理接口
