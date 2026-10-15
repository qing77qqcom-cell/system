import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import swaggerUi from 'swagger-ui-express'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { checkDb } from './db.js'
import { notFound, errorHandler } from './middleware/error.js'
import { openapiSpec } from './openapi.js'
import authRoutes from './routes/auth.js'
import orderRoutes from './routes/orders.js'
import uploadRoutes from './routes/upload.js'
import statsRoutes from './routes/stats.js'
import userRoutes from './routes/users.js'
import metaRoutes from './routes/meta.js'

export const createApp = () => {
  const app = express()

  if (config.env === 'development') app.use(morgan('dev'))
  app.use(cors({ origin: config.corsOrigins }))
  app.use(express.json({ limit: '1mb' }))

  // 附件静态目录（真实上传由第四阶段的 multer 路由挂载）
  const uploadPath = path.resolve(process.cwd(), config.uploadDir)
  fs.mkdirSync(uploadPath, { recursive: true })
  app.use('/uploads', express.static(uploadPath))

  // 健康检查：验证服务与数据库连通性
  app.get('/api/health', async (req, res) => {
    try {
      await checkDb()
      res.json({ status: 'ok', db: 'up' })
    } catch (err) {
      console.error('[健康检查] 数据库不可用：', err.message)
      res.status(503).json({ status: 'down', db: 'down' })
    }
  })

  // 在线接口文档：Swagger UI + 原始 OpenAPI 规范
  app.get('/api/openapi.json', (req, res) => res.json(openapiSpec))
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(openapiSpec, { swaggerOptions: { persistAuthorization: true } }),
  )

  app.use('/api/meta', metaRoutes)
  app.use('/api', authRoutes)
  app.use('/api/upload', uploadRoutes)
  app.use('/api/orders', orderRoutes)
  app.use('/api/stats', statsRoutes)
  app.use('/api/users', userRoutes)

  app.use(notFound)
  app.use(errorHandler)
  return app
}

export const start = () =>
  new Promise((resolve) => {
    const app = createApp()
    app.listen(config.port, () => {
      console.log(`OA 后端已启动：http://localhost:${config.port}（环境：${config.env}）`)
      resolve(app)
    })
  })
