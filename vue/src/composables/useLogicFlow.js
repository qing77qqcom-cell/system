/**
 * LogicFlow 初始化 + 画布生命周期 composable
 *
 * 用法（在 FlowCanvas.vue 里）：
 *   const containerRef = ref(null)
 *   const { lf, initLF, destroyLF, exportGraphData, importGraphData } = useLogicFlow()
 *   onMounted(() => initLF(containerRef.value))
 *   onBeforeUnmount(() => destroyLF())
 *
 * P0 提供：
 *   - initLF(container)     初始化 LogicFlow 实例 + 注册 BPMN 扩展 + 开启 dnd
 *   - destroyLF()           销毁实例（防内存泄漏）
 *   - exportGraphData()     { nodes, edges } → 可 JSON.stringify
 *   - importGraphData(data) 载入 { nodes, edges } 到画布
 *   - clearGraph()          清空画布
 *   - fitView()             自动缩放适配
 */
import { ref, shallowRef } from 'vue'
import LogicFlow from '@logicflow/core'
import { BpmnAdapter, BPMNElements, Control, SelectionSelect } from '@logicflow/extension'
import '@logicflow/core/dist/index.css'
import '@logicflow/extension/dist/index.css'

// LogicFlow 扩展一次性注册（模块级只跑一次）
let registered = false
function registerExtensions() {
  if (registered) return
  LogicFlow.use(BpmnAdapter)
  // ⚠️ 关键：用 BPMNElements（驼峰），不是 BpmnElement（驼峰但不存在！）
  // BPMNElements 会自动调用 lf.register() 注册所有 BPMN 节点
  LogicFlow.use(BPMNElements)
  LogicFlow.use(Control)
  LogicFlow.use(SelectionSelect)
  registered = true
}

/**
 * BPMN 节点类型常量（LogicFlow BPMNElements 插件注册的类型名）
 * ⚠️ 注意：全部是 BPMN 标准的小写驼峰命名！
 *   bpmn:startEvent / bpmn:endEvent / bpmn:userTask / bpmn:exclusiveGateway / bpmn:sequenceFlow
 *   不是 PascalCase！LogicFlow 会严格校验类型是否已注册
 */
export const BPMN_NODE_TYPES = {
  START: 'bpmn:startEvent',
  END: 'bpmn:endEvent',
  USER_TASK: 'bpmn:userTask',
  EXCLUSIVE_GATEWAY: 'bpmn:exclusiveGateway',
  SEQUENCE_FLOW: 'bpmn:sequenceFlow',
}

/**
 * P0 种子画布：Start → 部门部长审批 → 超级管理员审批 → End
 * 紧凑布局（节点间距 180px），LogicFlow BPMN 节点默认尺寸能显示 4 个节点不溢出
 */
export const P0_DEFAULT_GRAPH = {
  nodes: [
    { id: 'start', type: BPMN_NODE_TYPES.START, x: 100, y: 180 },
    {
      id: 'node1',
      type: BPMN_NODE_TYPES.USER_TASK,
      x: 320,
      y: 180,
      properties: { nodeName: '部门部长审批', approverStrategy: 'dept_leader', skipRule: null },
    },
    {
      id: 'node2',
      type: BPMN_NODE_TYPES.USER_TASK,
      x: 540,
      y: 180,
      properties: { nodeName: '超级管理员审批', approverStrategy: 'super_admin', skipRule: null },
    },
    { id: 'end', type: BPMN_NODE_TYPES.END, x: 760, y: 180 },
  ],
  edges: [
    { id: 'e1', sourceNodeId: 'start', targetNodeId: 'node1', type: BPMN_NODE_TYPES.SEQUENCE_FLOW },
    { id: 'e2', sourceNodeId: 'node1', targetNodeId: 'node2', type: BPMN_NODE_TYPES.SEQUENCE_FLOW },
    { id: 'e3', sourceNodeId: 'node2', targetNodeId: 'end', type: BPMN_NODE_TYPES.SEQUENCE_FLOW },
  ],
}

