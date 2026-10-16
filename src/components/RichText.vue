<script setup lang="ts">
// Shows a rich-text note (HTML from RichTextEditor) safely: sanitised again in
// the browser with the same small allowlist the server uses. Older notes are
// plain text, so their line breaks are kept.
import { computed } from 'vue'
import DOMPurify from 'dompurify'

const props = defineProps<{ html: string | null | undefined }>()

const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'h3', 'h4', 'a']
const ALLOWED_ATTR = ['href', 'target', 'rel']

function escape(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
const safe = computed(() => {
  const v = props.html ?? ''
  if (!v) return ''
  if (!/<\/?[a-z][\s\S]*>/i.test(v)) return escape(v).replace(/\n/g, '<br>')
  return DOMPurify.sanitize(v, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i })
})
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- sanitised above -->
  <div class="rich-text" v-html="safe" />
</template>
