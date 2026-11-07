<script setup>
/**
 * 流程列表页（/systemcontrol/approval-flow?tab=list）
 *
 * 数据流：
 *   GET /api/approval-flows —— 所有 approval_flow_nodes 扁平节点数组
 *   GET /api/dictionaries?dict_type=ticket_type —— 工单类型中文标签 + sort
 *   前端 groupBy ticketType → 拼出图片里的流程列表结构
 *
 * 行操作：
 *   详情 —— 内嵌只读 LogicFlow 预览弹窗
 *   编辑 —— router.push('/systemcontrol/approval-flow?tab=editor&ticketType=xxx')
 *   启/停用 —— PUT /api/approval-flows/:id（改 active，整组批量时 bulk PUT）
 *   删除 —— PUT /api/approval-flows/bulk（nodes=[]）
 *
 * 后端零改动！全走已有 API。
 */
import { ref, onMounted, h } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '@/utils/request.js'
import { TICKET_TYPES, APPROVER_STRATEGIES } from '@/composables/convertFlow'

// ===== 状态 =====
const router = useRouter()
const loading = ref(false)
const rows = ref([])       // 拼好的流程列表
const dicts = ref([])      // ticket_type 字典

// ===== 加载 =====
async function loadList() {
  loading.value = true
  try {
    const [nodes, d] = await Promise.all([
      request.get('/approval-flows'),
      request.get('/dictionaries', { params: { dict_type: 'ticket_type' } }),
    ])
    dicts.value = d || []
    const nodeArr = Array.isArray(nodes) ? nodes : []

    // 1. groupBy ticketType
    const groupMap = new Map()
    for (const n of nodeArr) {
      if (!groupMap.has(n.ticketType)) groupMap.set(n.ticketType, [])
      groupMap.get(n.ticketType).push(n)
    }

    // 2. 按字典 sort 顺序拼
    rows.value = dicts.value.map((dict) => {
      const ns = groupMap.get(dict.code) || []
      const activeNodes = ns.filter((n) => n.active)
      // 流程级启停：所有节点 active 才算启用；或者有任何节点 active 算启用（折中：active 节点数 > 0）
      const flowActive = activeNodes.length > 0
      return {
        ticketType: dict.code,
        flowName: dict.label,
        flowCode: dict.code.toUpperCase(),
        levelCount: activeNodes.length,
        totalNodes: ns.length,
        activeNodes,
        allNodes: ns,
        flowActive,
        updatedAt: ns.reduce((acc, n) => {
          const t = n.updatedAt || 0
          return t > acc ? t : acc
        }, 0),
      }
    })
    // 字典里没定义但后端返回了的 ticket_type（兜底）
    for (const [tt, ns] of groupMap) {
      if (!dicts.value.some((d) => d.code === tt)) {
        rows.value.push({
          ticketType: tt,
          flowName: TICKET_TYPES.find((t) => t.value === tt)?.label || tt,
          flowCode: tt.toUpperCase(),
          levelCount: ns.filter((n) => n.active).length,
          totalNodes: ns.length,
          activeNodes: ns.filter((n) => n.active),
          allNodes: ns,
          flowActive: ns.some((n) => n.active),
        })
      }
    }
  } catch (e) {
    ElMessage.error('加载流程列表失败：' + (e?.message || e))
  } finally {
    loading.value = false
  }
}

// ===== 行操作 =====
function goEditor(row) {
  router.push({ path: '/systemcontrol/approval-flow', query: { tab: 'editor', ticketType: row.ticketType } })
}

// 流程级启停 = bulk PUT 把所有节点 active 改 true/false
async function toggleFlowActive(row, wantActive) {
  try {
    await ElMessageBox.confirm(
      `将「${row.flowName}」${wantActive ? '启用' : '停用'}？${wantActive ? '已停用的审批节点会被重新启用' : '所有审批节点将被停用'}`,
      '确认',
      { type: 'warning', confirmButtonText: '确认' },
    )
  } catch { return }

  try {
    const nodes = row.allNodes.map((n) => ({
      nodeName: n.nodeName,
      approverStrategy: n.approverStrategy,
      skipRule: n.skipRule,
      active: wantActive,
    }))
    await request.put('/approval-flows/bulk', { ticketType: row.ticketType, nodes })
    ElMessage.success(`已${wantActive ? '启用' : '停用'}「${row.flowName}」`)
    await loadList()
  } catch (e) {
    ElMessage.error('操作失败：' + (e?.message || e))
  }
}

async function deleteFlow(row) {
  try {
    await ElMessageBox.confirm(
      `确定删除「${row.flowName}」的全部审批节点？此操作不可恢复。`,
      '危险操作',
      { type: 'error', confirmButtonText: '确认删除', confirmButtonClass: 'el-button--danger' },
    )
  } catch { return }

  try {
    await request.put('/approval-flows/bulk', { ticketType: row.ticketType, nodes: [] })
    ElMessage.success('已删除')
    await loadList()
  } catch (e) {
    ElMessage.error('删除失败：' + (e?.message || e))
  }
}

// ===== 详情弹窗（内嵌 LogicFlow 只读画布）=====
import DetailFlowPreview from './DetailFlowPreview.vue'

