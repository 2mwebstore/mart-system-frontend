import { describe, expect, it } from 'vitest'
import { plainText } from './richText'

describe('plainText (a rich-text note on one line)', () => {
  it('is empty for no note', () => {
    expect(plainText('')).toBe('')
    expect(plainText(null)).toBe('')
    expect(plainText(undefined)).toBe('')
  })

  it('keeps an older plain note, on one line', () => {
    expect(plainText('Fuel for the van\nand tolls')).toBe('Fuel for the van and tolls')
    expect(plainText('a < b & c')).toBe('a < b & c')
  })

  it('drops tags and runs paragraphs and list items together', () => {
    expect(plainText('<p>Fuel <strong>van</strong></p><ul><li>tolls</li><li>parking</li></ul>')).toBe('Fuel van tolls parking')
    expect(plainText('<p>one<br>two</p><h3>three</h3>')).toBe('one two three')
  })

  it('decodes entities', () => {
    expect(plainText('<p>Tom &amp; Jerry &lt;3</p>')).toBe('Tom & Jerry <3')
  })

  it('leaves out script and style text', () => {
    expect(plainText('<p>ok</p><script>alert(1)</script><style>p{}</style>')).toBe('ok')
  })
})
