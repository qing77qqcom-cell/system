/**
 * 画布 JSON ↔ 后端 approval_flow_nodes 的双向转换
 *
 * 后端数据（GET /api/approval-flows?ticket_type=xxx）：
 *   [{ id, ticketType, seq, nodeName, approverStrategy, skipRule, active }, ...]
 *   → 是按 ticket_type + seq 排序的 flat list，没有 from_node_id，没有分支
 *
 * 画布数据（LogicFlow exportGraphData）：
 *   { nodes: [{ id, type, x, y, properties }], edges: [{ id, sourceNodeId, targetNodeId }] }
 *   → 可能有 Start/End/Gateway（BPMN 图语义），后端只认 UserTask
 *
 * 策略：
 *   convertToBackendFlow(graphData)
 *     → 从画布提取 UserTask 节点，按 edges 拓扑序给 seq 编号
 *     → Start/End/Gateway 过滤掉（后端没有这些概念）
 *     → 返回后端需要的 flat list [{ ticketType, seq, nodeName, approverStrategy, skipRule }]
 *
 *   convertFromBackendFlow(backendList, ticketType)
 *     → flat list 按 seq 排序
 *     → 画成 Start → Node1 → Node2 → ... → End 的线性链（因为后端没有分支数据）
 *     → 返回 LogicFlow 能 render 的 { nodes, edges }
 *
 *   ⚠️ 后端没有条件分支字段 → convertFromBackendFlow 只生成线性链
 *      如果以后后端加了 branch_from_node_id / branch_condition 列，扩展这个模块即可
 */
import { BPMN_NODE_TYPES } from '@/composables/useLogicFlow'

/**
 * 后端 approver_strategy 枚举（和 init.sql / API 对齐）
 */
export const APPROVER_STRATEGIES = [
  { value: 'dept_leader',      label: '部门部长' },
  { value: 'super_admin',      label: '超级管理员' },
  { value: 'builtin_finance',  label: '财务（内置）' },
  { value: 'none',             label: '跳过（skip）' },
]

/** 工单类型枚举（后端 ticket_type enum） */
export const TICKET_TYPES = [
  { value: 'fault_repair',       label: '故障报修' },
  { value: 'account_permission', label: '账号权限' },
  { value: 'reimbursement',      label: '费用报销' },
]

/**
 * 画布 → 后端
 * @param {{ nodes: Array, edges: Array }} graphData - LogicFlow exportGraphData() 的结果
 * @param {string} ticketType - 目标工单类型
 * @returns {Array} approval_flow_nodes 格式（不含 id，因为是新建/整体替换）
 */
export function convertToBackendFlow(graphData, ticketType) {
  if (!graphData?.nodes?.length) return []

  const { nodes, edges } = graphData

  // 1. 提取所有 USER_TASK 节点（这是后端唯一认的类型）
  const userTasks = nodes.filter((n) => n.type === BPMN_NODE_TYPES.USER_TASK)
  if (userTasks.length === 0) return []

  // 2. 按 edges 拓扑排序：找到入度为 0 的 UserTask（最前面的），沿着 edges 往后走
  const taskSet = new Set(userTasks.map((n) => n.id))
  // 从 edges 里只挑两端都是 UserTask 的边
  const intraEdges = edges.filter((e) => taskSet.has(e.sourceNodeId) && taskSet.has(e.targetNodeId))

  // 入度表
  const indegree = Object.fromEntries(userTasks.map((n) => [n.id, 0]))
  const adjacency = Object.fromEntries(userTasks.map((n) => [n.id, []]))
  for (const e of intraEdges) {
    indegree[e.targetNodeId] = (indegree[e.targetNodeId] || 0) + 1
    adjacency[e.sourceNodeId].push(e.targetNodeId)
  }

  // Kahn 拓扑排序
  const queue = userTasks.filter((n) => indegree[n.id] === 0).map((n) => n.id)
  const sorted = []
  while (queue.length) {
    const id = queue.shift()
    sorted.push(id)
    for (const next of adjacency[id] || []) {
      indegree[next]--
      if (indegree[next] === 0) queue.push(next)
    }
  }

  // 如果有环（入度 > 0 的遗留节点），fallback 按 x 坐标排序
  if (sorted.length !== userTasks.length) {
    console.warn('[convertToBackendFlow] 检测到循环依赖，fallback 按 x 坐标排序')
    userTasks.sort((a, b) => a.x - b.x)
    return userTasks.map((n, i) => ({
      ticketType,
      seq: i + 1,
      nodeName: n.properties?.nodeName || n.properties?.node_name || `审批节点${i + 1}`,
      approverStrategy: n.properties?.approverStrategy || 'dept_leader',
      skipRule: n.properties?.skipRule || null,
    }))
  }

  // 3. 输出（按拓扑序给 seq 编号）
  const idToNode = Object.fromEntries(userTasks.map((n) => [n.id, n]))
  return sorted.map((id, i) => {
    const node = idToNode[id]
    const props = node.properties || {}
    return {
      ticketType,
      seq: i + 1,
      nodeName: props.nodeName || props.node_name || `审批节点${i + 1}`,
      approverStrategy: props.approverStrategy || 'dept_leader',
      skipRule: props.skipRule || null,
    }
  })
}

