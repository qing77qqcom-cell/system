import { Router } from 'express'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { config } from '../config.js'
import { query } from '../db.js'
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

// 每请求构建 multer 实例：上限实时读 system_params.upload_max_mb（api-design.md §8）
const buildUpload = async () => {
  const { rows } = await query(`SELECT value FROM system_params WHERE key = 'upload_max_mb'`)
  const maxMb = Math.max(1, Number(rows[0]?.value) || 5)
  return multer({
    storage,
    limits: { fileSize: maxMb * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase()
      if (!ALLOWED_EXT.has(ext)) {
        return cb(new ApiError(400, '不支持的附件类型'))
      }
      cb(null, true)
    },
  })
}

// POST /api/upload — multipart/form-data，字段名 file
router.post('/', async (req, res, next) => {
  const upload = await buildUpload()
  upload.single('file')(req, res, (err) => {
    if (err) return next(err)
    assert(req.file, '请选择要上传的文件（字段名 file）')
    // multer 对非 ASCII 原始文件名按 latin1 解码，转回 utf8
    const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8')
    ok(res, { name, url: `/uploads/${req.file.filename}` }, 'ok', 201)
  })
})

export default router
