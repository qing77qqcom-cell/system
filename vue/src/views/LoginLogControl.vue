<script setup>
defineOptions({ name: 'LoginLog' })
/**
 * 登录日志管理页
 * 技术：el-table-v2（Element Plus 原生虚拟滚动）+ 后端分页无限加载
 *
 * 核心原理（对应你图片里的 5 个知识点）：
 *   1. 虚拟滚动     —— el-table-v2 内部 virtual-list 只渲染视口可见的 ~20 行，+ cache×2 缓冲行
 *   2. 滚动计算     —— @scroll 事件给 scrollTop，自己算 scrollTop+viewport >= totalContent - threshold 就是触底
 *   3. 占位元素     —— 内部 totalRows * rowHeight 维持滚动条总高度，新增数据后自动重算
 *   4. 性能优化     —— :cache 缓冲区大小、:perf-mode 高性能开关、:use-is-scrolling 滚动中加 class 做 CSS 降级
 *   5. 动态行高     —— 登录日志行高固定 50px，不用 estimatedRowHeight；如果以后加"展开失败原因"再开
 *
 * 后端接口：GET /api/logs/login-logs?page=&pageSize=&username=&success=&dateFrom=&dateTo
 * 返回结构：{ total, list, page, pageSize, totalPages }
 */
import { ref, reactive, computed, onMounted, nextTick, h } from 'vue'
import { ElMessage } from 'element-plus'
import request from '@/utils/request.js'

// ———————— 筛选表单 ————————
const filter = reactive({
  username: '',
  success: '',
  dateFrom: '',
  dateTo: '',
})

// ———————— 分页 & 数据状态 ————————
const PAGE_SIZE = 50
const page = ref(0)        // 已加载到第几页（0 = 还没拉过）
const total = ref(0)       // 后端总条数
const rows = ref([])       // 当前已加载的所有行（不断 append）
const loading = ref(false) // 正在请求下一页
const noMore = ref(false)  // 已加载完所有数据
const viewportHeight = ref(500) // 表格可视区高度（触底判断用）
const exporting = ref(false)    // 正在导出 CSV

// ———————— 触底判断前置条件 ————————
const canLoadMore = computed(() => !noMore.value && rows.value.length < total.value)

// ———————— el-table-v2 columns 定义 ————————
// 每个 column 是普通对象，不是 el-table-column 子组件
// 核心字段：key(唯一标识) / title(表头) / dataKey(从行数据里取哪个字段) / width(像素)
// 可选：cellRenderer(({ rowData, rowIndex, column }) => VNode) 自定义单元格渲染
const columns = [
  { key: 'id',        title: 'ID',          dataKey: 'id',        width: 70 },
  { key: 'userName',  title: '用户',        dataKey: 'userName',  width: 100,
    cellRenderer: ({ rowData }) => h('span', rowData.userName || '—') },
  { key: 'username',  title: '登录账号',    dataKey: 'username',  width: 130 },
  { key: 'success',   title: '结果',        dataKey: 'success',   width: 90,
    // 自定义 cellRenderer：用 h() 渲染彩色标签（成功绿 / 失败红）
    cellRenderer: ({ rowData }) => {
      const ok = rowData.success
      return h('span', {
        style: {
          display: 'inline-block', padding: '1px 8px', borderRadius: '4px',
          fontSize: '12px',
          background: ok ? '#f0f9eb' : '#fef0f0',
          color: ok ? '#67c23a' : '#f56c6c',
          border: `1px solid ${ok ? '#e1f3d8' : '#fde2e2'}`,
        },
      }, ok ? '成功' : '失败')
    },
  },
  { key: 'ip',        title: 'IP 地址',     dataKey: 'ip',        width: 150 },
  { key: 'userAgent', title: 'User Agent',  dataKey: 'userAgent', width: 200, flexGrow: 1 },
  { key: 'createdAt', title: '登录时间',    dataKey: 'createdAt', width: 180 },
]

