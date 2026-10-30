<script setup>
/**
 * DynamicField — 最小渲染单元
 *
 * 职责：接收一个后端返回的 field 对象，按 fieldType 渲染对应的 Element Plus 表单控件。
 *       不调接口、不生成校验规则、不管联动 — 纯渲染组件。
 *
 * 输入：
 *   - field: 后端返回的单条 schema（含 fieldKey / label / fieldType / required / options / sort / active）
 *   - modelValue: 当前字段值（父组件 v-model 绑定）
 *   - readonly: 是否只读（来自 field:readonly 权限码解析）
 *
 * 输出：
 *   - update:modelValue: 值变化时 emit 给父组件
 *
 * Element Plus 依赖：
 *   <el-input> / <el-input type="textarea"> / <el-input-number>
 *   <el-select> + <el-option> / <el-date-picker type="date">
 *
 * fieldType → 组件映射（v1.0）：
 *   text     → <el-input>
 *   textarea → <el-input type="textarea" :rows="3">
 *   number   → <el-input-number controls-position="right">
 *   select   → <el-select> + v-for normalizedOptions 渲染 <el-option>
 *   date     → <el-date-picker type="date">
 */
import { computed } from 'vue'

const props = defineProps({
  field: { type: Object, required: true },
  modelValue: { default: null },
  readonly: Boolean,
})

const emit = defineEmits(['update:modelValue'])

// 桥接 v-model：子组件不能直接写 v-model="modelValue"
const vModel = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

// options 格式归一化：后端 form-configs 当前存纯字符串数组
//   ["OA", "邮箱"] → [{ label: "OA", value: "OA" }, { label: "邮箱", value: "邮箱" }]
// 同时兼容老格式对象数组（原样返回）
const normalizedOptions = computed(() => {
  if (!Array.isArray(props.field.options)) return []
  return props.field.options.map((opt) =>
    typeof opt === 'string' ? { label: opt, value: opt } : opt,
  )
})
</script>

<template>
  <template v-if="field.fieldType === 'text'">
    <el-input
      v-model="vModel"
      :placeholder="`请输入${field.label}`"
      :disabled="readonly"
      clearable
    />
  </template>

  <template v-else-if="field.fieldType === 'textarea'">
    <el-input
      v-model="vModel"
      type="textarea"
      :rows="3"
      :placeholder="`请输入${field.label}`"
      :disabled="readonly"
    />
  </template>

  <template v-else-if="field.fieldType === 'number'">
    <el-input-number
      v-model="vModel"
      :disabled="readonly"
      controls-position="right"
      style="width: 100%"
    />
  </template>

  <template v-else-if="field.fieldType === 'select'">
    <el-select
      v-model="vModel"
      :placeholder="`请选择${field.label}`"
      :disabled="readonly"
      style="width: 100%"
    >
      <el-option
        v-for="opt in normalizedOptions"
        :key="opt.value"
        :label="opt.label"
        :value="opt.value"
      />
    </el-select>
  </template>

  <template v-else-if="field.fieldType === 'date'">
    <el-date-picker
      v-model="vModel"
      type="date"
      :placeholder="`请选择${field.label}`"
      :disabled="readonly"
      style="width: 100%"
      value-format="YYYY-MM-DD"
    />
  </template>

  <!-- 未知 fieldType → 渲染占位，避免整个字段消失 -->
  <template v-else>
    <el-input v-model="vModel" placeholder="未知字段类型" disabled />
  </template>
</template>
