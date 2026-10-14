// 入口文件：必须最先设置时区，再动态加载服务模块
// （静态 import 会提升到顶部，导致 config/db 等模块在 TZ 生效前被求值）
process.env.TZ = 'Asia/Shanghai'

const { start } = await import('./src/server.js')

start().catch((err) => {
  console.error('服务启动失败：', err)
  process.exit(1)
})
