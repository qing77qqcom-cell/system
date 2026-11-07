import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import fs from 'node:fs'
import path from 'node:path'
import * as yaml from 'js-yaml'
import swaggerUi from 'swagger-ui-express'
import { fileURLToPath } from 'node:url'
import { config } from './config.js'
import { checkDb } from './db.js'
import { notFound, errorHandler } from './middleware/error.js'
import authRoutes from './routes/auth.js'
import ticketsRoutes, { slaRecordsRouter } from './routes/tickets.js'
import userRoutes from './routes/users.js'
import departmentsRoutes from './routes/departments.js'
import rolesRoutes from './routes/roles.js'
import configRoutes from './routes/config.js'
import logsRoutes from './routes/logs.js'
import notificationsRoutes from './routes/notifications.js'
import statsRoutes from './routes/stats.js'
import uploadRoutes from './routes/upload.js'
import { startSlaScheduler } from './services/slaScheduler.js'

// 加载 openapi.yaml（ESM 用 fileURLToPath 兼容 __dirname）
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const openapiSpec = yaml.load(fs.readFileSync(path.resolve(__dirname, 'openapi.yaml'), 'utf-8'))

export const createApp = () => {
  const app = express()

  if (config.env === 'development') app.use(morgan('dev'))
  app.use(cors({ origin: config.corsOrigins }))
  app.use(express.json({ limit: '1mb' }))

  // Swagger UI（开发与生产均可访问）
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, {
    explorer: true,
    customSiteTitle: 'OA 工单系统 API',
  }))

  // 附件静态目录
  const uploadPath = path.resolve(process.cwd(), config.uploadDir)
  fs.mkdirSync(uploadPath, { recursive: true })
  app.use('/uploads', express.static(uploadPath))

  // 健康检查
  app.get('/api/health', async (req, res) => {
    try {
      await checkDb()
      res.json({ status: 'ok', db: 'up' })
    } catch (err) {
      console.error('[健康检查] 数据库不可用：', err.message)
      res.status(503).json({ status: 'down', db: 'down' })
    }
  })

  app.use('/api', authRoutes)
  app.use('/api/tickets', ticketsRoutes)
  app.use('/api/sla-records', slaRecordsRouter)
  app.use('/api/users', userRoutes)
  app.use('/api/departments', departmentsRoutes)
  app.use('/api/roles', rolesRoutes)
  app.use('/api', configRoutes) // dictionaries / approval-flows / sla-rules / work-calendars / form-configs / role-permissions / notification-templates / system-params
  app.use('/api/logs', logsRoutes)
  app.use('/api/notifications', notificationsRoutes)
  app.use('/api/stats', statsRoutes)
  app.use('/api/upload', uploadRoutes)

  app.use(notFound)
  app.use(errorHandler)
  return app
}

export const start = () =>
  new Promise((resolve) => {
    const app = createApp()
    app.listen(config.port, async () => {
      console.log(`OA 后端已启动：http://localhost:${config.port}（环境：${config.env}）`)
      // SLA 扫描器：DB 连不上只 warn，不阻塞服务器启动（health 端点仍能反映 db:down）
      try {
        await checkDb()
        startSlaScheduler()
        console.log('[数据库] 连接正常；SLA 扫描器已启动')
      } catch (err) {
        console.warn('[数据库] 连接失败，SLA 扫描器跳过；health 端点将返回 db=down')
        console.warn('[数据库] 请检查 .env 的 DATABASE_URL / DB_SSL 配置，或安装本地 PostgreSQL')
        console.warn('[错误详情]', err.message)
      }
      resolve(app)
    })
  })
