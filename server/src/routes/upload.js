import { Router } from 'express'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { config } from '../config.js'
import { requireAuth } from '../middleware/auth.js'
import { ApiError } from '../utils/apiError.js'
import { assert } from '../utils/validate.js'
import { ok } from '../utils/respond.js'

const router = Router()
router.use(requireAuth)

// 允许的扩展名白名单（拒绝可执行/脚本类文件）
const ALLOWED_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.pdf', '.txt', '.md',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.mp4', '.zip',
])

const uploadPath = path.resolve(process.cwd(), config.uploadDir)
fs.mkdirSync(uploadPath, { recursive: true })

const storage = multer.diskStorage({
  destination: uploadPath,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const base = path
      .basename(file.originalname, path.extname(file.originalname))
      .replace(/[\\/:*?"<>|\s]+/g, '_')
      .slice(0, 50)
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${base}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (!ALLOWED_EXT.has(ext)) {
      return cb(new ApiError(400, '不支持的附件类型'))
    }
    cb(null, true)
  },
})

// POST /api/upload — multipart/form-data，字段名 file
router.post('/', upload.single('file'), (req, res) => {
  assert(req.file, '请选择要上传的文件（字段名 file）')
  // multer 对非 ASCII 原始文件名按 latin1 解码，转回 utf8
  const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8')
  ok(res, { name, url: `/uploads/${req.file.filename}` }, 'ok', 201)
})

export default router
