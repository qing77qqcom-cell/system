<script setup>
// LogicFlow 画布容器
//
// DnD 策略（关键！）：
//   LogicFlow 在 container 内部创建自己的 SVG 画布层，会拦截容器 div 上的 dragover/drop。
//   所以我们在 window 上注册 dragover/drop，然后用 getBoundingClientRect 判断是否在画布区域内。
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useLogicFlow } from '@/composables/useLogicFlow'

const emit = defineEmits(['ready', 'node-select'])

const containerRef = ref(null)
const selectedNode = ref(null)

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
// 用 ResizeObserver 等容器真正有尺寸再 init（比 setTimeout 300ms 更可靠）
let resizeObs = null
onMounted(() => {
  const container = containerRef.value
  if (!container) return

  const tryInit = () => {
    const rect = container.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      if (resizeObs) { resizeObs.disconnect(); resizeObs = null }
      console.log('[FlowCanvas] container ready:', Math.round(rect.width), 'x', Math.round(rect.height))
      initLF(container)
    } else {
      console.warn('[FlowCanvas] container still zero size:', Math.round(rect.width), 'x', Math.round(rect.height))
    }
  }

  // 第一次立即试
  tryInit()

  // ResizeObserver 兜底：容器尺寸变化再试
  if (!ready.value) {
    resizeObs = new ResizeObserver(() => {
      if (!ready.value) tryInit()
    })
    resizeObs.observe(container)
    // 最多再试 10 次（约 2s），然后放弃
    let retries = 0
    const interval = setInterval(() => {
      if (ready.value || retries++ > 10) { clearInterval(interval); return }
      tryInit()
    }, 200)
  }
})

onBeforeUnmount(() => {
  destroyLF()
  resizeObs?.disconnect()
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
    selectedNode.value = data
    emit('node-select', data)
  })
  lfCore.on('node:dblclick', ({ data }) => {
    selectedNode.value = data
    emit('node-select', data)
  })
  lfCore.on('edge:click', () => {
    selectedNode.value = null
    emit('node-select', null)
  })
  lfCore.on('blank:click', () => {
    selectedNode.value = null
    emit('node-select', null)
  })
}

// ===== 3. LF ready → 注册监听 + fitView + emit('ready') =====
import { watch, nextTick } from 'vue'
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
  const t = lf.value.graphModel.transform
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
  getSelectedNode: () => selectedNode.value,
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
