<script setup>
/**
 * 右侧属性配置面板
 *
 * 接收一个选中节点对象（LogicFlow 的 node.model），根据节点类型展示不同表单：
 *   - USER_TASK：nodeName + approverStrategy + skipRule
 *   - EXCLUSIVE_GATEWAY：condition（条件表达式）+ 出口标签
 *   - START / END：只读提示"这是 BPMN 内置节点，无需配置"
 *
 * 属性变更 → emit('update', { id, properties }) → 画布更新节点 properties
 */
import { computed, watch } from 'vue'
import { BPMN_NODE_TYPES } from '@/composables/useLogicFlow'
import { APPROVER_STRATEGIES } from '@/composables/convertFlow'

const props = defineProps({
  /** LogicFlow 选中节点的 model 对象 */
  selectedNode: { type: Object, default: null },
})

const emit = defineEmits(['update'])

/** 调试：每次选中节点时打印 type，确认 LogicFlow 返回的是什么 */
watch(() => props.selectedNode?.type, (t) => {
  if (t) console.log('[PropertyPanel] selected node type:', t, 'expected gateway:', BPMN_NODE_TYPES.EXCLUSIVE_GATEWAY, 'match:', t?.toLowerCase?.() === BPMN_NODE_TYPES.EXCLUSIVE_GATEWAY.toLowerCase())
}, { immediate: true })

/** 当前节点类型 */
const nodeType = computed(() => props.selectedNode?.type)

/**
 * 类型归一化比较 — LogicFlow 内部 type 大小写不固定
 * 可能是 'bpmn:ExclusiveGateway' 也可能是 'bpmn:exclusiveGateway'
 */
function typeMatch(t, expected) {
  if (!t || !expected) return false
  return String(t).toLowerCase() === String(expected).toLowerCase()
}

/** 判断当前节点是否可编辑 */
const isEditableTask = computed(() => typeMatch(nodeType.value, BPMN_NODE_TYPES.USER_TASK))
const isEditableGateway = computed(() => typeMatch(nodeType.value, BPMN_NODE_TYPES.EXCLUSIVE_GATEWAY))

/**
 * 每个字段用独立 computed getter/setter
 */
function makeField(fieldName, fallback = '') {
  return computed({
    get: () => props.selectedNode?.properties?.[fieldName] ?? fallback,
    set: (val) => {
      if (!props.selectedNode?.id) return
      const merged = {
        ...(props.selectedNode.properties || {}),
        [fieldName]: val,
      }
      emit('update', { id: props.selectedNode.id, properties: merged })
    },
  })
}

const nodeName = makeField('nodeName', '')
const approverStrategy = makeField('approverStrategy', '')
const skipRule = makeField('skipRule', '')
const condition = makeField('condition', '')
const trueLabel = makeField('trueLabel', '')
const falseLabel = makeField('falseLabel', '')
</script>

<template>
  <div class="property-panel">
    <div class="panel-title">属性配置</div>

    <!-- 未选中任何节点 -->
    <div v-if="!selectedNode" class="panel-empty">
      <el-icon :size="40"><Document /></el-icon>
      <p>点击画布上的节点<br/>在这里编辑属性</p>
    </div>

    <!-- USER_TASK 可编辑表单 -->
    <template v-else-if="isEditableTask">
      <el-form label-position="top" size="small">
        <el-form-item label="节点名称">
          <el-input v-model="nodeName" placeholder="如：部门部长审批" />
        </el-form-item>

        <el-form-item label="审批人策略">
          <el-select v-model="approverStrategy" placeholder="选择审批人">
            <el-option
              v-for="s in APPROVER_STRATEGIES"
              :key="s.value"
              :label="s.label"
              :value="s.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="跳过条件（skipRule）">
          <el-input
            v-model="skipRule"
            type="textarea"
            :rows="3"
            placeholder='{"applicant_role":"技术部部长"}'
          />
          <div class="field-hint">JSON 格式，满足时跳过该审批节点</div>
        </el-form-item>
      </el-form>
    </template>

    <!-- EXCLUSIVE_GATEWAY 条件分支 -->
    <template v-else-if="isEditableGateway">
      <el-form label-position="top" size="small">
        <el-form-item label="条件表达式">
          <el-input v-model="condition" placeholder="amount > 5000" />
          <div class="field-hint">当表达式为真时走 true 出口，否则走 false 出口</div>
        </el-form-item>

        <el-form-item label="true 分支标签">
          <el-input v-model="trueLabel" placeholder="金额大于 5000" />
        </el-form-item>

        <el-form-item label="false 分支标签">
          <el-input v-model="falseLabel" placeholder="金额≤5000" />
        </el-form-item>
      </el-form>
    </template>

    <!-- START / END 等只读提示 -->
    <template v-else>
      <div class="panel-readonly">
        <el-icon :size="32" color="#94a3b8"><InfoFilled /></el-icon>
        <p>BPMN 内置节点<br/>无需配置属性</p>
        <div class="node-meta">
          <div class="meta-row"><span>类型</span><code>{{ nodeType }}</code></div>
          <div class="meta-row"><span>ID</span><code>{{ selectedNode.id }}</code></div>
        </div>
      </div>
    </template>
  </div>
</template>

<script>
import { Document, InfoFilled } from '@element-plus/icons-vue'
export default { components: {} }
</script>

<style scoped>
.property-panel {
  width: 240px;
  flex-shrink: 0;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e6eef7;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.panel-title {
  padding: 12px 14px 8px;
  font-size: 14px;
  font-weight: 600;
  color: #14487e;
  border-bottom: 1px solid #e6eef7;
}

.panel-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #94a3b8;
  padding: 24px;
}
.panel-empty p { margin: 0; font-size: 12px; line-height: 1.6; text-align: center; }

.panel-readonly {
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #94a3b8;
}
.panel-readonly p { margin: 0; font-size: 12px; text-align: center; }

.node-meta {
  width: 100%;
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px dashed #e6eef7;
}
.meta-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  margin-bottom: 4px;
}
.meta-row span { color: #94a3b8; }
.meta-row code {
  background: #f1f5f9;
  color: #475569;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.el-form) { padding: 10px 14px; }
.field-hint { font-size: 11px; color: #94a3b8; margin-top: 4px; line-height: 1.4; }
</style>
