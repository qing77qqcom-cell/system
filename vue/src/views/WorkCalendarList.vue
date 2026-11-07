<script setup>
/**
 * 工作日历管理（tab=calendar 时渲染）
 *
 * 后端 API（config.js 已有，零后端改动）：
 *   GET  /api/work-calendars —— [{ id, name, workDays, dayStart, dayEnd, breaks, timezone, active, specialDays }]
 *   PUT  /api/work-calendars/:id —— { name, workDays, dayStart, dayEnd, breaks, active, specialDays }
 *
 * 日历版本化：不保留历史版本，PUT 直接覆盖。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '@/utils/request.js'

const loading = ref(false)
const calendars = ref([])

// ===== 加载 =====
async function loadCalendars() {
  loading.value = true
  try {
    calendars.value = await request.get('/work-calendars')
  } catch (e) {
    ElMessage.error('加载日历失败：' + (e?.message || e))
  } finally { loading.value = false }
}

// ===== 详情弹窗 =====
const showDetail = ref(false)
const detailRow = ref(null)
function openDetail(row) { detailRow.value = row; showDetail.value = true }

// ===== 编辑弹窗 =====
const showForm = ref(false)
const form = reactive({})
const submitting = ref(false)

function openEdit(row) {
  // 深拷贝
  Object.assign(form, {
    id: row.id,
    name: row.name,
    workDays: row.workDays ? [...row.workDays] : [1, 2, 3, 4, 5],
    dayStart: row.dayStart || '09:00',
    dayEnd: row.dayEnd || '18:00',
    breaks: row.breaks ? JSON.parse(JSON.stringify(row.breaks)) : [{ start: '12:00', end: '13:00' }],
    active: row.active !== false,
    specialDays: row.specialDays ? row.specialDays.map(d => ({ ...d })) : [],
  })
  showForm.value = true
}

async function submitForm() {
  if (!form.name?.trim()) return ElMessage.error('日历名称不能为空')
  if (!Array.isArray(form.workDays) || form.workDays.length === 0) return ElMessage.error('至少选 1 个工作日')
  submitting.value = true
  try {
    const payload = {
      name: form.name.trim(),
      workDays: form.workDays.sort((a, b) => a - b),
      dayStart: form.dayStart,
      dayEnd: form.dayEnd,
      breaks: form.breaks.filter(b => b.start && b.end),
      active: form.active,
      specialDays: (form.specialDays || []).filter(d => d.day && d.kind),
    }
    const saved = await request.put(`/work-calendars/${form.id}`, payload)
    ElMessage.success(`已保存「${saved.name}」`)
    showForm.value = false
    await loadCalendars()
  } catch (e) {
    ElMessage.error('保存失败：' + (e?.message || e))
  } finally { submitting.value = false }
}

// ===== 启停 =====
async function toggleActive(row) {
  try {
    await ElMessageBox.confirm(`将「${row.name}」${row.active ? '停用' : '启用'}？`, '确认', { type: 'warning' })
  } catch { return }
  try {
    await request.put(`/work-calendars/${row.id}`, { ...row, active: !row.active })
    ElMessage.success('操作完成')
    await loadCalendars()
  } catch (e) { ElMessage.error('操作失败：' + (e?.message || e)) }
}

// ===== 工具 =====
const DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
function workDaysText(arr) {
  if (!arr?.length) return '—'
  return arr.sort((a, b) => a - b).map(d => DAY_NAMES[d]).join('、')
}
function breaksText(breaks) {
  if (!breaks?.length) return '—'
  return breaks.map(b => `${b.start}-${b.end}`).join(', ')
}
function specialDaysCount(arr) { return arr?.length || 0 }

// ===== 特殊日期行操作 =====
function addBreak() { form.breaks.push({ start: '12:00', end: '13:00' }) }
function removeBreak(i) { form.breaks.splice(i, 1) }
function addSpecialDay() { form.specialDays.push({ day: '', kind: 'holiday', name: '' }) }
function removeSpecialDay(i) { form.specialDays.splice(i, 1) }

onMounted(loadCalendars)
</script>

<template>
  <div class="calendar-list">
    <el-card shadow="never" class="table-card">
      <el-table :data="calendars" v-loading="loading" stripe>
        <el-table-column prop="name" label="日历名称" width="180">
          <template #default="{ row }">
            <div class="cal-name">📅 {{ row.name }}</div>
            <div v-if="row.timezone" class="muted">{{ row.timezone }}</div>
          </template>
        </el-table-column>
        <el-table-column label="工作日" width="200">
          <template #default="{ row }">{{ workDaysText(row.workDays) }}</template>
        </el-table-column>
        <el-table-column label="工作时间" width="180">
          <template #default="{ row }">
            <div>{{ row.dayStart || '09:00' }} — {{ row.dayEnd || '18:00' }}</div>
            <div class="muted">午休：{{ breaksText(row.breaks) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="特殊日期" width="140">
          <template #default="{ row }">
            <el-tag v-if="specialDaysCount(row.specialDays)" type="warning" size="small">
              {{ specialDaysCount(row.specialDays) }} 天
            </el-tag>
            <span v-else class="muted">无</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.active ? 'success' : 'info'" effect="dark" size="small">
              {{ row.active ? '🟢 启用中' : '⚪ 停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button link size="small" @click="openDetail(row)">📋 详情</el-button>
            <el-button link size="small" type="primary" @click="openEdit(row)">✏️ 编辑</el-button>
            <el-button link size="small" :type="row.active ? 'warning' : 'success'" @click="toggleActive(row)">
              {{ row.active ? '⏸️ 停用' : '▶️ 启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && calendars.length === 0" description="暂无工作日历" />
    </el-card>

    <!-- 详情弹窗 -->
    <el-dialog v-model="showDetail" :title="detailRow?.name" width="600px" destroy-on-close>
      <el-descriptions v-if="detailRow" :column="1" border size="small">
        <el-descriptions-item label="工作日">{{ workDaysText(detailRow.workDays) }}</el-descriptions-item>
        <el-descriptions-item label="工作时间">{{ detailRow.dayStart }} — {{ detailRow.dayEnd }}</el-descriptions-item>
        <el-descriptions-item label="午休">{{ breaksText(detailRow.breaks) }}</el-descriptions-item>
        <el-descriptions-item label="时区">{{ detailRow.timezone || 'Asia/Shanghai' }}</el-descriptions-item>
      </el-descriptions>
      <div v-if="detailRow?.specialDays?.length" style="margin-top:14px">
        <div class="sub-title">特殊日期（{{ detailRow.specialDays.length }} 天）</div>
        <el-table :data="detailRow.specialDays" size="small" border>
          <el-table-column prop="day" label="日期" width="120" />
          <el-table-column label="类型" width="100">
            <template #default="{ row }">
              <el-tag size="small" :type="row.kind === 'holiday' ? 'danger' : 'success'">
                {{ row.kind === 'holiday' ? '节假日' : '补班' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="名称" />
        </el-table>
      </div>
    </el-dialog>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="showForm" :title="`✏️ 编辑「${form.name}」`" width="640px" destroy-on-close>
      <el-form v-if="form" :model="form" label-width="110px">
        <el-form-item label="日历名称">
          <el-input v-model="form.name" placeholder="如：标准工作日历" />
        </el-form-item>
        <el-form-item label="工作日">
          <el-checkbox-group v-model="form.workDays">
            <el-checkbox :value="1">周一</el-checkbox>
            <el-checkbox :value="2">周二</el-checkbox>
            <el-checkbox :value="3">周三</el-checkbox>
            <el-checkbox :value="4">周四</el-checkbox>
            <el-checkbox :value="5">周五</el-checkbox>
            <el-checkbox :value="6">周六</el-checkbox>
            <el-checkbox :value="0">周日</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="上班时间">
          <el-input v-model="form.dayStart" placeholder="09:00" style="width:140px" />
        </el-form-item>
        <el-form-item label="下班时间">
          <el-input v-model="form.dayEnd" placeholder="18:00" style="width:140px" />
        </el-form-item>

        <!-- 午休时间段 -->
        <el-form-item label="午休时段">
          <div class="breaks-list">
            <div v-for="(b, i) in form.breaks" :key="i" class="break-row">
              <el-input v-model="b.start" placeholder="12:00" style="width:100px" />
              <span>—</span>
              <el-input v-model="b.end" placeholder="13:00" style="width:100px" />
              <el-button link type="danger" @click="removeBreak(i)">🗑️</el-button>
            </div>
            <el-button size="small" link @click="addBreak">➕ 加午休</el-button>
          </div>
        </el-form-item>

        <!-- 特殊日期 -->
        <el-form-item label="特殊日期">
          <div class="breaks-list">
            <div v-for="(d, i) in form.specialDays" :key="i" class="break-row">
              <el-input v-model="d.day" type="date" style="width:160px" />
              <el-select v-model="d.kind" style="width:110px">
                <el-option label="节假日" value="holiday" />
                <el-option label="补班" value="extra_workday" />
              </el-select>
              <el-input v-model="d.name" placeholder="名称（如国庆）" style="width:140px" />
              <el-button link type="danger" @click="removeSpecialDay(i)">🗑️</el-button>
            </div>
            <el-button size="small" link @click="addSpecialDay">➕ 加特殊日期</el-button>
          </div>
        </el-form-item>

        <el-form-item label="启用">
          <el-switch v-model="form.active" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showForm = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.calendar-list { display:flex; flex-direction:column; gap:12px; }
.table-card { border-radius:8px; }

.cal-name { font-weight:500; color:#14487e; }
.muted { color:#909399; font-size:12px; }

.sub-title { font-size:13px; font-weight:600; color:#606266; margin-bottom:6px; }

.breaks-list { display:flex; flex-direction:column; gap:6px; }
.break-row { display:flex; align-items:center; gap:8px; }
</style>
