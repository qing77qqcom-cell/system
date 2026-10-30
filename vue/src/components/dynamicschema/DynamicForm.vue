<script setup>
/**
 * DynamicForm — Schema 驱动的动态表单容器
 *
 * 职责：
 *  1. watch(ticketType) → 调 listFormConfigs(ticketType) 拉后端 schema
 *  2. 过滤 active !== false 的字段
 *  3. 生成校验规则 → emit('rules-change') 给外层 WorkOrderForm 合并
 *     （不持有自己的 <el-form>，让外层统一校验）
 *  4. 批量渲染 <el-form-item> + <DynamicField>
 *
 * 输入：
 *   - ticketType: 当前工单类型（拉 schema 的 key）
 *   - model: 即外层 WorkOrderForm 的 form.extra（直接双向绑定）
 *   - readonlyFields: 哪些 fieldKey 只读（来自 store.permissions 解析）
 *
 * 输出：
 *   - rules-change: 自动生成的 el-form 校验规则对象
 *
 * 为什么 DynamicForm 内部不包 <el-form>？
 *   因为外层 WorkOrderForm.vue 已经有一个 <el-form ref="formRef" :rules="mergedRules">。
 *   内层再包一层会导致两层独立校验体系，formRef.validate() 只校验外层。
 *   解决方式：DynamicForm 只输出 rules 给外层合并，el-form-item 的 prop 路径写成
 *   `extra.fieldKey`（嵌套路径），Element Plus 自动递归校验。
 *
 * Element Plus 依赖：
 *   <el-divider> / <el-row> / <el-col> / <el-form-item>
 */
import { watch, computed, ref } from 'vue'
import DynamicField from './DynamicField.vue'
import { listFormConfigs } from '@/api/tickets'

const props = defineProps({
  ticketType: String,                       // 必填。当前工单类型，watch 它触发重拉 schema
  model: { type: Object, required: true },  // 外层 form.extra
  readonlyFields: { type: Array, default: () => [] }, // ['deviceNo', 'permType']
})

const emit = defineEmits(['rules-change'])

// 从后端拉到的原始 schema（按后端 sort 升序，已过滤 active !== false）
const fields = ref([])

// 监听 ticketType 变化 → 重新拉 schema
watch(
  () => props.ticketType,
  async (val) => {
    if (!val) {
      fields.value = []
      return
    }
    try {
      const all = await listFormConfigs(val)
      // 后端已按 sort 升序返回，这里只过滤 active
      fields.value = all.filter((f) => f.active !== false)
    } catch {
      fields.value = []
    }
  },
  { immediate: true },
)

// 自动生成校验规则，emit 给外层合并
// 规则 key 必须写成 `extra.${fieldKey}` — 和外层 el-form 的嵌套 model 路径一致
const dynRules = computed(() => {
  const r = {}
  for (const f of fields.value) {
    const key = `extra.${f.fieldKey}`
    const arr = []
    if (f.required) {
      arr.push({ required: true, message: `请填写${f.label}`, trigger: 'blur' })
    }
    if (f.fieldType === 'number') {
      arr.push({ type: 'number', message: `${f.label}必须是数字`, trigger: 'blur' })
    }
    r[key] = arr
  }
  emit('rules-change', r)
  return r
})

// 判断某个字段是否只读（field:readonly 权限码驱动）
const isReadonly = (fieldKey) => props.readonlyFields.includes(fieldKey)
</script>

<template>
  <template v-if="fields.length">
    <el-divider content-position="left">自定义信息</el-divider>
    <el-row :gutter="20">
      <el-col
        v-for="f in fields"
        :key="f.id"
        :span="12"
      >
        <el-form-item
          :label="f.label"
          :prop="`extra.${f.fieldKey}`"
          :required="f.required"
        >
          <DynamicField
            v-model="model[f.fieldKey]"
            :field="f"
            :readonly="isReadonly(f.fieldKey)"
          />
        </el-form-item>
      </el-col>
    </el-row>
  </template>
</template>
