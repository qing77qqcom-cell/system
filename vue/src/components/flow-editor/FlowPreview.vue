<script setup>
/**
 * 流程预览模拟弹窗
 *
 * 逻辑：
 *   1. 按 edges 拓扑排序
 *   2. 从 Start 开始，沿着 edges 每步高亮一个节点（动画 800ms）
 *   3. 遇到 ExclusiveGateway → 暂停，显示内置的分支选择器让用户选
 *   4. 到 End → 结束
 *
 * 入参 graphData 结构同 LogicFlow exportGraphData()
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Close } from '@element-plus/icons-vue'
import { BPMN_NODE_TYPES } from '@/composables/useLogicFlow'

const props = defineProps({
  /** LogicFlow 导出的 graphData: { nodes, edges } */
  graphData: { type: Object, required: true },
})

const emit = defineEmits(['close'])

// 当前正在执行的节点 id（高亮用）
const currentNodeId = ref(null)
// 已走过的节点 id 集合（历史高亮用）
const visitedNodeIds = ref(new Set())
// 执行日志（右侧显示每一步发生了什么）
const logs = ref([])
// 是否正在执行
const running = ref(false)

// Gateway 分支选择器状态
const gatewayChoice = ref(null)   // { condition, choices: [{target, label}], }
let resolveGateway = null          // Promise resolver

// ===== 预计算：拓扑图 =====
const graph = computed(() => {
  const { nodes = [], edges = [] } = props.graphData
  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]))
  const adjacency = {}
  const indegree = {}
  for (const n of nodes) { adjacency[n.id] = []; indegree[n.id] = 0 }
  for (const e of edges) {
    if (adjacency[e.sourceNodeId]) {
      adjacency[e.sourceNodeId].push({ target: e.targetNodeId, edge: e })
      indegree[e.targetNodeId] = (indegree[e.targetNodeId] || 0) + 1
    }
  }
  return { nodeMap, adjacency }
})

// 找 Start 节点
const startNodeId = computed(() => {
  const start = props.graphData?.nodes?.find((n) =>
    String(n.type).toLowerCase() === BPMN_NODE_TYPES.START.toLowerCase()
  )
  return start?.id || null
})

// ===== 动画执行 =====
function delay(ms) { return new Promise((r) => setTimeout(r, ms)) }

/**
 * 条件分支处理：弹出内置选择器，等用户选了再 resolve
 * 不用 ElMessageBox.prompt — 内嵌 select 不生效
 */
function pickGatewayBranch(gatewayNodeId) {
  const neighbors = graph.value.adjacency[gatewayNodeId] || []
  if (neighbors.length <= 1) return Promise.resolve(neighbors[0]?.target)

  const node = graph.value.nodeMap[gatewayNodeId]
  const gateLabel = node?.properties?.condition || node?.text || '条件分支'
  const gatewayId = node?.properties?.nodeName || node?.id?.substring?.(0, 20) || '条件节点'

  // 构建选项：优先用边的 text（用户可能在 LogicFlow 里标了 true/false），否则按顺序标 分支1/分支2
  const choices = neighbors.map((n, i) => {
    const edgeLabel = n.edge?.text?.value || n.edge?.text || ''
    const targetNode = graph.value.nodeMap[n.target]
    const targetLabel = targetNode?.properties?.nodeName || targetNode?.text || targetNode?.id?.substring?.(0, 20) || `节点${i + 1}`
    return {
      target: n.target,
      label: edgeLabel || `分支 ${i + 1}`,
      targetLabel,
    }
  })

  gatewayChoice.value = { gatewayId, gateLabel, choices }

  return new Promise((resolve) => {
    resolveGateway = resolve
  })
}

function selectBranch(target) {
  if (resolveGateway) {
    resolveGateway(target)
    resolveGateway = null
  }
  gatewayChoice.value = null
}

