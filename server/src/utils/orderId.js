// 工单号生成：WO + yyyymmdd + 4 位随机字符（随机生成，删除后不会重号）
// 字符表剔除易混淆的 I/O/0/1

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const randomInt = (max) => {
  // 用 crypto 而非 Math.random，保证随机质量
  const buf = new Uint32Array(1)
  globalThis.crypto.getRandomValues(buf)
  return buf[0] % max
}

// 当前东八区日期 → 'yyyymmdd'
const datePart = () => {
  const t = new Date(Date.now() + 8 * 60 * 60 * 1000)
  const y = t.getUTCFullYear()
  const m = String(t.getUTCMonth() + 1).padStart(2, '0')
  const d = String(t.getUTCDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

export const genOrderId = () => {
  let rand = ''
  for (let i = 0; i < 4; i++) rand += CHARS[randomInt(CHARS.length)]
  return `WO${datePart()}${rand}`
}
