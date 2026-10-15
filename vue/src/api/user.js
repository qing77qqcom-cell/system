import service from '@/utils/request'
import { ElMessage } from 'element-plus'

import { ref } from 'vue'

const loading = ref(false)



export function login(data) {

  return service.post('login', data).then((res)=>{

      localStorage.setItem('oa_token', JSON.stringify({ token: res.data.token.token, user: res.data.token.user }))
         ElMessage.success('登录成功，欢迎回来！')

      }
).catch((err)=>{

      ElMessage.error(err.message)
}).finally(()=>{
      loading.value = false
})
}