async function run() {
  if (!startNodeId.value) {
    pushLog('error', '没有找到 Start 节点')
    return
  }

  running.value = true
  visitedNodeIds.value = new Set()
  logs.value = []
  currentNodeId.value = null

  let cur = startNodeId.value
  pushLog('start', '▶ 流程开始')

  const maxSteps = 50
  let step = 0

  while (cur && step < maxSteps) {
    step++
    const node = graph.value.nodeMap[cur]
    if (!node) break

    const nodeType = String(node.type).toLowerCase()

    // 高亮当前节点
    currentNodeId.value = cur
    visitedNodeIds.value.add(cur)

    // End 节点 → 结束
    if (nodeType === BPMN_NODE_TYPES.END.toLowerCase()) {
      pushLog('end', '◼ 流程结束')
      break
    }

    // 等一下让用户看清
    await delay(600)

    // 处理不同类型的节点
    if (nodeType === BPMN_NODE_TYPES.START.toLowerCase()) {
      pushLog('info', 'Start 节点 → 继续')
    } else if (nodeType === BPMN_NODE_TYPES.USER_TASK.toLowerCase()) {
      const strategyLabel = node.properties?.approverStrategy || '-'
      const nodeLabel = node.properties?.nodeName || node.text || '审批节点'
      pushLog('task', `☑ 审批「${nodeLabel}」策略=${strategyLabel}`)
    } else if (nodeType === BPMN_NODE_TYPES.EXCLUSIVE_GATEWAY.toLowerCase()) {
      pushLog('gateway', `◇ 条件分支「${node.properties?.condition || node.text || '-'}」`)
      // 让用户选分支（内置选择器）
      const next = await pickGatewayBranch(cur)
      if (!next) {
        pushLog('error', 'Gateway 没有可用出口')
        break
      }
      cur = next
      await delay(200)
      continue
    }

    // 找下一个（非 Gateway 节点默认走第一个出口）
    const next = graph.value.adjacency[cur]?.[0]?.target
    cur = next
  }

  running.value = false
  currentNodeId.value = null
}

function pushLog(type, message) {
  logs.value.push({ type, message, time: new Date().toLocaleTimeString() })
}

onMounted(() => {
  run().catch((e) => console.error('[FlowPreview] run error:', e))
})

onBeforeUnmount(() => {
  // 防止组件销毁时 Promise 还没 resolve
  if (resolveGateway) {
    resolveGateway(null)
    resolveGateway = null
  }
})
</script>

<template>
  <div class="flow-preview-mask" @click.self="emit('close')">
    <div class="preview-modal">
      <div class="preview-header">
        <h3>流程预览模拟</h3>
        <el-icon :size="20" class="close-btn" @click="emit('close')">
          <Close />
        </el-icon>
      </div>

      <div class="preview-body">
        <!-- 左侧：图形化节点列表（模拟画布拓扑） -->
        <div class="preview-graph">
          <div class="graph-title">执行路径</div>
          <div class="node-list">
            <div
              v-for="n in graphData.nodes"
              :key="n.id"
              class="node-item"
              :class="{
                visited: visitedNodeIds.has(n.id),
                current: currentNodeId === n.id,
              }"
            >
              <span class="node-dot" :class="`dot-${n.type.split(':')[1]}`" />
              <span class="node-label">
                {{ n.properties?.nodeName || n.text || n.type.split(':')[1] || '节点' }}
              </span>
              <span class="node-sub">{{ n.type.split(':')[1] }}</span>
            </div>
          </div>

          <!-- 条件分支选择器（Gateway 暂停时出现） -->
          <div v-if="gatewayChoice" class="gateway-picker">
            <div class="gateway-title">
              <span class="gateway-icon">◇</span>
              条件分支：{{ gatewayChoice.gatewayId }}
            </div>
            <div class="gateway-condition" v-if="gatewayChoice.gateLabel !== '条件分支'">
              条件：<code>{{ gatewayChoice.gateLabel }}</code>
            </div>
            <div class="gateway-choices">
              <button
                v-for="(c, i) in gatewayChoice.choices"
                :key="c.target"
                class="gateway-btn"
                @click="selectBranch(c.target)"
              >
                <span class="btn-label">{{ c.label }}</span>
                <span class="btn-arrow">→ {{ c.targetLabel }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 右侧：执行日志 -->
        <div class="preview-log">
          <div class="log-title">执行日志</div>
          <div class="log-list">
            <div
              v-for="(l, i) in logs"
              :key="i"
              class="log-item"
              :class="`log-${l.type}`"
            >
              <span class="log-time">{{ l.time }}</span>
              <span class="log-msg">{{ l.message }}</span>
            </div>
            <div v-if="logs.length === 0 && !running" class="log-empty">准备开始…</div>
            <div v-if="running" class="log-running">● 正在执行…</div>
          </div>
        </div>
      </div>

      <div class="preview-footer">
        <el-button @click="emit('close')">关闭</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.flow-preview-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
}

