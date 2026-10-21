// 工作日历计时（database-design.md §5.1/§5.6）
// 进程 TZ 已在 app.js 固定为 Asia/Shanghai，Date 本地方法即东八区

const DAY_MS = 24 * 60 * 60 * 1000

const hmToMs = (hm) => {
  const [h, m] = String(hm).slice(0, 5).split(':').map(Number)
  return (h * 60 + m) * 60 * 1000
}

const dayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// 加载日历 + 特殊日 → { workDays:Set, startMs, endMs, breaks:[[s,e]...], special:Map }
export const loadCalendar = async (queryable, calendarId) => {
  const { rows } = await queryable.query('SELECT * FROM work_calendars WHERE id = $1', [calendarId])
  const cal = rows[0]
  if (!cal) return null
  const { rows: days } = await queryable.query(
    'SELECT day::text AS day, kind FROM calendar_special_days WHERE calendar_id = $1',
    [calendarId],
  )
  return {
    workDays: new Set((cal.work_days || []).map(Number)),
    startMs: hmToMs(cal.day_start),
    endMs: hmToMs(cal.day_end),
    breaks: (cal.breaks || []).map((b) => [hmToMs(b.start), hmToMs(b.end)]).sort((a, b) => a[0] - b[0]),
    special: new Map(days.map((d) => [String(d.day).slice(0, 10), d.kind])),
  }
}

// 某天的工作时间段（毫秒区间，相对当日 0 点）
const dayWindows = (calCtx, date) => {
  const key = dayKey(date)
  const special = calCtx.special.get(key)
  if (special === 'holiday') return []
  const dow = date.getDay()
  if (special !== 'extra_workday' && !calCtx.workDays.has(dow)) return []
  const wins = [[calCtx.startMs, calCtx.endMs]]
  // 扣除非计时段（午休等）
  for (const [bs, be] of calCtx.breaks) {
    for (let i = wins.length - 1; i >= 0; i--) {
      const [s, e] = wins[i]
      if (be <= s || bs >= e) continue
      wins.splice(i, 1)
      if (bs > s) wins.push([s, bs])
      if (be < e) wins.push([be, e])
    }
  }
  return wins.sort((a, b) => a[0] - b[0])
}

const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

// start → end 之间的有效工作毫秒（逐日累计，演示数据量下足够）
export const workElapsedMs = (start, end, calCtx) => {
  if (end <= start) return 0
  let total = 0
  for (let day = midnight(start); day < end; day = new Date(day.getTime() + DAY_MS)) {
    const base = day.getTime()
    for (const [s, e] of dayWindows(calCtx, day)) {
      const segStart = Math.max(base + s, start.getTime())
      const segEnd = Math.min(base + e, end.getTime())
      if (segEnd > segStart) total += segEnd - segStart
    }
  }
  return total
}

// 从 start 起累计 durationMs 有效工作时间后的时刻（即截止时间）
export const addWorkMs = (start, durationMs, calCtx) => {
  let remain = durationMs
  for (let day = midnight(start); ; day = new Date(day.getTime() + DAY_MS)) {
    const base = day.getTime()
    for (const [s, e] of dayWindows(calCtx, day)) {
      const segStart = Math.max(base + s, start.getTime())
      const segEnd = base + e
      if (segEnd <= segStart) continue
      const avail = segEnd - segStart
      if (remain <= avail) return new Date(segStart + remain)
      remain -= avail
    }
  }
}

// 目标时限 → 毫秒。target_unit: minute / work_hour / work_day / natural_day
export const targetToMs = (value, unit, calCtx) => {
  const v = Number(value)
  if (unit === 'minute') return v * 60 * 1000
  if (unit === 'natural_day') return v * DAY_MS
  if (unit === 'work_hour') return v * 60 * 60 * 1000
  // work_day = 一个工作日的有效工作毫秒
  return v * dayWindows(calCtx, new Date(2000, 0, 3)).reduce((s, [a, b]) => s + b - a, 0) // 2000-01-03 周一
}

export const isWorkUnit = (unit) => unit === 'work_hour' || unit === 'work_day'