export function useLogicFlow() {
  // 用 shallowRef 避免 LogicFlow 实例被 Vue 深层响应式代理（会破坏内部原型链）
  const lf = shallowRef(null)
  const ready = ref(false)

  /**
   * 初始化 LogicFlow
   * @param {HTMLElement} container - 画布挂载的 DOM 元素（通常是 ref.value）
   * @param {Object} [options] - 额外配置（可选，覆盖默认 config）
   */
  function initLF(container, options = {}) {
    if (!container) {
      console.error('[useLogicFlow] initLF: container is null')
      return
    }
    if (lf.value) {
      console.warn('[useLogicFlow] initLF: already initialized, call destroyLF() first')
      return
    }

    registerExtensions()

    // LogicFlow 要求容器有非零宽高才能渲染
    // 如果此时容器还没尺寸（display:none 或 flex 链还没撑开），等它有了再初始化
    const rect = container.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      console.warn('[useLogicFlow] initLF: container has zero size (', rect.width, 'x', rect.height, '), will retry in 300ms')
      setTimeout(() => initLF(container, options), 300)
      return
    }

    const config = {
      container,
      grid: {
        size: 10,
        visible: true,
        type: 'dot',
        config: { color: '#d9d9d9', thickness: 1 },
      },
      background: {
        backgroundColor: '#f8fafc',
      },
      keyboard: { enabled: true },
      // 不注册 plugins: [DndPanel] —— 干扰我们的 window 级 HTML5 DnD
      // 连线样式（SequenceFlow 实线 + 箭头）
      edgeTextDraggable: true,
      // 默认边类型（BPMN sequenceFlow）
      edgeType: BPMN_NODE_TYPES.SEQUENCE_FLOW,
      // 节点默认属性
      nodeTextDraggable: true,
      // 允许在节点上右键菜单
      contextMenu: true,
      // 覆盖默认 config
      ...options,
    }

    lf.value = new LogicFlow(config)

    // 默认种子画布（后续改为从后端加载）
    lf.value.render(P0_DEFAULT_GRAPH)

    // 适配尺寸（容器可能刚挂载，下一拍再 fitView）
    requestAnimationFrame(() => {
      lf.value?.fitView(80)
      ready.value = true
    })
  }

  /** 销毁实例，防止内存泄漏（onBeforeUnmount 调用） */
  function destroyLF() {
    if (lf.value) {
      lf.value.destroy()
      lf.value = null
      ready.value = false
    }
  }

  /**
   * 导出画布数据（纯 JSON，无 LogicFlow 内部字段）
   * @returns {{ nodes: Array, edges: Array }}
   */
  function exportGraphData() {
    if (!lf.value) return { nodes: [], edges: [] }

    const gm = lf.value.graphModel
    console.log('[useLogicFlow] graphModel keys:', Object.keys(gm).filter(k => !k.startsWith('_')).join(', '))
    console.log('[useLogicFlow] gm.nodes =', gm.nodes?.length, 'gm.nodeModels =', gm.nodeModels?.length, 'gm.edges =', gm.edges?.length)

    // LogicFlow 不同版本 API 不同，多策略尝试
    // 判断标准是 nodes 数组有内容，不是 graphData 对象是否 truthy
    let graphData = null

    // 策略 1: lf.getGraphData()
    if (typeof lf.value.getGraphData === 'function') {
      const r = lf.value.getGraphData()
      if (r?.nodes?.length) {
        graphData = r
        console.log('[useLogicFlow] strategy 1 (lf.getGraphData):', r.nodes.length, 'nodes')
      }
    }

    // 策略 2: lf.graphModel.getGraphData()
    if (!graphData?.nodes?.length && typeof gm?.getGraphData === 'function') {
      const r = gm.getGraphData()
      if (r?.nodes?.length) {
        graphData = r
        console.log('[useLogicFlow] strategy 2 (gm.getGraphData):', r.nodes.length, 'nodes')
      }
    }

    // 策略 3: 手动从 graphModel.nodes / graphModel.edges 数组拿
    if (!graphData?.nodes?.length && gm) {
      const nodeSource = gm.nodes || gm.nodeModels || []
      const edgeSource = gm.edges || gm.edgeModels || []
      console.log('[useLogicFlow] strategy 3: nodeSource=', nodeSource.length, 'edgeSource=', edgeSource.length)
      graphData = {
        nodes: nodeSource.map((n) => ({
          id: n.id,
          type: n.type,
          x: n.x,
          y: n.y,
          width: n.width,
          height: n.height,
          properties: n.properties || {},
          text: n.text,
        })),
        edges: edgeSource.map((e) => ({
          id: e.id,
          type: e.type || BPMN_NODE_TYPES.SEQUENCE_FLOW,
          sourceNodeId: e.sourceNodeId,
          targetNodeId: e.targetNodeId,
          text: e.text,
        })),
      }
    }

    if (!graphData) {
      console.warn('[useLogicFlow] exportGraphData: 所有策略都失败！')
      return { nodes: [], edges: [] }
    }

    console.log('[useLogicFlow] exportGraphData ✅', graphData.nodes?.length || 0, 'nodes,', graphData.edges?.length || 0, 'edges')

    return {
      nodes: (graphData.nodes || []).map((n) => ({
        id: n.id,
        type: n.type,
        x: Number.isFinite(n.x) ? n.x : 0,
        y: Number.isFinite(n.y) ? n.y : 0,
        width: n.width,
        height: n.height,
        properties: n.properties || {},
        text: n.text,
      })),
      edges: (graphData.edges || []).map((e) => ({
        id: e.id,
        type: e.type || BPMN_NODE_TYPES.SEQUENCE_FLOW,
        sourceNodeId: e.sourceNodeId,
        targetNodeId: e.targetNodeId,
        text: e.text,
        sourcePortId: e.sourcePortId,
        targetPortId: e.targetPortId,
      })),
    }
  }

  /**
   * 载入画布数据（并把 properties.nodeName 作为节点显示文字）
   * @param {{ nodes: Array, edges: Array }} data
   */
  function importGraphData(data) {
    if (!lf.value || !data) return
    console.log('[useLogicFlow] importGraphData:', data.nodes?.length || 0, 'nodes,', data.edges?.length || 0, 'edges')
    lf.value.clearData()
    if (data.nodes?.length) {
      // LogicFlow render 后节点模型可能还没完全初始化，等两个 rAF 再 fitView
      lf.value.render(data)
      applyNodeLabels()
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            // 只在有有效 bounds 时 fitView
            const bounds = lf.value.getGraphBounds?.()
            if (bounds && Number.isFinite(bounds.width) && bounds.width > 0) {
              lf.value.fitView(40)
              console.log('[useLogicFlow] fitView ✅ bounds:', bounds.width.toFixed(0), 'x', bounds.height.toFixed(0))
            } else {
              console.warn('[useLogicFlow] fitView SKIP: invalid bounds', bounds)
            }
          } catch (e) {
            console.warn('[useLogicFlow] fitView error:', e.message)
          }
        })
      })
    }
  }

  /**
   * 遍历所有节点，把 properties.nodeName 作为画布上显示的文字
   * LogicFlow 默认显示 type 名（如 "bpmn:UserTask"），我们要改成业务节点名
   */
  function applyNodeLabels() {
    if (!lf.value) return
    const allNodes = lf.value.getGraphData()?.nodes || []
    for (const n of allNodes) {
      const nodeModel = lf.value.graphModel.getNodeModelById(n.id)
      if (!nodeModel) continue
      const label =
        n.properties?.nodeName ||
        (n.type === BPMN_NODE_TYPES.START ? '开始' :
         n.type === BPMN_NODE_TYPES.END ? '结束' :
         n.type === BPMN_NODE_TYPES.EXCLUSIVE_GATEWAY ? '条件' : '')
      if (label) {
        // LogicFlow NodeModel 用 setText(text) 改显示文字
        if (nodeModel.setText) nodeModel.setText(label)
        else nodeModel.text = label
      }
    }
  }

  /** 清空画布 */
  function clearGraph() {
    if (!lf.value) return
    lf.value.clearData()
  }

  /** 自动缩放适配整个画布，padding 小一点 → 节点显示比例合适 */
  function fitView(padding = 40) {
    lf.value?.fitView(padding)
  }

  /**
   * 从左侧 NodePalette 拖入节点（HTML5 Drag & Drop）
   * @param {string} nodeType - BPMN_NODE_TYPES.*
   * @param {number} x - 画布坐标（相对于画布容器）
   * @param {number} y
   */
  function addNode(nodeType, x, y, properties = {}) {
    if (!lf.value) return
    const id = `${nodeType.split(':')[1]}_${Date.now()}`
    lf.value.addNode({ id, type: nodeType, x, y, properties })
  }

  /**
   * 更新指定节点的 properties（PropertyPanel 改属性时调用）
   * @param {string} id - 节点 id
   * @param {Object} properties - 新的 properties 对象（会整体替换）
   */
  function updateNodeProperties(id, properties) {
    if (!lf.value) return
    const node = lf.value.graphModel.getNodeModelById(id)
    if (!node) {
      console.warn('[useLogicFlow] updateNodeProperties: node not found:', id)
      return
    }
    // LogicFlow NodeModel 的 properties 是只读 getter，需要用 setProperty 或 getProperties + 深改
    // 这里用 node.setProperties 逐个覆盖，兼容性更好
    if (node.setProperties) {
      node.setProperties(properties)
    } else {
      // 旧版 fallback：深拷贝 properties 再整个替换
      node.properties = { ...(node.properties || {}), ...properties }
    }
    // 如果改了 nodeName，同步更新画布上的显示文字
    if (properties.nodeName) {
      node.setTextContent?.(properties.nodeName)
    }
  }

  return {
    lf,
    ready,
    BPMN_NODE_TYPES,
    initLF,
    destroyLF,
    exportGraphData,
    importGraphData,
    applyNodeLabels,
    clearGraph,
    fitView,
    addNode,
    updateNodeProperties,
  }
}
