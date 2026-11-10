// Rich-text notes (HTML from RichTextEditor) in places that show one line of
// plain text, such as a list's Note column. RichText.vue shows the note itself.

const HAS_TAGS = /<\/?[a-z][\s\S]*>/i

// The note's words on one line: tags dropped, entities decoded, paragraphs and
// list items run together with a space. Older notes are plain text already.
export function plainText(html: string | null | undefined): string {
  if (!html) return ''
  if (!HAS_TAGS.test(html)) return html.replace(/\s+/g, ' ').trim()
  const spaced = html.replace(/<br\s*\/?>|<\/(p|li|h3|h4|blockquote)\s*>/gi, ' ')
  // Parsing with DOMParser runs nothing: no scripts, no image loads.
  const doc = new DOMParser().parseFromString(spaced, 'text/html')
  doc.querySelectorAll('script, style').forEach((n) => n.remove())
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}
