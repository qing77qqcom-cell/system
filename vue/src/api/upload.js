import service from '@/utils/request'

// 上传单个附件（multipart/form-data，字段名 file）
// 返回 { name, url }
export function uploadFile(file, onProgress) {
  const formData = new FormData()
  formData.append('file', file)
  return service.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
    },
  })
}
