<script setup lang="ts">
// A small rich-text editor (Tiptap) for notes: bold, italic, underline,
// strike, bullet / numbered lists, quote, links, clear formatting, undo/redo.
// v-model is HTML; an empty editor gives "". The server sanitises what it
// stores (utils.SanitizeRichText) and RichText.vue sanitises again on display.
import { onBeforeUnmount, watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Bold, Italic, Link2, List, ListOrdered, Quote, Redo2, RemoveFormatting, Strikethrough, Underline, Undo2 } from 'lucide-vue-next'
import { t } from '@/i18n'

const props = withDefaults(defineProps<{ modelValue: string; label?: string; placeholder?: string; id?: string }>(), {
  label: '',
  placeholder: '',
  id: undefined,
})
const emit = defineEmits<{ 'update:modelValue': [string] }>()

// Old notes are plain text; keep their line breaks as paragraphs.
function toHtml(v: string) {
  if (!v) return ''
  if (/<\/?[a-z][\s\S]*>/i.test(v)) return v
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return v
    .split(/\n{2,}/)
    .map((para) => `<p>${esc(para).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

const editor = useEditor({
  content: toHtml(props.modelValue),
  extensions: [
    StarterKit.configure({
      heading: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'], HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } },
    }),
    Placeholder.configure({ placeholder: () => props.placeholder }),
  ],
  editorProps: {
    attributes: {
      class: 'rich-text min-h-[6rem] px-3 py-2 outline-none',
      role: 'textbox',
      'aria-multiline': 'true',
      ...(props.label ? { 'aria-label': props.label } : {}),
      ...(props.id ? { id: props.id } : {}),
    },
  },
  onUpdate: ({ editor: e }) => emit('update:modelValue', e.isEmpty ? '' : e.getHTML()),
})

// Outside changes (e.g. the form being reset) flow back into the editor.
watch(
  () => props.modelValue,
  (v) => {
    const e = editor.value
    if (!e) return
    const current = e.isEmpty ? '' : e.getHTML()
    if (v !== current) e.commands.setContent(toHtml(v), { emitUpdate: false })
  },
)
onBeforeUnmount(() => editor.value?.destroy())

function setLink() {
  const e = editor.value
  if (!e) return
  const previous = (e.getAttributes('link').href as string | undefined) ?? 'https://'
  const url = window.prompt(t('richText.linkPrompt'), previous)
  if (url === null) return
  const clean = url.trim()
  if (clean === '' || clean === 'https://') {
    e.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }
  if (!/^(https?:\/\/|mailto:)/i.test(clean)) {
    window.alert(t('richText.linkInvalid'))
    return
  }
  e.chain().focus().extendMarkRange('link').setLink({ href: clean }).run()
}

type Tool = { key: string; icon: unknown; label: string; active?: () => boolean; run: () => void; disabled?: () => boolean }
const tools: (Tool | 'sep')[] = [
  { key: 'bold', icon: Bold, label: t('richText.bold'), active: () => !!editor.value?.isActive('bold'), run: () => editor.value?.chain().focus().toggleBold().run() },
  { key: 'italic', icon: Italic, label: t('richText.italic'), active: () => !!editor.value?.isActive('italic'), run: () => editor.value?.chain().focus().toggleItalic().run() },
  { key: 'underline', icon: Underline, label: t('richText.underline'), active: () => !!editor.value?.isActive('underline'), run: () => editor.value?.chain().focus().toggleUnderline().run() },
  { key: 'strike', icon: Strikethrough, label: t('richText.strike'), active: () => !!editor.value?.isActive('strike'), run: () => editor.value?.chain().focus().toggleStrike().run() },
  'sep',
  { key: 'bullet', icon: List, label: t('richText.bulletList'), active: () => !!editor.value?.isActive('bulletList'), run: () => editor.value?.chain().focus().toggleBulletList().run() },
  { key: 'ordered', icon: ListOrdered, label: t('richText.orderedList'), active: () => !!editor.value?.isActive('orderedList'), run: () => editor.value?.chain().focus().toggleOrderedList().run() },
  { key: 'quote', icon: Quote, label: t('richText.quote'), active: () => !!editor.value?.isActive('blockquote'), run: () => editor.value?.chain().focus().toggleBlockquote().run() },
  { key: 'link', icon: Link2, label: t('richText.link'), active: () => !!editor.value?.isActive('link'), run: setLink },
  'sep',
  { key: 'clear', icon: RemoveFormatting, label: t('richText.clear'), run: () => editor.value?.chain().focus().unsetAllMarks().clearNodes().run() },
  { key: 'undo', icon: Undo2, label: t('richText.undo'), run: () => editor.value?.chain().focus().undo().run(), disabled: () => !editor.value?.can().undo() },
  { key: 'redo', icon: Redo2, label: t('richText.redo'), run: () => editor.value?.chain().focus().redo().run(), disabled: () => !editor.value?.can().redo() },
]
</script>

<template>
  <div>
    <label v-if="label" :for="id" class="block text-sm text-muted mb-1">{{ label }}</label>
    <div class="rounded-control border border-input-border bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
      <div class="flex flex-wrap items-center gap-0.5 border-b border-line px-1.5 py-1" role="toolbar" :aria-label="$t('richText.toolbar')">
        <template v-for="(tool, i) in tools" :key="typeof tool === 'string' ? `sep${i}` : tool.key">
          <span v-if="tool === 'sep'" class="mx-1 h-5 w-px bg-line" aria-hidden="true" />
          <button
            v-else
            type="button"
            class="p-1.5 rounded-control text-muted hover:text-ink hover:bg-surface-subtle disabled:opacity-40 disabled:hover:bg-transparent"
            :class="tool.active?.() ? 'bg-primary-tint text-primary-text' : ''"
            :aria-label="tool.label"
            :title="tool.label"
            :aria-pressed="tool.active ? tool.active() : undefined"
            :disabled="tool.disabled?.() ?? false"
            @mousedown.prevent
            @click="tool.run()"
          >
            <component :is="tool.icon" :stroke-width="1.8" class="w-4 h-4" />
          </button>
        </template>
      </div>
      <EditorContent :editor="editor" />
    </div>
  </div>
</template>

<style scoped>
:deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
  color: currentColor;
  opacity: 0.45;
}
</style>
