<script setup>
// 工单状态分布饼图
// - 接收后端 distribution.list（10 态固定数组，status 是英文枚举）
// - 内部将英文枚举映射成中文 label + 对应颜色
import { computed } from 'vue'
import BaseChart from './BaseChart.vue'
import { STATUS_TEXT, STATUS_TAG_TYPE } from '@/constants'

const props = defineProps({
  list: { type: Array, required: true },
  height: { type: String, default: '300px' },
})

// status tag type → 颜色映射
const TAG_COLOR = {
  primary: '#1e88e5',
  success: '#67c23a',
  warning: '#e6a23c',
  danger: '#f56c6c',
}

const option = computed(() => ({
  tooltip: { trigger: 'item', formatter: '{b}：{c} 条（{d}%）' },
  legend: { bottom: 0, icon: 'circle', itemWidth: 8, itemHeight: 8 },
  series: [{
    name: '工单状态',
    type: 'pie',
    radius: ['42%', '68%'],
    center: ['50%', '44%'],
    itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
    label: { show: true, formatter: '{b}\n{c} 条' },
    data: props.list.map((s) => ({
      name: STATUS_TEXT[s.status] ?? s.status,
      value: s.count,
      itemStyle: { color: TAG_COLOR[STATUS_TAG_TYPE[s.status]] ?? '#909399' },
    })),
  }],
}))
</script>

<template>
  <BaseChart :option="option" :height="height" />
</template>
