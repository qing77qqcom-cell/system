<script setup>
// SLA 各指标超时率水平条形图
// - 仅 admin/leader 可见（由父组件 v-if 控制）
import { computed } from 'vue'
import BaseChart from './BaseChart.vue'

const props = defineProps({
  sla: {
    type: Object,
    required: true,
    // { overallRate, responseRate, approvalRate, processingRate, breachedCount, avgBreachedDuration }
  },
  height: { type: String, default: '220px' },
})

const ROWS = [
  { k: 'overallRate', label: '总体' },
  { k: 'responseRate', label: '首次响应' },
  { k: 'approvalRate', label: '审批' },
  { k: 'processingRate', label: '处理' },
]

const option = computed(() => ({
  tooltip: { trigger: 'axis', formatter: '{b}：{c}%' },
  grid: { left: 70, right: 20, top: 10, bottom: 20 },
  xAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
  yAxis: { type: 'category', data: ROWS.map((r) => r.label) },
  series: [{
    type: 'bar',
    data: ROWS.map((r) => ({
      value: Number(props.sla[r.k]?.toFixed(1) ?? 0),
      itemStyle: { color: props.sla[r.k] > 5 ? '#f56c6c' : props.sla[r.k] > 2 ? '#e6a23c' : '#67c23a' },
    })),
    barWidth: 18,
    label: { show: true, position: 'right', formatter: '{c}%' },
  }],
}))
</script>

<template>
  <BaseChart :option="option" :height="height" />
</template>
