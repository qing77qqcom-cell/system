<script setup>
// 左侧可拖拽节点面板
// HTML5 DnD：dragstart 时 setData('application/x-logicflow-node', nodeType)
// FlowCanvas.vue 的 drop 事件接收这个 type 调用 addNode()
import { BPMN_NODE_TYPES } from '@/composables/useLogicFlow'

const paletteItems = [
  { type: BPMN_NODE_TYPES.START,  title: '开始事件',     color: '#22c55e', icon: '●' },
  { type: BPMN_NODE_TYPES.USER_TASK, title: '审批节点', color: '#3b82f6', icon: '☐' },
  { type: BPMN_NODE_TYPES.EXCLUSIVE_GATEWAY, title: '条件分支', color: '#f59e0b', icon: '◇' },
  { type: BPMN_NODE_TYPES.END,    title: '结束事件',     color: '#ef4444', icon: '◎' },
]

function onDragStart(e, item) {
  // 用自定义 MIME type 防止和浏览器默认 DnD 冲突
  e.dataTransfer.setData('application/x-logicflow-node', item.type)
  e.dataTransfer.effectAllowed = 'copy'
  // 调试日志：确认 dragstart 里 setData 成功
  console.log('[NodePalette] dragstart:', item.type, 'dataTransfer.types:', Array.from(e.dataTransfer.types))
}
</script>

<template>
  <div class="node-palette">
    <div class="palette-title">节点面板</div>
    <div class="palette-hint">拖到右侧画布</div>

    <div
      v-for="item in paletteItems"
      :key="item.type"
      class="palette-item"
      draggable="true"
      @dragstart="onDragStart($event, item)"
    >
      <span class="node-icon" :style="{ borderColor: item.color, color: item.color }">
        {{ item.icon }}
      </span>
      <span class="node-title">{{ item.title }}</span>
    </div>
  </div>
</template>

<style scoped>
.node-palette {
  width: 160px;
  flex-shrink: 0;
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  border: 1px solid #e6eef7;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.palette-title {
  font-size: 14px;
  font-weight: 600;
  color: #14487e;
}

.palette-hint {
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 8px;
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: grab;
  user-select: none;
  transition: background 0.15s;
}

.palette-item:hover {
  background: #eaf4fe;
}

.palette-item:active {
  cursor: grabbing;
}

.node-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid;
  border-radius: 50%;
  font-size: 14px;
  font-weight: 700;
  background: #fff;
}

.node-title {
  font-size: 13px;
  color: #334155;
}
</style>
