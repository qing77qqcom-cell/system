<script setup>
/**
 * 审批流程配置入口页（P2 完成版）
 *
 * 布局：
 *   顶部工具栏（ticket_type 下拉 + 载入/清空/预览/下载/保存/运行预览）
 *   三栏：NodePalette | FlowCanvas | PropertyPanel
 *
 * 数据流：
 *   画布 ←convertFromBackendFlow→ 后端 GET/PUT approval_flow_nodes
 *   FlowCanvas ←emit('node-select')→ PropertyPanel ←emit('update')→ canvasApi.updateNodeProperties
 *
 * P2 新增：
 *   - saveToBackend → PUT /api/approval-flows/bulk（事务：先删后插）
 *   - runPreview → 流程预览模拟（按 edges 拓扑跑一遍，动画高亮）
 */
import { ref, watch, h } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { RefreshLeft, Document, Download, Refresh, Check, VideoPlay } from '@element-plus/icons-vue'
import NodePalette from '@/components/flow-editor/NodePalette.vue'
import FlowCanvas from '@/components/flow-editor/FlowCanvas.vue'
import PropertyPanel from '@/components/flow-editor/PropertyPanel.vue'
import FlowPreview from '@/components/flow-editor/FlowPreview.vue'
import { TICKET_TYPES, convertToBackendFlow, convertFromBackendFlow } from '@/composables/convertFlow'

// ===== 状态 =====
const canvasApi = ref(null)
const selectedNode = ref(null)
const ticketType = ref('fault_repair')
const loadingBackend = ref(false)
const showPreview = ref(false)   // 流程预览弹窗
const previewGraph = ref(null)   // 预览用的 graphData（从画布导出）

// ===== API 调用 =====
async function loadFromBackend() {
  if (!canvasApi.value) return
  loadingBackend.value = true
  try {
    const { default: request } = await import('@/utils/request')
    const data = await request.get('/approval-flows', { params: { ticket_type: ticketType.value } })
    const rows = Array.isArray(data) ? data : (data?.list || data?.data || [])
    const graph = convertFromBackendFlow(rows, ticketType.value)
    canvasApi.value.importGraphData(graph)
    ElMessage.success(`已载入 ${rows.length} 个审批节点`)
  } catch (err) {
    console.warn('[loadFromBackend] 后端未就绪:', err?.message)
    // 空画布（只有 Start/End）
    canvasApi.value.importGraphData(convertFromBackendFlow([], ticketType.value))
  } finally {
    loadingBackend.value = false
  }
}

async function saveToBackend() {
  if (!canvasApi.value) return
  const graphData = canvasApi.value.exportGraphData()
  const backendList = convertToBackendFlow(graphData, ticketType.value)

  if (backendList.length === 0) {
    ElMessage.warning('画布上没有审批节点，无法保存')
    return
  }

  try {
    await ElMessageBox.confirm(
      `将替换「${TICKET_TYPES.find(t => t.value === ticketType.value)?.label}」的全部审批节点（先删后插），共 ${backendList.length} 个。`,
      '确认保存',
      { type: 'warning', confirmButtonText: '确认保存', cancelButtonText: '取消' }
    )
  } catch { return }

  loadingBackend.value = true
  try {
    const { default: request } = await import('@/utils/request')
    const saved = await request.put('/approval-flows/bulk', {
      ticketType: ticketType.value,
      nodes: backendList,
    })
    ElMessage.success(`已保存 ${saved?.length || backendList.length} 个审批节点`)
    // 保存完重新载入（刷新后端 id / active 等字段）
    await loadFromBackend()
  } catch (err) {
    ElMessage.error(err?.message || '保存失败')
  } finally {
    loadingBackend.value = false
  }
}

// ===== 流程预览 =====
function runPreview() {
  if (!canvasApi.value) return
  const graph = canvasApi.value.exportGraphData()
  if (!graph.nodes?.length) {
    ElMessage.warning('画布为空，无法预览')
    return
  }
  previewGraph.value = graph
  showPreview.value = true
}

// ===== 画布事件 =====
function onCanvasReady(api) {
  canvasApi.value = api
  ElMessage.success('画布已就绪 🎨')
  loadFromBackend()
}

function onNodeSelect(node) {
  selectedNode.value = node
}

function onNodeUpdate({ id, properties }) {
  canvasApi.value?.updateNodeProperties(id, properties)
  // 同步本地 selectedNode（PropertyPanel 双向绑定用）
  if (selectedNode.value && selectedNode.value.id === id) {
    selectedNode.value = { ...selectedNode.value, properties }
  }
}

// ===== 工具栏 =====
function handleReset() {
  if (!canvasApi.value) return
  canvasApi.value.clearGraph()
  ElMessage.info('已清空画布')
}

function handleExport() {
  if (!canvasApi.value) return
  const data = canvasApi.value.exportGraphData()
  const json = JSON.stringify(data, null, 2)
  ElMessageBox.alert(
    `<pre style="max-height:360px;overflow:auto;font-size:12px;">${json}</pre>`,
    '画布数据 JSON',
    { dangerouslyUseHTMLString: true, confirmButtonText: '复制', callback: () => navigator.clipboard?.writeText(json).then(() => ElMessage.success('已复制')) }
  )
}

function handleDownload() {
  if (!canvasApi.value) return
  const data = canvasApi.value.exportGraphData()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `approval-flow-${ticketType.value}-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('已下载')
}

// ticket_type 切换 → 重新载入
watch(ticketType, () => canvasApi.value && loadFromBackend())
</script>

<template>
  <div class="flow-editor">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <h3 class="page-title">审批流程配置</h3>
        <el-select v-model="ticketType" size="small" class="ticket-type">
          <el-option
            v-for="t in TICKET_TYPES"
            :key="t.value"
            :label="t.label"
            :value="t.value"
          />
        </el-select>
      </div>
      <div class="toolbar-right">
        <el-button-group>
          <el-button :icon="Refresh" :loading="loadingBackend" @click="loadFromBackend">载入后端</el-button>
          <el-button :icon="RefreshLeft" @click="handleReset">清空</el-button>
          <el-button :icon="Document" @click="handleExport">预览 JSON</el-button>
          <el-button :icon="Download" @click="handleDownload">下载</el-button>
          <el-button :icon="VideoPlay" plain @click="runPreview">运行预览</el-button>
          <el-button type="primary" :icon="Check" :loading="loadingBackend" @click="saveToBackend">保存</el-button>
        </el-button-group>
      </div>
    </div>

    <!-- 主体三栏 -->
    <div class="editor-body">
      <NodePalette />
      <FlowCanvas
        @ready="onCanvasReady"
        @node-select="onNodeSelect"
      />
      <PropertyPanel
        :selected-node="selectedNode"
        @update="onNodeUpdate"
      />
    </div>

    <!-- 流程预览弹窗 -->
    <FlowPreview
      v-if="showPreview && previewGraph"
      :graph-data="previewGraph"
      @close="showPreview = false"
    />
  </div>
</template>

<style scoped>
.flow-editor {
  display: flex;
  flex-direction: column;
  /* 不依赖 height: 100% 链式传递，直接给一个确定的最小高度 */
  min-height: 620px;
  gap: 12px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff;
  border-radius: 8px;
  padding: 12px 16px;
  border: 1px solid #e6eef7;
  flex-wrap: wrap;
  gap: 10px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.page-title {
  font-size: 16px;
  font-weight: 600;
  color: #14487e;
  margin: 0;
}

.ticket-type { min-width: 140px; }

.editor-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
}
</style>
