import { Router } from 'express'
import { ok } from '../utils/respond.js'
import {
  DEPT_OPTIONS,
  TYPE_OPTIONS,
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  PERM_OPTIONS,
  DEVICE_OPTIONS,
} from '../constants.js'

const router = Router()

// GET /api/meta — 前端下拉选项的统一枚举源（无需鉴权，纯静态数据）
router.get('/', (req, res) => {
  ok(res, {
    depts: DEPT_OPTIONS,
    types: TYPE_OPTIONS,
    priorities: PRIORITY_OPTIONS,
    statuses: STATUS_OPTIONS,
    permTypes: PERM_OPTIONS,
    deviceTypes: DEVICE_OPTIONS,
  })
})

export default router