// ———————— 核心：加载一页 ————————
async function loadNextPage() {
  if (loading.value || noMore.value) return
  loading.value = true
  try {
    const nextPage = page.value + 1
    const params = { page: nextPage, pageSize: PAGE_SIZE }
    if (filter.username) params.username = filter.username.trim()
    if (filter.success !== '') params.success = filter.success
    if (filter.dateFrom) params.dateFrom = filter.dateFrom
    if (filter.dateTo) params.dateTo = filter.dateTo

    const data = await request.get('/logs/login-logs', { params })
    page.value = data.page
    total.value = data.total
    rows.value = [...rows.value, ...data.list]

    if (page.value >= data.totalPages) {
      noMore.value = true
    }
  } catch (e) {
    ElMessage.error('加载失败：' + (e?.message || e))
  } finally {
    loading.value = false
  }
}

// ———————— 筛选变化 → 重置 + 重新拉第一页 ————————
function resetFilter() {
  filter.username = ''
  filter.success = ''
  filter.dateFrom = ''
  filter.dateTo = ''
  reload()
}
function reload() {
  rows.value = []
  page.value = 0
  total.value = 0
  noMore.value = false
  loadNextPage()
}

// ———————— 导出 CSV ————————
async function handleExport() {
  if (exporting.value) return
  exporting.value = true
  try {
    const params = {}
    if (filter.username) params.username = filter.username.trim()
    if (filter.success !== '') params.success = filter.success
    if (filter.dateFrom) params.dateFrom = filter.dateFrom
    if (filter.dateTo) params.dateTo = filter.dateTo

    // axios responseType: 'blob' → request 拦截器识别后跳过 .data 解包，直接返回 Blob
    const blob = await request.get('/logs/login-logs/export', {
      params,
      responseType: 'blob',
    })//拿到文件流

    // 解析后端 Content-Disposition 里的文件名（如果有）
    // request 拦截器里拿不到 response headers（只返回了 response.data），
    // 所以这里用时间戳兜底
    //触发下载
    const defaultName = `login-logs-${new Date().toISOString().slice(0, 10)}.csv`

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = defaultName//文件名
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)//释放内存

    ElMessage.success('导出完成')
  } catch (e) {
    ElMessage.error('导出失败：' + (e?.message || e))
  } finally {
    exporting.value = false
  }
}

// ———————— 虚拟滚动触底检测 ————————
// el-table-v2 没有 scrollbar-end 事件，用 @scroll 事件自己判断
// 内部 virtual-list 给我们的 scrollTop 是"已滚过的像素"
// el-table-v2 总行高 ≈ rows.length × rowHeight（表头 fixed，不算在滚距里）
//
// 触底 = scrollTop + 可视高度 >= 总行高 - 提前量
function onTableScroll({ scrollTop: st }) {
  if (!canLoadMore.value || loading.value) return

  const TUNING_ROW_H = 50   // 和 :row-height prop 保持一致
  const PRELOAD_PX = 100    // 提前量：还剩 100px 就触发下一页

  const totalContentHeight = rows.value.length * TUNING_ROW_H
  const remaining = totalContentHeight - st - viewportHeight.value

  if (remaining < PRELOAD_PX) {
    loadNextPage()
  }
}

// ———————— 挂载：初始化 + 读可视区高度 ————————
onMounted(async () => {
  reload()
  await nextTick()
  // el-auto-resizer 渲染后，从 DOM 里拿实际高度
  const el = document.querySelector('.table-card .el-auto-resizer')
  if (el) viewportHeight.value = el.clientHeight || 500
})
</script>

