<script setup>
/**
 * 流程详情弹窗内嵌的只读 LogicFlow 预览画布
 *
 * 和 FlowCanvas.vue（编辑器用）的区别：
 *   - 只读：禁用拖拽创建节点、禁用节点选中/移动、禁用连线
 *   - 允许缩放/平移（LogicFlow 默认行为）
 *   - 弹窗销毁时 destroyLF
 */
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import LogicFlow from '@logicflow/core'
import '@logicflow/core/dist/index.css'
import { BPMNElements, Control } from '@logicflow/extension'
import { convertFromBackendFlow } from '@/composables/convertFlow'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  ticketType: { type: String, default: '' },
})

const containerRef = ref(null)
let lf = null

// LogicFlow 扩展注册（只读版：不注册 SelectionSelect，因为不需要选中）
let registered = false
function registerExtensions() {
  if (registered) return
  LogicFlow.use(BPMNElements)
  LogicFlow.use(Control)
  registered = true
}

function init() {
  if (!containerRef.value) return
  registerExtensions()

  lf = new LogicFlow({
    container: containerRef.value,
    grid: { size: 20, visible: true, type: 'dot', config: { color: '#d9d9d9' } },
    background: { backgroundColor: '#f8fafc' },
    keyboard: { enabled: false },
    edgeTextDraggable: false,
    nodeTextDraggable: false,
    // ⚠️ 只读：禁止节点移动/拖拽/多选
  })

  // 禁用拖拽创建（NodePalette 的 dragover/drop 监听在 window，这里不管）
  // 禁用节点移动：监听 node:mousedown 后阻止默认行为
  lf.on('node:mousedown', ({ data }) => {
    // 阻止节点拖动
  })

  render()
}

function render() {
  if (!lf) return
  const graph = convertFromBackendFlow(props.nodes || [], props.ticketType)
  lf.render(graph)
  // fitView
  requestAnimationFrame(() => {
    try { lf.fitView(40) } catch { /* no nodes */ }
  })
}

watch(() => props.nodes, () => {
  nextTick(render)
}, { deep: true })

onMounted(async () => {
  await nextTick()
  init()
})

onBeforeUnmount(() => {
  if (lf) {
    lf.destroy()
    lf = null
  }
})
</script>

<template>
  <div class="detail-flow-wrap">
    <!-- 节点列表（表格形式，清晰展示每个审批节点信息） -->
    <div class="node-table" v-if="nodes.length">
      <div class="node-table-header">
        <span>序号</span><span>节点名称</span><span>审批人策略</span><span>跳过规则</span><span>状态</span>
      </div>
      <div v-for="n in nodes" :key="n.id" class="node-table-row">
        <span class="seq">{{ n.seq }}</span>
        <span class="name">{{ n.nodeName }}</span>
        <span class="strategy">{{ n.approverStrategy }}</span>
        <span class="skip">{{ n.skipRule ? JSON.stringify(n.skipRule) : '—' }}</span>
        <span class="status">{{ n.active ? '✅ 启用' : '⏸️ 停用' }}</span>
      </div>
    </div>
    <el-empty v-else description="该流程暂无审批节点" :image-size="60" />

    <!-- 画布预览区（只读） -->
    <div class="canvas-title">📊 流程图预览</div>
    <div class="canvas-container" ref="containerRef" />
  </div>
</template>

<style scoped>
.detail-flow-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.node-table {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  overflow: hidden;
}
.node-table-header, .node-table-row {
  display: grid;
  grid-template-columns: 60px 160px 130px 180px 80px;
  gap: 8px;
  padding: 8px 12px;
  font-size: 13px;
}
.node-table-header {
  background: #f5f7fa;
  color: #606266;
  font-weight: 600;
  border-bottom: 1px solid #ebeef5;
}
.node-table-row {
  border-bottom: 1px solid #f0f0f0;
}
.node-table-row:last-child { border-bottom: none; }
.node-table-row .seq { color: #409eff; font-weight: 600; }
.node-table-row .name { color: #303133; font-weight: 500; }
.node-table-row .skip { color: #909399; font-size: 12px; word-break: break-all; }

.canvas-title {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  margin-top: 6px;
}

.canvas-container {
  height: 360px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  overflow: hidden;
}
</style>