/**
 * 后端 → 画布
 * @param {Array} backendList - approval_flow_nodes（GET /api/approval-flows 返回）
 * @param {string} ticketType - 工单类型（用于种子画布标题）
 * @returns {{ nodes: Array, edges: Array }} LogicFlow 可 render 的数据
 */
export function convertFromBackendFlow(backendList, ticketType = '') {
  if (!backendList?.length) {
    // 空数据返回空画布（只给 Start 和 End）
    return {
      nodes: [
        { id: 'start', type: BPMN_NODE_TYPES.START, x: 160, y: 220 },
        { id: 'end', type: BPMN_NODE_TYPES.END, x: 400, y: 220 },
      ],
      edges: [],
    }
  }

  // 1. 按 seq 排序（后端已排，保险起见）
  const sorted = [...backendList].sort((a, b) => a.seq - b.seq)

  // 2. 画成 Start → Node1 → Node2 → ... → End 的线性链
  const NODE_WIDTH = 180
  const START_X = 140
  const GAP = 120
  const y = 220

  const nodes = [
    { id: 'start', type: BPMN_NODE_TYPES.START, x: START_X, y },
    ...sorted.map((row, i) => ({
      id: `node_${row.id}`,
      type: BPMN_NODE_TYPES.USER_TASK,
      x: START_X + NODE_WIDTH + GAP + i * (NODE_WIDTH + GAP),
      y,
      properties: {
        nodeName: row.nodeName,
        approverStrategy: row.approverStrategy,
        skipRule: row.skipRule,
        backendId: row.id,          // 保存后端 id，PUT 单条时用
        backendSeq: row.seq,
        ticketType: row.ticketType || ticketType,
        active: row.active,
      },
    })),
  ]
  const endX = START_X + NODE_WIDTH + GAP + sorted.length * (NODE_WIDTH + GAP)
  nodes.push({ id: 'end', type: BPMN_NODE_TYPES.END, x: endX, y })

  const edges = []
  if (sorted.length === 0) {
    edges.push({ id: 'e_start_end', sourceNodeId: 'start', targetNodeId: 'end', type: BPMN_NODE_TYPES.SEQUENCE_FLOW })
  } else {
    edges.push({ id: 'e_start_1', sourceNodeId: 'start', targetNodeId: nodes[1].id, type: BPMN_NODE_TYPES.SEQUENCE_FLOW })
    for (let i = 0; i < sorted.length - 1; i++) {
      edges.push({
        id: `e_${i + 1}_${i + 2}`,
        sourceNodeId: nodes[i + 1].id,
        targetNodeId: nodes[i + 2].id,
        type: BPMN_NODE_TYPES.SEQUENCE_FLOW,
      })
    }
    edges.push({
      id: `e_n_end`,
      sourceNodeId: nodes[nodes.length - 2].id,
      targetNodeId: 'end',
      type: BPMN_NODE_TYPES.SEQUENCE_FLOW,
    })
  }

  return { nodes, edges }
}
