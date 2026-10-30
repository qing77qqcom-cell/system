<script setup>
// 工单趋势柱图（本期 vs 同期，柱+线混合）
import { computed } from 'vue'
import BaseChart from './BaseChart.vue'

const props = defineProps({
  current: { type: Array, required: true },   // [{ bucket, created, closed }]
  previous: { type: Array, required: true },  // 同结构，同期数据
  height: { type: String, default: '280px' },
})

const option = computed(() => {
  const buckets = props.current.map((b) => b.bucket)
  const mapArr = (arr, key) => arr.map((b) => b[key] ?? 0)
  return {
    tooltip: { trigger: 'axis' },
    legend: { top: 0 },
    grid: { left: 40, right: 12, top: 32, bottom: 40 },
    xAxis: { type: 'category', data: buckets, axisLabel: { rotate: buckets.length > 8 ? 40 : 0 } },
    yAxis: { type: 'value' },
    series: [
      { name: '本期新增', type: 'bar', data: mapArr(props.current, 'created'), itemStyle: { color: '#1e88e5' } },
      { name: '本期关闭', type: 'bar', data: mapArr(props.current, 'closed'), itemStyle: { color: '#67c23a' } },
      { name: '同期新增', type: 'line', data: mapArr(props.previous, 'created'), itemStyle: { color: '#909399' }, lineStyle: { type: 'dashed' } },
      { name: '同期关闭', type: 'line', data: mapArr(props.previous, 'closed'), itemStyle: { color: '#67c23a' }, lineStyle: { type: 'dashed' } },
    ],
  }
})
</script>

<template>
  <BaseChart :option="option" :height="height" />
</template>