<template>
  <div class="login-log-page">

    <!-- 筛选区 -->
    <el-card class="filter-card" shadow="never">
      <el-form :inline="true" :model="filter" @submit.prevent>
        <el-form-item label="用户名">
          <el-input v-model="filter.username" placeholder="模糊搜索" clearable style="width: 180px"
            @keyup.enter="reload" />
        </el-form-item>
        <el-form-item label="结果">
          <el-select v-model="filter.success" placeholder="全部" clearable style="width: 120px">
            <el-option label="成功" value="true" />
            <el-option label="失败" value="false" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期范围">
          <el-input v-model="filter.dateFrom" type="date" style="width: 155px" />
          <span style="margin: 0 4px; color: #909399">~</span>
          <el-input v-model="filter.dateTo" type="date" style="width: 155px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="reload">查询</el-button>
          <el-button @click="resetFilter">重置</el-button>
          <el-button
            type="success"
            :loading="exporting"
            @click="handleExport"
          >
            {{ exporting ? '导出中...' : '📥 导出 CSV' }}
          </el-button>
        </el-form-item>

        <!-- 状态提示（右侧） -->
        <el-form-item class="status-bar">
          <span class="status-text">
            已加载 <b>{{ rows.length }}</b> / {{ total || '?' }} 条
            <span v-if="page > 0 && total > 0" class="muted">
              （第 {{ page }} 页{{ noMore ? ' · 到底了' : '' }}）
            </span>
          </span>
          <el-button
            v-if="canLoadMore"
            size="small" link
            :loading="loading"
            @click="loadNextPage"
          >加载更多 ↓</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 虚拟表格区 -->
    <!--
      el-auto-resizer 监听父容器尺寸变化，把 width / height 传给 table-v2 的 slot props
      el-table-v2 用这些尺寸计算：可视范围 = [scrollTop/rowHeight, (scrollTop+height)/rowHeight]

      可调参数：
        :row-height          — 固定行高（登录日志 50px 最优，和 CSS 保持一致）
        :header-height       — 表头高度（默认 50，表头越矮可视行数越多）
        :cache               — 视口外预渲染行数（默认 2，改大可减少白屏但增加 DOM）
        :perf-mode           — 高性能开关（默认 true，关掉后更丝滑但 CPU 更高）
        :use-is-scrolling    — 滚动时给行加 is-scrolling class，可做 CSS 降级

      事件：
        @scroll          — { scrollTop, scrollLeft, x, y } 滚动位置
        @rows-rendered   — { startIndex, endIndex, visibleStartIndex, visibleEndIndex } 本轮渲染的行范围
    -->
    <el-card class="table-card" shadow="never">
      <el-auto-resizer>
        <template #default="{ width, height }">
          <el-table-v2
            :columns="columns"
            :data="rows"
            :width="width"
            :height="height"
            :row-height="50"
            :header-height="40"
            :cache="2"
            :perf-mode="true"
            :use-is-scrolling="false"
            row-key="id"
            @scroll="onTableScroll"
          />
        </template>
      </el-auto-resizer>

      <el-empty v-if="!loading && rows.length === 0" description="暂无登录日志" />
    </el-card>

    <!-- 底部提示 -->
    <div class="bottom-hint" v-if="canLoadMore && rows.length > 0">
      <el-button link :loading="loading" @click="loadNextPage">
        {{ loading ? '加载中...' : `还有 ${total - rows.length} 条，滚到底或点我继续加载` }}
      </el-button>
    </div>
    <div class="bottom-hint done" v-else-if="rows.length > 0 && noMore">
      — 已加载全部 {{ total }} 条 —
    </div>
  </div>
</template>

<style scoped>
.login-log-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 580px;
}

.filter-card {
  border-radius: 8px;
  flex-shrink: 0;
}

.status-bar {
  margin-left: auto !important;
}
.status-text {
  font-size: 13px;
  color: #606266;
}
.status-text .muted {
  color: #909399;
  margin-left: 4px;
}

.table-card {
  border-radius: 8px;
  flex: 1;
  min-height: 0;   /* 关键：让 el-auto-resizer 能正确拿到父容器高度 */
  padding: 0 !important;
}
.table-card :deep(.el-card__body) {
  height: 100%;
  padding: 0;
  position: relative;
}

/* 关键：el-auto-resizer 必须有高度才能算出传给 table-v2 的 height slot prop */
.table-card :deep(.el-auto-resizer) {
  height: 100%;
  position: absolute;
  inset: 0;
}

.bottom-hint {
  text-align: center;
  padding: 8px 0;
  color: #909399;
  font-size: 13px;
}
.bottom-hint.done {
  color: #b0b3b8;
}
</style>
