<script setup lang="ts">
import { computed, ref } from 'vue'
import { Pencil, Plus, Shield } from 'lucide-vue-next'
import KbAclDialog from '@/components/knowledge/KbAclDialog.vue'
import { Panel } from '@/components/ui-kit'
import { saveTenderCompany, type CompanyDirectory, type TenderCompany } from '@/lib/tender-companies-api'

const props = defineProps<{ directory: CompanyDirectory; modelValue: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [id: string]; saved: [company: TenderCompany] }>()
const query = ref('')
const selected = computed(() => props.directory.items.find(item => item.id === props.modelValue))
const options = computed(() => {
  const text = query.value.trim().toLowerCase()
  return props.directory.items.filter(item => item.id === props.modelValue ||
    [item.name, item.creditCode, ...item.aliases].some(value => value.toLowerCase().includes(text)))
})

const editing = ref(false)
const editingId = ref<string>()
const form = ref({ name: '', creditCode: '', aliases: '', active: true })
const saving = ref(false)
const error = ref('')
const acl = ref<TenderCompany>()

function openEditor(company?: TenderCompany) {
  error.value = ''
  editingId.value = company?.id
  form.value = {
    name: company?.name || '',
    creditCode: company?.creditCode || '',
    aliases: company?.aliases.join('\n') || '',
    active: company?.active ?? true,
  }
  editing.value = true
}

async function saveCompany() {
  if (saving.value) return
  saving.value = true
  error.value = ''
  try {
    const company = await saveTenderCompany({
      ...form.value,
      aliases: form.value.aliases.split(/[\n、，,]/).map(value => value.trim()).filter(Boolean),
    }, editingId.value)
    query.value = ''
    editing.value = false
    emit('saved', company)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存公司失败'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Panel title="投标公司">
    <div class="flex flex-wrap items-end gap-3">
      <label v-if="directory.items.length" class="min-w-40 flex-1 text-xs">
        搜索公司
        <input v-model="query" :disabled="disabled" type="search"
          class="mt-1 w-full rounded-md border border-border bg-background px-2 py-2"
          placeholder="公司名称、别名或信用代码" />
      </label>
      <label class="min-w-48 flex-[2] text-xs">
        当前公司
        <select :value="modelValue" :disabled="disabled"
          class="mt-1 w-full rounded-md border border-border bg-background px-2 py-2"
          @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)">
          <option value="" disabled>{{ options.length ? '请选择公司' : '暂无可访问的公司' }}</option>
          <option v-if="directory.legacyAvailable" value="legacy">历史投标资料库</option>
          <option v-for="item in options" :key="item.id" :value="item.id">
            {{ item.name }} · {{ item.creditCode }}{{ item.active ? '' : '（已停用）' }}
          </option>
        </select>
      </label>
      <button v-if="directory.canCreate" class="kb-btn-secondary" :disabled="disabled"
        type="button" @click="openEditor()"><Plus class="size-3.5" />新增公司</button>
      <button v-if="directory.canCreate && selected" class="kb-btn-secondary" :disabled="disabled"
        type="button" @click="openEditor(selected)"><Pencil class="size-3.5" />编辑公司</button>
      <button v-if="selected?.active && selected.canManage" class="kb-btn-secondary"
        :disabled="disabled" type="button" @click="acl = selected"><Shield class="size-3.5" />资料权限</button>
    </div>

    <p v-if="modelValue === 'legacy'" class="mt-3 text-xs text-muted-foreground">
      这里显示旧库中的资料及原有按账号归档。新公司的常备资料请在对应公司下维护。
    </p>
    <p v-else-if="selected && !selected.active" class="mt-3 text-xs text-muted-foreground">
      该公司已停用。启用后可以继续查看、维护和检索原有资料。
    </p>
    <p v-else-if="selected?.aliases.length" class="mt-3 text-xs text-muted-foreground">
      别名 {{ selected.aliases.join('、') }}
    </p>

  </Panel>
  <Teleport to="body">
    <div v-if="editing" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4"
      @click.self="!saving && (editing = false)">
      <form role="dialog" aria-modal="true" aria-labelledby="company-editor-title"
        class="grid w-full max-w-md gap-3 rounded-xl border border-border bg-card p-4"
        @keydown.esc="!saving && (editing = false)" @submit.prevent="saveCompany">
        <h3 id="company-editor-title" class="text-sm font-semibold">{{ editingId ? '编辑公司档案' : '新增投标公司' }}</h3>
        <label class="text-xs">法定全称
          <input v-model="form.name" required maxlength="110"
            class="mt-1 block w-full rounded-md border border-border bg-background px-2 py-2" />
        </label>
        <label class="text-xs">统一社会信用代码
          <input v-model="form.creditCode" required maxlength="18" minlength="18"
            class="mt-1 block w-full rounded-md border border-border bg-background px-2 py-2" />
        </label>
        <label class="text-xs">公司别名（每行一个）
          <textarea v-model="form.aliases" rows="2"
            class="mt-1 block w-full rounded-md border border-border bg-background px-2 py-2" />
        </label>
        <label class="flex items-center gap-2 text-xs">
          <input v-model="form.active" type="checkbox" />启用公司资料库
        </label>
        <p v-if="error" role="alert" class="text-xs text-sulfur">{{ error }}</p>
        <div class="flex justify-end gap-2">
          <button class="kb-btn-secondary" type="button" :disabled="saving" @click="editing = false">取消</button>
          <button class="kb-btn-primary" type="submit" :disabled="saving">{{ saving ? '保存中…' : '保存公司' }}</button>
        </div>
      </form>
    </div>
  </Teleport>
  <KbAclDialog v-if="acl" :open="true" :base-id="acl.baseId" :base-name="acl.name" @close="acl = undefined" />
</template>
