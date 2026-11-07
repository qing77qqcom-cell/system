<script setup>
/**
 * LogicFlow 画布容器
 *
 * DnD 策略（关键！）：
 *   LogicFlow 在 container 内部创建自己的 SVG 画布层，会拦截容器 div 上的 dragover/drop。
 *   所以我们在 window 上注册 dragover/drop，然后用 getBoundingClientRect 判断是否在画布区域内。
 */
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useLogicFlow } from '@/composables/useLogicFlow'

const emit = defineEmits(['ready', 'node-select'])

const containerRef = ref(null)

const {
  ready,
  lf,
  initLF,
  destroyLF,
  exportGraphData,
  importGraphData,
  addNode,
  fitView,
  clearGraph,
  updateNodeProperties,
} = useLogicFlow()

// ===== 1. 挂载 LogicFlow =====
onMounted(() => {
  const container = containerRef.value
  if (!container) return
  const rect = container.getBoundingClientRect()
  console.log('[FlowCanvas] container:', Math.round(rect.width), 'x', Math.round(rect.height))
  initLF(container)
})

onBeforeUnmount(() => {
  destroyLF()
  window.removeEventListener('dragover', onWinDragOver)
  window.removeEventListener('drop', onWinDrop)
  window.removeEventListener('resize', fitView)
})

// ===== 2. LogicFlow 就绪后注册事件（只注册一次）=====
let listenersRegistered = false
function registerSelectionListeners() {
  if (!lf.value || listenersRegistered) return
  listenersRegistered = true
  const lfCore = lf.value

  lfCore.on('node:click', ({ data }) => {
    emit('node-select', data)
  })
  lfCore.on('node:dblclick', ({ data }) => {
    emit('node-select', data)
  })
  lfCore.on('edge:click', () => {
    emit('node-select', null)
  })
  lfCore.on('blank:click', () => {
    emit('node-select', null)
  })
}

// ===== 3. ready → 注册监听 + emit('ready') + DnD =====
// initLF 内部已经 render 种子图 + waitAndFit 确认节点就绪，再触发 fitView/emit
watch(ready, (v) => {
  if (!v) return
  console.log('[FlowCanvas] LogicFlow ready 🎨')
  registerSelectionListeners()
  nextTick(() => {
    fitView()
    emit('ready', api)
    window.addEventListener('dragover', onWinDragOver)
    window.addEventListener('drop', onWinDrop)
    window.addEventListener('resize', fitView)
  })
}, { immediate: true })

// ===== 4. DnD 工具函数 =====
function isInCanvas(clientX, clientY) {
  const rect = containerRef.value?.getBoundingClientRect()
  if (!rect) return false
  return clientX >= rect.left && clientX <= rect.right &&
         clientY >= rect.top && clientY <= rect.bottom
}

function onWinDragOver(e) {
  if (!isInCanvas(e.clientX, e.clientY)) return
  e.preventDefault()
  e.stopPropagation()
  e.dataTransfer.dropEffect = 'copy'
}

function onWinDrop(e) {
  if (!isInCanvas(e.clientX, e.clientY)) return
  e.preventDefault()
  e.stopPropagation()

  const nodeType = e.dataTransfer.getData('application/x-logicflow-node')
  if (!nodeType || !lf.value) return

  // LogicFlow 坐标 = (DOM相对坐标 - pan偏移) / zoom
  const rect = containerRef.value.getBoundingClientRect()
  const domX = e.clientX - rect.left
  const domY = e.clientY - rect.top
  const t = lf.value.graphModel.transformModel
  const scaleX = t?.SCALE_X ?? 1
  const scaleY = t?.SCALE_Y ?? 1
  const translateX = t?.TRANSLATE_X ?? 0
  const translateY = t?.TRANSLATE_Y ?? 0
  const canvasX = (domX - translateX) / scaleX
  const canvasY = (domY - translateY) / scaleY

  addNode(nodeType, canvasX, canvasY)
}

// ===== 5. 暴露给父组件的 API =====
const api = {
  exportGraphData,
  importGraphData,
  addNode,
  fitView,
  clearGraph,
  updateNodeProperties,
  getSelectedNode: () => null,
}
</script>

<template>
  <div class="flow-canvas-wrap">
    <div ref="containerRef" class="flow-canvas" />
  </div>
</template>

<style scoped>
.flow-canvas-wrap {
  flex: 1;
  min-width: 0;
  background: #f8fafc;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* LogicFlow 要求容器必须有明确高度 */
.flow-canvas {
  flex: 1;
  width: 100%;
  min-height: 520px;
}
</style>