const detailRow = ref(null)
const showDetail = ref(false)
function openDetail(row) {
  detailRow.value = row
  showDetail.value = true
}

// ===== 工具 =====
function strategyLabel(v) {
  return APPROVER_STRATEGIES.find((s) => s.value === v)?.label || v
}

onMounted(loadList)
</script>

<template>
  <div class="flow-list-page">
    <!-- 顶部工具栏 -->
    <el-card class="header-card" shadow="never">
      <div class="header">
        <div class="header-left">
          <h3>审批流程管理</h3>
          <span class="subtitle">共 {{ rows.length }} 条流程</span>
        </div>
        <div class="header-right">
          <el-button :loading="loading" @click="loadList">🔄 刷新</el-button>
          <el-button type="primary" @click="router.push({ path: '/systemcontrol/approval-flow', query: { tab: 'editor' } })">
            ➕ 新建流程
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 流程表格 -->
    <el-card shadow="never" class="table-card">
      <el-table :data="rows" v-loading="loading" stripe style="width: 100%" row-key="ticketType">
        <!-- 流程名称（可点击看详情） -->
        <el-table-column label="流程名称" width="220">
          <template #default="{ row }">
            <div class="flow-name" @click="openDetail(row)">
              <el-icon><Document /></el-icon>
              <span>{{ row.flowName }}</span>
            </div>
          </template>
        </el-table-column>

        <!-- 流程编码 -->
        <el-table-column prop="flowCode" label="流程编码" width="160">
          <template #default="{ row }">
            <el-tag size="small" type="info" effect="plain">{{ row.flowCode }}</el-tag>
          </template>
        </el-table-column>

        <!-- 审批节点数 -->
        <el-table-column label="审批层级" width="200">
          <template #default="{ row }">
            <div class="level-info">
              <span class="level-count">{{ row.levelCount }}</span>
              <span class="level-label">级审批</span>
              <el-tag v-if="row.levelCount === 0" size="small" type="warning" style="margin-left:6px">无</el-tag>
            </div>
            <!-- 节点名预览 -->
            <div class="node-preview">
              <el-tag
                v-for="n in row.activeNodes.slice(0, 4)"
                :key="n.id"
                size="small"
                type="primary"
                effect="plain"
                style="margin-right:4px;margin-bottom:2px"
              >{{ n.seq }}. {{ n.nodeName }}</el-tag>
              <el-tag v-if="row.activeNodes.length > 4" size="small" effect="plain">+{{ row.activeNodes.length - 4 }}</el-tag>
            </div>
          </template>
        </el-table-column>

        <!-- 审批人策略 -->
        <el-table-column label="审批人" width="220">
          <template #default="{ row }">
            <div v-if="row.activeNodes.length" class="strategy-list">
              <span v-for="(n, i) in row.activeNodes" :key="n.id" class="strategy-item">
                {{ i > 0 ? ' → ' : '' }}{{ strategyLabel(n.approverStrategy) }}
              </span>
            </div>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>

        <!-- 状态 -->
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.flowActive ? 'success' : 'info'" effect="dark">
              {{ row.flowActive ? '🟢 启用中' : '⚪ 已停用' }}
            </el-tag>
          </template>
        </el-table-column>

        <!-- 操作 -->
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link @click="openDetail(row)">📋 详情</el-button>
            <el-button size="small" link type="primary" @click="goEditor(row)">✏️ 编辑</el-button>
            <el-button
              size="small"
              link
              :type="row.flowActive ? 'warning' : 'success'"
              @click="toggleFlowActive(row, !row.flowActive)"
            >{{ row.flowActive ? '⏸️ 停用' : '▶️ 启用' }}</el-button>
            <el-button size="small" link type="danger" @click="deleteFlow(row)">🗑️ 删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!loading && rows.length === 0" description="暂无审批流程" />
    </el-card>

    <!-- 详情弹窗 -->
    <el-dialog v-model="showDetail" :title="detailRow?.flowName" width="780px" top="5vh" destroy-on-close>
      <DetailFlowPreview v-if="detailRow" :nodes="detailRow.activeNodes" />
    </el-dialog>
  </div>
</template>

<script>
import { Document } from '@element-plus/icons-vue'
export default { components: { Document } }
</script>

<style scoped>
.flow-list-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.header-card { border-radius: 8px; }
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.header h3 { margin: 0; font-size: 16px; color: #14487e; }
.header .subtitle { margin-left: 10px; font-size: 13px; color: #909399; }

.flow-name {
  display: flex; align-items: center; gap: 6px;
  cursor: pointer; color: #14487e; font-weight: 500;
  transition: color .2s;
}
.flow-name:hover { color: #409eff; text-decoration: underline; }

.level-info { margin-bottom: 4px; }
.level-count { font-size: 20px; font-weight: 700; color: #14487e; }
.level-label { margin-left: 4px; color: #606266; font-size: 13px; }
.node-preview { display: flex; flex-wrap: wrap; gap: 0; }

.strategy-list { font-size: 13px; color: #303133; }
.strategy-item { white-space: nowrap; }

.muted { color: #909399; }

.table-card { border-radius: 8px; }
</style>