.preview-modal {
  background: #fff;
  border-radius: 12px;
  width: 780px;
  max-width: 92vw;
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e6eef7;
}
.preview-header h3 { margin: 0; font-size: 15px; color: #14487e; }
.close-btn { cursor: pointer; color: #94a3b8; }
.close-btn:hover { color: #475569; }

.preview-body {
  flex: 1;
  display: flex;
  gap: 0;
  min-height: 0;
}

.preview-graph {
  flex: 1;
  padding: 16px 20px;
  border-right: 1px solid #e6eef7;
  overflow-y: auto;
  background: #fafbfc;
  display: flex;
  flex-direction: column;
}
.graph-title {
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.node-list { display: flex; flex-direction: column; gap: 6px; }
.node-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  background: #fff;
  border: 1px solid #e6eef7;
  opacity: 0.45;
  transition: all 0.25s;
}
.node-item.visited { opacity: 0.75; background: #eff6ff; }
.node-item.current {
  opacity: 1;
  background: #dbeafe;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15); }
  50% { box-shadow: 0 0 0 6px rgba(59, 130, 246, 0.25); }
}

.node-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; background: #cbd5e1; }
.dot-StartEvent { background: #22c55e; border-radius: 50%; }
.dot-EndEvent { background: #ef4444; border-radius: 50%; }
.dot-UserTask { background: #3b82f6; border-radius: 2px; }
.dot-ExclusiveGateway { background: #f59e0b; border-radius: 0; transform: rotate(45deg); width: 10px; height: 10px; }

.node-label { font-size: 13px; color: #1e293b; flex: 1; }
.node-sub { font-size: 10px; color: #94a3b8; text-transform: uppercase; }

/* === Gateway 选择器 === */
.gateway-picker {
  margin-top: 16px;
  padding: 14px;
  background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
  border: 1px solid #fbbf24;
  border-radius: 8px;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

.gateway-title {
  font-size: 13px;
  font-weight: 600;
  color: #92400e;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.gateway-icon { color: #f59e0b; font-size: 16px; }

.gateway-condition {
  font-size: 11px;
  color: #78350f;
  margin-bottom: 10px;
}
.gateway-condition code {
  background: #fef3c7;
  padding: 1px 6px;
  border-radius: 4px;
  font-family: monospace;
}

.gateway-choices {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gateway-btn {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: #fff;
  border: 1px solid #fbbf24;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #1e293b;
  transition: all 0.2s;
}
.gateway-btn:hover {
  background: #fef3c7;
  border-color: #f59e0b;
  transform: translateX(2px);
}
.btn-label { font-weight: 500; color: #92400e; }
.btn-arrow { font-size: 11px; color: #78350f; }

.preview-log {
  flex: 1;
  padding: 16px 20px;
  overflow-y: auto;
}
.log-title {
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.log-list { display: flex; flex-direction: column; gap: 6px; }

.log-item {
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 4px;
  background: #f8fafc;
  display: flex;
  gap: 8px;
  align-items: baseline;
}
.log-item.log-start { background: #dcfce7; color: #166534; }
.log-item.log-end { background: #fee2e2; color: #991b1b; }
.log-item.log-task { background: #dbeafe; color: #1e40af; }
.log-item.log-gateway { background: #fef3c7; color: #92400e; }
.log-item.log-error { background: #fee2e2; color: #991b1b; }
.log-item.log-info { color: #64748b; }

.log-time { font-size: 10px; color: #94a3b8; font-family: monospace; }
.log-msg { flex: 1; }
.log-empty { color: #94a3b8; font-size: 12px; text-align: center; padding: 20px; }
.log-running { color: #3b82f6; font-size: 12px; }

.preview-footer {
  padding: 12px 20px;
  border-top: 1px solid #e6eef7;
  display: flex;
  justify-content: flex-end;
}
</style>
