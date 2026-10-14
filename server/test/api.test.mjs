// 接口自动化回归测试：node:test 内置 runner，无第三方依赖
// 运行前提：npm run initdb && npm run seed && npm run seed-orders（测试依赖种子数据）
// 说明：测试会真实读写数据库，结束后自动清理自建数据；使用 3100 端口独立实例
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 3100
const BASE = `http://localhost:${PORT}/api`
let child

const api = async (method, url, { token, body, form } = {}) => {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body) headers['Content-Type'] = 'application/json'
  const res = await fetch(BASE + url, {
    method,
    headers,
    body: form ?? (body ? JSON.stringify(body) : undefined),
  })
  const data = await res.json().catch(() => null)
  return { status: res.status, data }
}

const login = async (username, password = '123456') => {
  const r = await api('POST', '/login', { body: { username, password, remember: false } })
  assert.equal(r.status, 200, `登录失败：${username} ${JSON.stringify(r.data)}`)
  return r.data.data.token
}

let T
const tokens = async () =>
  (T ??= { admin: await login('admin'), manager: await login('manager'), zhang: await login('zhangsan') })

const newOrderBody = (title = '自动化测试工单') => ({
  title,
  dept: '技术部',
  type: '网络异常',
  priority: '低',
  deadline: '2026-12-31 18:00',
  description: '自动化测试工单描述，用于回归验证',
})

