'use client'
// Spec 011a §4.6 — pure UI for create + edit charity. Compose 011d
// primitives only; all state lives in useCharityForm.

import { AdminPageShell } from '@/components/cms/AdminPageShell'
import { DateTimeInput } from '@/components/cms/DateTimeInput'
import { FormField } from '@/components/cms/FormField'
import { Input } from '@/components/cms/Input'
import { MultiSelectChips } from '@/components/cms/MultiSelectChips'
import { NumberInput } from '@/components/cms/NumberInput'
import { Textarea } from '@/components/cms/Textarea'
import type { BackendCategoryItem } from '@/lib/schemas/categories'

import { useCharityForm, type FormState } from './useCharityForm'

type CharityFormProps = {
  mode: 'create' | 'edit'
  /** edit mode: PATCH target id */
  id?: string
  /** edit mode: seed reducer with this state via HYDRATE */
  initial?: FormState
  categories: BackendCategoryItem[]
}

export function CharityForm({ mode, id, initial, categories }: CharityFormProps) {
  const { form, dispatch, isValid, handleSubmit } = useCharityForm({ id, initial })

  const title = mode === 'create' ? '新增公益團體' : '編輯公益團體'
  const submitLabel = mode === 'create' ? '建立' : '儲存'

  return (
    <AdminPageShell
      title={title}
      backHref="/cms/charities"
      onSubmit={handleSubmit}
      actions={
        <button
          type="submit"
          disabled={!isValid}
          className="w-full h-11 rounded-full bg-brand text-white text-sm font-semibold
                     disabled:bg-black/10 disabled:text-ink-A
                     focus-visible:outline focus-visible:outline-2
                     focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {submitLabel}
        </button>
      }
    >
      <FormField id="name" label="名稱" required>
        <Input
          id="name"
          value={form.name}
          onChange={(v) => dispatch({ type: 'SET_NAME', value: v })}
          maxLength={120}
          required
        />
      </FormField>

      <FormField id="description" label="簡介" required>
        <Textarea
          id="description"
          value={form.description}
          onChange={(v) => dispatch({ type: 'SET_DESCRIPTION', value: v })}
          maxLength={500}
          rows={4}
          required
        />
      </FormField>

      <FormField id="contactPhone" label="聯絡電話">
        <Input
          id="contactPhone"
          type="tel"
          value={form.contactPhone}
          onChange={(v) => dispatch({ type: 'SET_CONTACT_PHONE', value: v })}
          maxLength={40}
          placeholder="例：02-12345678"
        />
      </FormField>

      <FormField id="contactEmail" label="聯絡 Email">
        <Input
          id="contactEmail"
          type="email"
          value={form.contactEmail}
          onChange={(v) => dispatch({ type: 'SET_CONTACT_EMAIL', value: v })}
          maxLength={254}
        />
      </FormField>

      <FormField id="officialWebsite" label="官方網站">
        <Input
          id="officialWebsite"
          type="url"
          value={form.officialWebsite}
          onChange={(v) => dispatch({ type: 'SET_OFFICIAL_WEBSITE', value: v })}
          maxLength={2048}
          placeholder="https://"
        />
      </FormField>

      <FormField id="approvalNo" label="勸募立案核准字號">
        <Input
          id="approvalNo"
          value={form.approvalNo}
          onChange={(v) => dispatch({ type: 'SET_APPROVAL_NO', value: v })}
          maxLength={100}
        />
      </FormField>

      <FormField
        id="displayOrder"
        label="顯示順序"
        hint="-1000 ~ 1000，數字小排前面，預設 0"
      >
        <NumberInput
          id="displayOrder"
          value={form.displayOrder}
          onChange={(v) => dispatch({ type: 'SET_DISPLAY_ORDER', value: v })}
          min={-1000}
          max={1000}
        />
      </FormField>

      <FormField
        id="publishStartAt"
        label="上架時間"
        hint="空白 = 立即生效"
      >
        <DateTimeInput
          id="publishStartAt"
          value={form.publishStartAt}
          onChange={(v) => dispatch({ type: 'SET_PUBLISH_START_AT', value: v })}
        />
      </FormField>

      <FormField
        id="publishEndAt"
        label="下架時間"
        hint="空白 = 永不下架；必須晚於上架時間"
      >
        <DateTimeInput
          id="publishEndAt"
          value={form.publishEndAt}
          onChange={(v) => dispatch({ type: 'SET_PUBLISH_END_AT', value: v })}
        />
      </FormField>

      <FormField
        id="categoryIds"
        label="類別"
        hint={`最多 16 個（目前 ${form.categoryIds.length} 個）`}
      >
        {/* MultiSelectChips 渲染為 button-group；FormField label 已用 htmlFor
            連到 categoryIds 雖然非 input element，仍維持 a11y associative。 */}
        <MultiSelectChips
          options={categories.map((c) => ({ value: c.id, label: c.displayName }))}
          value={form.categoryIds}
          onChange={(v) => dispatch({ type: 'SET_CATEGORY_IDS', value: v })}
          max={16}
          ariaLabel="類別"
        />
      </FormField>
    </AdminPageShell>
  )
}
