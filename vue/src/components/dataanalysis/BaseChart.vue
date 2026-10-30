<script setup>
// 通用 ECharts 容器组件：
// - 挂载后初始化实例并渲染 option
// - option 变化时自动更新（deep 监听）
// - 窗口尺寸变化时自适应
// - 组件卸载时销毁实例，防止内存泄漏
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  option: { type: Object, required: true },
  height: { type: String, default: '300px' },
})

const chartEl = ref()
let chart = null

const handleResize = () => chart?.resize()

onMounted(() => {
  chart = echarts.init(chartEl.value)// 初始化图表实例
  chart.setOption(props.option)// 渲染图表
  window.addEventListener('resize', handleResize)//浏览器内置事件名
})

watch(
  () => props.option,
  (opt) => chart?.setOption(opt),
  { deep: true },
)

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div ref="chartEl" class="base-chart" :style="{ height }" />
</template>

<style scoped>
.base-chart {
  width: 100%;
}
</style>
