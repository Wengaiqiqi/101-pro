# 101 Pro 刷题平台

101 Pro 是一个多用户题库应用。每个账户拥有独立的题库，可以导入 PDF 或 DOCX 文档，审阅大模型生成的草稿，刷题练习，维护错题本，并配置个人 OpenAI 兼容的模型服务商。

## 技术栈

- 前端：React、TypeScript、Vite、Vitest
- 后端：FastAPI、SQLAlchemy、Alembic、SQLite / PostgreSQL
- 后台任务：本地导入 Worker 或 Celery + Redis
- 文档解析：pypdf、python-docx

## 环境要求

- Python 3.11+
- Node.js 20+

Docker Desktop（含 Docker Compose）为可选项，仅在使用 PostgreSQL、Redis、Celery 模式时需要。

## Windows 一键启动

双击项目根目录下的 `start-dev.cmd`。默认使用本地 SQLite，无需 Docker。启动脚本会：

- 检测 Python、Node.js 是否可用；
- 若 `backend/.env` 不存在，自动从 `.env.example` 复制生成；
- 依赖清单变化时自动安装或更新前后端依赖；
- 初始化持久化的 `.run/101-pro.db` SQLite 数据库；
- 启动 FastAPI 后端、异步本地文档导入 Worker 和 Vite 前端；
- 等待后端就绪后自动打开 `http://127.0.0.1:5173`。

运行时的 PID 状态和日志存储在 `.run/` 目录下（已加入 `.gitignore`）。

PowerShell 高级用法：

```powershell
# 跳过依赖安装，不打开浏览器
powershell -NoProfile -ExecutionPolicy Bypass -File start-dev.ps1 -SkipInstall

# 使用 Docker 启动 PostgreSQL、Redis 和 Celery 模式
powershell -NoProfile -ExecutionPolicy Bypass -File start-dev.ps1 -UseDocker
```

如果启动失败，请检查 `.run/logs/` 目录下的日志。

SQLite 和 PostgreSQL 是两套独立数据，切换模式不会自动迁移账户、题库或导入任务。

## Docker 可选部署

以下 PostgreSQL + Redis 工作流仍可用于开发和兼容性测试。

启动 PostgreSQL 和 Redis：

```powershell
docker compose up -d postgres redis
Copy-Item backend/.env.example backend/.env
```

安装并启动后端：

```powershell
cd backend
python -m pip install -e ".[dev]"
alembic upgrade head
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

在另一个终端启动 Celery Worker 处理 PDF/DOCX 导入：

```powershell
cd backend
celery -A app.tasks.celery_app:celery_app worker --loglevel=info --pool=solo
```

在另一个终端安装并启动前端：

```powershell
cd frontend
npm install
npm run dev
```

本地访问地址：

- 前端：`http://localhost:5173`
- 后端健康检查：`http://localhost:8000/api/health`
- API 文档：`http://localhost:8000/docs`

Vite 开发服务器会将 `/api` 请求代理到 `8000` 端口的后端。

## 模型配置

模型设置页面支持 OpenAI 兼容的服务商。用户级 API Key 优先于 `backend/.env` 中的平台级 `MODEL_API_KEY`。保存的 API Key 由后端加密存储，不会回传给前端。

如需配置平台级共享服务商，在 `backend/.env` 中设置：

```dotenv
MODEL_PROVIDER=openai-compatible
MODEL_BASE_URL=https://api.openai.com/v1
MODEL_NAME=gpt-4.1-mini
MODEL_API_KEY=
API_KEY_ENCRYPTION_SECRET=替换为一个长随机密钥
```

## 测试

运行完整后端测试套件：

```powershell
cd backend
pytest -v
```

运行完整前端测试套件及生产构建：

```powershell
cd frontend
npm test
npm run build
```

根目录也提供相同命令（需先安装根目录开发依赖）：

```powershell
npm install
npm test
npm run build
npm run dev
```

## 手动冒烟测试

1. 打开 `http://localhost:5173`，注册新账户。
2. 创建一个私有题库。
3. 添加一道单选题并标记正确选项。
4. 从该题库发起一题练习。
5. 作答后验证得分和正确率。
6. 在另一次练习中故意答错，验证该题出现在错题本中。
7. 将错题标记为已掌握，验证状态筛选功能。
8. 在「文档导入」页面上传 PDF 或 DOCX 文件。
9. 等待导入任务进入审阅状态，编辑草稿、审批并发布到选定题库。
10. 打开「模型设置」，保存服务商、Base URL、模型名称和个人 API Key。
11. 刷新页面，验证保存的原始 API Key 不会显示。
12. 使用「测试连接」验证模型配置是否正确。
