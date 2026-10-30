<script setup>
import { ref } from 'vue'
import { QuestionFilled, Document, Connection, Bell } from '@element-plus/icons-vue'

const activeNames = ref([])

const faqList = [
  { q: '如何提交一个工单？', a: '在顶部菜单点击「工单创建」，选择工单类型后按表单提示填写。标有 * 的字段为必填项。' },
  { q: '提交后能修改吗？', a: '在工单详情页点击「补充信息」可以追加说明；如果不需要处理了可以点「取消」。' },
  { q: '工单一直没人处理怎么办？', a: '可以联系部长（技术部部长），或者在工单详情页点击「催办」。系统超过 SLA 会自动升级提醒。' },
  { q: '系统里有几种工单类型？', a: '目前支持三种：故障报修、账号与权限服务、报销审批。' },
]
</script>

<template>
  <div class="help-center">
    <div class="page-header">
      <h2><el-icon><QuestionFilled /></el-icon> 帮助中心</h2>
      <span class="sub">常见问题 · SOP 文档 · 联系我们</span>
    </div>

    <div class="quick-cards">
      <div class="q-card">
        <el-icon :size="28"><Document /></el-icon>
        <div class="q-card-body">
          <div class="q-title">新手指南</div>
          <div class="q-desc">3 分钟上手 OA 工单系统</div>
        </div>
      </div>
      <div class="q-card">
        <el-icon :size="28"><Connection /></el-icon>
        <div class="q-card-body">
          <div class="q-title">IT 联系人</div>
          <div class="q-desc">技术部 · 138-0000-0000</div>
        </div>
      </div>
      <div class="q-card">
        <el-icon :size="28"><Bell /></el-icon>
        <div class="q-card-body">
          <div class="q-title">系统公告</div>
          <div class="q-desc">v1.0 上线，敬请体验</div>
        </div>
      </div>
    </div>

    <el-divider content-position="left">常见问题</el-divider>

    <el-collapse v-model="activeNames" class="faq-collapse">
      <el-collapse-item
        v-for="(item, idx) in faqList"
        :key="idx"
        :name="idx"
        :title="item.q"
      >
        {{ item.a }}
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: baseline;
  gap: 16px;
  margin-bottom: 16px;
}
.page-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: #14487e;
  display: flex;
  align-items: center;
  gap: 8px;
}
.page-header .sub {
  font-size: 13px;
  color: #6b87a3;
}

.quick-cards {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  margin-bottom: 16px;
}
.q-card {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 16px;
  background: #fff;
  border: 1px solid #e6eef7;
  border-radius: 8px;
  color: #1e88e5;
}
.q-card-body .q-title { font-weight: 600; color: #14487e; }
.q-card-body .q-desc { font-size: 12px; color: #6b87a3; margin-top: 2px; }

.faq-collapse {
  background: #fff;
  border-radius: 8px;
}
</style>
