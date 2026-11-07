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
import { BPMNElements, Control, SelectionSelect } from '@logicflow/extension'
import '@logicflow/core/dist/index.css'
import '@logicflow/extension/dist/index.css'

// LogicFlow 扩展一次性注册（模块级只跑一次）
let registered = false
function registerExtensions() {
  if (registered) return
  // ⚠️ 不注册 BpmnAdapter！它的 adapterIn 会把 LogicFlow 原生格式 { nodes, edges }
  // 当成 BPMN XML 格式解析（找 bpmn:definitions），找不到就返回空数据，导致 render 失败。
  // 我们只用 LogicFlow 原生格式（convertFlow.js 双向转换），不需要 BPMN XML 导入导出。
  // LogicFlow.use(BpmnAdapter)  ← 故意不注册
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

/**
 * 统一从 graphModel 拿所有节点
 * LogicFlow render 后节点先加到 nodeModelMap 里，gm.nodes 数组稍后才同步
 * 所以优先从 nodeModelMap 拿（更快、更可靠）
 */
function getAllNodes(gm) {
  if (!gm) return []
  if (gm.nodeModelMap) {
    const vals = Object.values(gm.nodeModelMap)
    if (vals.length) return vals
  }
  return gm.nodes || gm.nodeModels || []
}
function getAllEdges(gm) {
  if (!gm) return []
  if (gm.edgeModelMap) {
    const vals = Object.values(gm.edgeModelMap)
    if (vals.length) return vals
  }
  return gm.edges || gm.edgeModels || []
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

    // 多拍等待让 LogicFlow 内部完全初始化（BPMN 节点尺寸、transformModel 等）
    // 等节点模型全部就绪后再 fitView，避免 matrix(NaN)
    let tries = 0
    const waitAndFit = () => {
      tries++
      if (!lf.value) return
      const gm = lf.value.graphModel
      const ns = getAllNodes(gm)
      const allReady = ns.length > 0 && ns.every(n => Number.isFinite(n.width) && Number.isFinite(n.height) && n.width > 0)
      if (allReady || tries > 20) {
        ready.value = true
        // 延迟一帧让 watcher 的 nextTick 也有时间准备
        requestAnimationFrame(() => safeFitView(80))
      } else {
        requestAnimationFrame(waitAndFit)
      }
    }
    requestAnimationFrame(waitAndFit)
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

    // 策略 3: 手动从 graphModel.nodeModelMap / edges 拿（最可靠）
    if (!graphData?.nodes?.length && gm) {
      const nodeSource = getAllNodes(gm)
      const edgeSource = getAllEdges(gm)
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
    // 直接 render — LogicFlow 的 render 内部 graphDataToModel 已经清空 nodeModelMap，不需要先 clearData()
    lf.value.render(data)
    applyNodeLabels()
    // 等节点模型完全初始化（width/height 就绪）后再 safeFitView
    let tries = 0
    const waitAndFit = () => {
      tries++
      const ns = getAllNodes(lf.value?.graphModel)
      const allReady = ns.length > 0 && ns.every(n => Number.isFinite(n.width) && n.width > 0)
      if (allReady || tries > 15) {
        requestAnimationFrame(() => safeFitView(40))
      } else {
        requestAnimationFrame(waitAndFit)
      }
    }
    requestAnimationFrame(waitAndFit)
  }

  /**
   * 遍历所有节点，把 properties.nodeName 作为画布上显示的文字
   * LogicFlow 默认显示 type 名（如 "bpmn:UserTask"），我们要改成业务节点名
   */
  function applyNodeLabels() {
    if (!lf.value) return
    // 从 nodeModelMap 拿节点（比 gm.nodes 更早有数据）
    const allNodes = getAllNodes(lf.value.graphModel)
    for (const n of allNodes) {
      const label =
        n.properties?.nodeName ||
        (n.type === BPMN_NODE_TYPES.START ? '开始' :
         n.type === BPMN_NODE_TYPES.END ? '结束' :
         n.type === BPMN_NODE_TYPES.EXCLUSIVE_GATEWAY ? '条件' : '')
      if (label) {
        try {
          if (n.setText) n.setText(label)
          else n.text = label
        } catch { /* ignore */ }
      }
    }
  }

  /** 清空画布 */
  function clearGraph() {
    if (!lf.value) return
    lf.value.clearData()
  }

  /**
   * 安全的 fitView — 自己算 bounds，自己算 scale/translate，直接操作 transformModel
   * 完全绕过 LogicFlow 内部 fitView 可能产生 matrix(NaN) 的路径
   */
  function safeFitView(padding = 40) {
    if (!lf.value) return
    try {
      const gm = lf.value.graphModel
      const ns = getAllNodes(gm)
      if (!ns.length) { console.warn('[safeFitView] no nodes in nodeModelMap'); return }

      // 1. 自己算 bounds（比 LF 内部 getGraphBounds 更可靠）
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const n of ns) {
        if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) continue
        const w = Number.isFinite(n.width) ? n.width : 0
        const h = Number.isFinite(n.height) ? n.height : 0
        if (w <= 0 || h <= 0) continue
        minX = Math.min(minX, n.x - w/2); minY = Math.min(minY, n.y - h/2)
        maxX = Math.max(maxX, n.x + w/2); maxY = Math.max(maxY, n.y + h/2)
      }

      if (!Number.isFinite(minX) || !Number.isFinite(minY) ||
          (maxX - minX) <= 0 || (maxY - minY) <= 0) {
        console.warn('[safeFitView] SKIP: invalid bounds', { minX, minY, maxX, maxY })
        return
      }

      // 2. 拿容器尺寸
      const container = gm.rootEl
      const cw = container?.clientWidth || 0
      const ch = container?.clientHeight || 0
      if (cw <= 0 || ch <= 0) {
        console.warn('[safeFitView] SKIP: invalid container size', cw, ch)
        return
      }

      // 3. 算 scale 和 translate
      const graphW = maxX - minX + padding * 2
      const graphH = maxY - minY + padding * 2
      const scale = Math.min(cw / graphW, ch / graphH)
      if (!Number.isFinite(scale) || scale <= 0 || scale > 10) {
        console.warn('[safeFitView] SKIP: invalid scale', scale)
        return
      }

      const graphCenterX = (minX + maxX) / 2
      const graphCenterY = (minY + maxY) / 2
      const translateModel = gm.transformModel
      if (!translateModel) { console.warn('[safeFitView] no transformModel'); return }

      // 4. 直接设 transform（等价于 matrix(scale,0,0,scale,tx,ty)）
      const tx = cw / 2 - graphCenterX * scale
      const ty = ch / 2 - graphCenterY * scale
      if (!Number.isFinite(tx) || !Number.isFinite(ty)) {
        console.warn('[safeFitView] SKIP: invalid translate', tx, ty)
        return
      }

      translateModel.SCALE_X = scale
      translateModel.SCALE_Y = scale
      translateModel.TRANSLATE_X = tx
      translateModel.TRANSLATE_Y = ty

      // 5. 强制触发重绘
      if (typeof translateModel.setTransform === 'function') {
        translateModel.setTransform(scale, scale, tx, ty)
      }
      // 刷新视口
      if (typeof gm.refresh === 'function') {
        gm.refresh()
      } else if (typeof lf.value.render === 'function') {
        // render 太贵，尝试只刷新 viewBox
        const svg = container?.querySelector?.('svg')
        if (svg) svg.setAttribute('transform', `matrix(${scale},0,0,${scale},${tx},${ty})`)
      }

      console.log('[safeFitView] ✅ scale=', scale.toFixed(2), 'tx=', tx.toFixed(0), 'ty=', ty.toFixed(0))
    } catch (e) {
      console.warn('[safeFitView] error:', e.message)
    }
  }

  /** 对外暴露的 fitView — 内部用 safeFitView 包装 */
  function fitView(padding = 40) {
    safeFitView(padding)
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
    // 加完自动 apply labels（让新节点显示业务名而不是 type 名）
    setTimeout(applyNodeLabels, 0)
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
    // 如果改了 nodeName，同步更新画布上的显示文字（LogicFlow 用 setText）
    if (properties.nodeName) {
      try { node.setText?.(properties.nodeName) || (node.text = properties.nodeName) } catch { /* ignore */ }
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