before(async () => {
  child = spawn(process.execPath, ['app.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
    stdio: 'ignore',
  })
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${BASE}/health`)
      if (r.ok) return
    } catch { /* 未启动完成，继续等待 */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('测试服务器启动超时')
})

after(() => child?.kill())

// ============ 健康检查 ============
test('GET /api/health 返回 200 且 db=up', async () => {
  const r = await fetch(`${BASE}/health`)
  assert.equal(r.status, 200)
  assert.equal((await r.json()).db, 'up')
})

// ============ 认证 ============
test('登录：成功 / 错误密码 / 账号不存在 / 禁用账号 / 伪造 token', async () => {
  const okR = await api('POST', '/login', { body: { username: 'admin', password: '123456' } })
  assert.equal(okR.status, 200)
  assert.ok(okR.data.data.token)
  assert.equal(okR.data.data.user.role, '超级管理员')
  assert.equal(okR.data.data.user.password_hash, undefined)

  const bad = await api('POST', '/login', { body: { username: 'admin', password: 'wrong' } })
  assert.equal(bad.status, 401)
  const ghost = await api('POST', '/login', { body: { username: 'ghost', password: '123456' } })
  assert.equal(ghost.status, 401)
  assert.equal(bad.data.message, ghost.data.message, '账号不存在与密码错误响应一致')

  const disabled = await api('POST', '/login', { body: { username: 'wushi', password: '123456' } })
  assert.equal(disabled.status, 403)

  const me = await api('GET', '/users/me', { token: 'fake.token' })
  assert.equal(me.status, 401)
})

// ============ 工单列表数据范围 ============
test('列表：三角色数据范围与未登录拦截', async () => {
  const t = await tokens()
  const a = await api('GET', '/orders', { token: t.admin })
  assert.equal(a.status, 200)
  assert.equal(a.data.data.length, 10, '超管应见全部种子工单')

  const m = await api('GET', '/orders', { token: t.manager })
  assert.ok(m.data.data.every((o) => o.dept === '技术部'), '部长只见本部门')

  const z = await api('GET', '/orders', { token: t.zhang })
  assert.ok(
    z.data.data.every((o) => o.submitter === '张三' || o.handler === '张三'),
    '普通员工只见提交或被分配的',
  )

  const anon = await api('GET', '/orders')
  assert.equal(anon.status, 401)
})

// ============ 工单全生命周期 ============
test('工单：创建/校验/状态机/催办/批量关闭/删除保护', async () => {
  const t = await tokens()

  // 参数校验
  const bad = await api('POST', '/orders', {
    token: t.zhang, body: { title: '', dept: '技术部', type: '设备故障', priority: '中', description: '短' },
  })
  assert.equal(bad.status, 400)
  const extraBad = await api('POST', '/orders', {
    token: t.zhang,
    body: { title: 'x', dept: '技术部', type: '账号权限', priority: '中', description: '动态字段校验测试', extra: { account: 'bad space!' } },
  })
  assert.equal(extraBad.status, 400, '账号含空格应被拒绝')

  // 创建
  const c = await api('POST', '/orders', { token: t.zhang, body: newOrderBody() })
  assert.equal(c.status, 201)
  const id = c.data.data.id
  assert.match(id, /^WO\d{8}[A-Z2-9]{4}$/, '工单号格式：WO+8位日期+4位随机')
  assert.equal(c.data.data.status, '待处理')
  assert.equal(c.data.data.submitter, '张三')

  // 普通员工不可流转，部长 accept
  const f1 = await api('PATCH', `/orders/${id}/status`, { token: t.zhang, body: { action: 'accept' } })
  assert.equal(f1.status, 403)
  const a1 = await api('PATCH', `/orders/${id}/status`, { token: t.manager, body: { action: 'accept' } })
  assert.equal(a1.status, 200)
  assert.equal(a1.data.data.status, '处理中')
  assert.equal(a1.data.data.handler, '李部长')

  // 提交人催办
  const u = await api('POST', `/orders/${id}/urge`, { token: t.zhang })
  assert.equal(u.status, 200)
  assert.equal(u.data.data.logs.at(-1).action, '催办')

  // complete → close → 重复操作 409
  const a2 = await api('PATCH', `/orders/${id}/status`, { token: t.manager, body: { action: 'complete' } })
  assert.equal(a2.data.data.status, '已完成')
  assert.ok(a2.data.data.completedAt)
  const a3 = await api('PATCH', `/orders/${id}/status`, { token: t.manager, body: { action: 'close' } })
  assert.equal(a3.data.data.status, '已关闭')
  const a4 = await api('PATCH', `/orders/${id}/status`, { token: t.manager, body: { action: 'complete' } })
  assert.equal(a4.status, 409)

  // 越权详情 404
  const oth = await api('GET', '/orders/WO20260930001', { token: t.zhang })
  assert.equal(oth.status, 404)

  // 批量关闭：员工 403；超管关闭待处理单 count=1
  const c2 = await api('POST', '/orders', { token: t.zhang, body: newOrderBody('批量关闭测试单') })
  const id2 = c2.data.data.id
  const bcZ = await api('POST', '/orders/batch-close', { token: t.zhang, body: { ids: [id2] } })
  assert.equal(bcZ.status, 403)
  const bc = await api('POST', '/orders/batch-close', { token: t.admin, body: { ids: [id2] } })
  assert.equal(bc.data.data.count, 1)

  // 删除保护：部长 403、超管 200、删除后 404
  const d1 = await api('DELETE', `/orders/${id}`, { token: t.manager })
  assert.equal(d1.status, 403)
  const d2 = await api('DELETE', `/orders/${id}`, { token: t.admin })
  assert.equal(d2.status, 200)
  const gone = await api('GET', `/orders/${id}`, { token: t.zhang })
  assert.equal(gone.status, 404)
  await api('DELETE', `/orders/${id2}`, { token: t.admin })
})

// ============ 统计一致性 ============
test('统计：overview 与列表数据一致（三角色）', async () => {
  const t = await tokens()
  for (const [label, token] of [['admin', t.admin], ['manager', t.manager], ['zhang', t.zhang]]) {
    const list = (await api('GET', '/orders', { token })).data.data
    const s = (await api('GET', '/stats/overview', { token })).data.data
    assert.equal(s.total, list.length, `${label}: total`)
    const count = (st) => list.filter((o) => o.status === st).length
    assert.equal(s.pending, count('待处理'), `${label}: pending`)
    assert.equal(s.processing, count('处理中'), `${label}: processing`)
    assert.equal(s.completed, count('已完成'), `${label}: completed`)
    assert.equal(s.closed, count('已关闭'), `${label}: closed`)
    assert.equal(s.returned, count('已退回'), `${label}: returned`)
  }
})

test('统计：trend 逐日补零与参数校验 / workload 权限', async () => {
  const t = await tokens()
  const r7 = await api('GET', '/stats/trend?days=7', { token: t.admin })
  assert.equal(r7.data.data.length, 7)
  const r30 = await api('GET', '/stats/trend?days=30', { token: t.admin })
  assert.equal(r30.data.data.length, 30)
  const bad = await api('GET', '/stats/trend?days=5', { token: t.admin })
  assert.equal(bad.status, 400)

  const w = await api('GET', '/stats/workload', { token: t.admin })
  assert.equal(w.status, 200)
  assert.ok(w.data.data.every((r) => typeof r.handlerName === 'string' && r.processing >= 0))
  const wf = await api('GET', '/stats/workload', { token: t.zhang })
  assert.equal(wf.status, 403)
})

// ============ 用户管理 ============
test('用户管理：列表范围/CRUD/启禁/重置/删除保护', async () => {
  const t = await tokens()

  // 部长只读本部门；员工 403；部长不可创建
  const m = await api('GET', '/users', { token: t.manager })
  assert.ok(m.data.data.every((u) => u.dept === '技术部'), '部长只见本部门用户')
  const zf = await api('GET', '/users', { token: t.zhang })
  assert.equal(zf.status, 403)
  const mf = await api('POST', '/users', { token: t.manager, body: { username: 'x', name: 'x', role: '普通员工', dept: '技术部' } })
  assert.equal(mf.status, 403)

  // 创建 + 默认密码登录 + 重复 409
  const uname = `test${Date.now()}`
  const c = await api('POST', '/users', {
    token: t.admin,
    body: { username: uname, name: '测试用户', role: '普通员工', dept: '技术部', email: 'test@oa.com' },
  })
  assert.equal(c.status, 201)
  const uid = c.data.data.id
  const dup = await api('POST', '/users', {
    token: t.admin, body: { username: uname, name: '重复', role: '普通员工', dept: '技术部' },
  })
  assert.equal(dup.status, 409)
  const tok2 = await login(uname)
  assert.ok(tok2)

  // 编辑
  const e = await api('PUT', `/users/${uid}`, {
    token: t.admin, body: { name: '测试用户改', role: '部长', dept: '市场部', email: 'test2@oa.com' },
  })
  assert.equal(e.data.data.name, '测试用户改')
  assert.equal(e.data.data.role, '部长')

  // 重置密码后可用新会话（默认密码）
  const rp = await api('PATCH', `/users/${uid}/password`, { token: t.admin })
  assert.equal(rp.status, 200)
  const relog = await login(uname)
  assert.ok(relog)

  // 禁用：已有 token 立即失效、重新登录 403
  const dis = await api('PATCH', `/users/${uid}/status`, { token: t.admin, body: { status: '禁用' } })
  assert.equal(dis.data.data.status, '禁用')
  const dead = await api('GET', '/orders', { token: relog })
  assert.equal(dead.status, 401, '禁用后旧 token 立即失效')
  const relogin = await api('POST', '/login', { body: { username: uname, password: '123456' } })
  assert.equal(relogin.status, 403)
  await api('PATCH', `/users/${uid}/status`, { token: t.admin, body: { status: '启用' } })

  // 自删 / 自禁保护、有工单用户 409、正常删除
  const selfDel = await api('DELETE', '/users/1', { token: t.admin })
  assert.equal(selfDel.status, 400)
  const prot = await api('DELETE', '/users/5', { token: t.admin }) // 张三有工单
  assert.equal(prot.status, 409)
  const del = await api('DELETE', `/users/${uid}`, { token: t.admin })
  assert.equal(del.status, 200)
})

// ============ 附件上传 ============
test('上传：multipart 附件返回 url', async () => {
  const t = await tokens()
  const fd = new FormData()
  fd.append('file', new Blob(['test content'], { type: 'text/plain' }), 'hello.txt')
  const r = await api('POST', '/upload', { token: t.zhang, form: fd })
  assert.equal(r.status, 201)
  assert.match(r.data.data.url, /^\/uploads\//)
  assert.equal(r.data.data.name, 'hello.txt')
})
