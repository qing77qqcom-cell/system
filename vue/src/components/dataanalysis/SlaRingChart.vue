<script setup>
// SLA 达标率环形仪表盘
import { computed } from 'vue'
import BaseChart from './BaseChart.vue'

const props = defineProps({
  overallRate: { type: Number, required: true }, // 超时率 %
  height: { type: String, default: '200px' },
})

const option = computed(() => ({
  tooltip: { trigger: 'item', formatter: '{b}：{c}%' },
  series: [{
    type: 'gauge',
    radius: '80%',
    startAngle: 200,
    endAngle: -20,
    progress: { show: true, width: 16 },
    axisLine: { lineStyle: { width: 16, color: [[1, '#e8eef5']] } },
    pointer: { show: false },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: { show: false },
    detail: {
      formatter: `${Math.max(0, (100 - props.overallRate)).toFixed(1)}%`,
      offsetCenter: [0, '0%'],
      fontSize: 22,
      color: props.overallRate > 5 ? '#f56c6c' : props.overallRate > 2 ? '#e6a23c' : '#67c23a',
    },
    title: { show: true, offsetCenter: [0, '35%'], fontSize: 13, color: '#a3b5c7' },
    data: [{ value: 100 - props.overallRate, name: 'SLA 达标率' }],
  }],
}))
</script>

<template>
  <BaseChart :option="option" :height="height" />
</template>
