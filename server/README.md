# OA 工单管理系统 — 后端服务

Vue3 + Element Plus 工单系统的独立后端：Express 5 + PostgreSQL（Neon 托管）+ JWT 认证 + 角色数据权限。

## 在线接口文档

启动服务后浏览器打开 **http://localhost:3000/api-docs**（Swagger UI，可直接在页面 Authorize 填 token 调试）。

原始 OpenAPI 规范：`GET /api/openapi.json`。

## 目录结构

```
server/
├── app.js                  # 入口：设置时区后动态加载服务
├── src/
│   ├── server.js           # express 装配（路由挂载 / swagger / 错误处理）
│   ├── config.js           # 环境变量（缺失必需变量拒绝启动）
│   ├── db.js               # pg 连接池（Neon SSL / 会话时区 / 事务包装）
│   ├── openapi.js          # OpenAPI 3.0 规范（接口文档数据源）
│   ├── constants.js        # 枚举（与前端 mock 同源）
│   ├── routes/             # auth / orders / stats / users / upload
│   ├── middleware/         # requireAuth（含禁用回查）/ requireRole / errorHandler
│   └── utils/              # dto / validate / datetime / orderId / respond / apiError
├── sql/init.sql            # 建表脚本（幂等）
├── scripts/                # initdb / seed（用户）/ seed-orders（工单）
└── test/api.test.mjs       # 回归测试（node:test，8 组 50+ 断言）
```

## 本地启动

```powershell
cd server
npm install

# 1. 配置环境变量：复制 .env.example 为 .env，填入 Neon 连接串与 JWT_SECRET
#    生成密钥：node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

npm run initdb        # 建表（幂等）
npm run seed          # 写入 12 个演示用户（幂等）
npm run seed-orders   # 写入 10 条演示工单（幂等）

npm run dev           # 开发模式（nodemon 热重载）
# 或 npm start
```

## 演示账号（初始密码均为 123456）

| 账号 | 姓名 | 角色 | 数据范围 |
|---|---|---|---|
| admin | 系统管理员 | 超级管理员 | 全部 |
| manager | 李部长 | 部长 | 技术部 |
| lisi | 李四 | 部长 | 技术部 |
| zhoujiu | 周九 | 部长 | 人事部 |
| zhangsan 等 | 张三等 | 普通员工 | 本人提交的 + 被分配处理的 |
| wushi / fengshier | 吴十/冯十二 | 普通员工 | **已禁用**（用于验证登录拦截） |

## 运行测试

```powershell
npm test    # 自动拉起 3100 端口测试实例，跑完自动清理测试数据
```

前置：已执行 initdb + seed + seed-orders（测试依赖种子数据）。

## 部署（Render + Neon）

1. **数据库**：Neon 控制台创建免费 Project，复制连接串（含 `sslmode=require`）
2. **后端**：Render 创建 Web Service，连接 GitHub 仓库
   - Root Directory：`server`
   - Build Command：`npm install`
   - Start Command：`node app.js`
   - Environment Variables：`DATABASE_URL`、`JWT_SECRET`、`NODE_ENV=production`、`CORS_ORIGIN=<前端域名>`
3. **初始化**：本地指向生产库执行一次 `npm run initdb && npm run seed && npm run seed-orders`（或 Render Shell 内执行）
4. **CORS**：`CORS_ORIGIN` 填前端部署域名（多个用逗号分隔）

## 统一约定

- 响应包装：`{ code: 0, message, data }`；错误码与 HTTP 状态码一致
- 时间：东八区 `YYYY-MM-DD HH:mm` 字符串
- 数据权限：列表/详情/编辑/删除统一按角色过滤，无权一律 404（不暴露存在性）
- 状态机：`待处理 →(accept)→ 处理中 →(complete)→ 已完成 →(close)→ 已关闭`；处理中可 `reject` 退回，已退回可重新 accept 或编辑

## 已知限制

- 附件存本地磁盘：Render 免费实例重启后丢失（可迁 Neon Storage 或 S3）
- 无 token 黑名单/刷新机制：改密后旧 token 仍有效至过期（仅禁用立即失效）
- 统计接口为实时聚合查询，数据量大后需加缓存或物化视图
- 未实现：操作日志独立查询接口、系统配置、邮件/站内通知
