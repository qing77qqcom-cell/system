import 'dotenv/config'

// 必需变量缺失时直接退出，避免带病启动
const REQUIRED = ['DATABASE_URL', 'JWT_SECRET']
const missing = REQUIRED.filter((k) => !process.env[k])
if (missing.length) {
  console.error(
    `[启动失败] 缺少必需的环境变量：${missing.join(', ')}\n` +
      '请在 server/.env 中配置（可参考 .env.example）。',
  )
  process.exit(1)
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpires: process.env.JWT_EXPIRES || '1d',
  jwtExpiresRemember: process.env.JWT_EXPIRES_REMEMBER || '7d',
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  dbSsl: process.env.DB_SSL ?? null, // 'on' / 'off' / null(自动：URL 含 sslmode=require 即开启)
  jwtPayloadFields: ['uid', 'username', 'name', 'role', 'dept'],
}
