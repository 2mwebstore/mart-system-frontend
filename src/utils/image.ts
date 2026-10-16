// Shrinks a photo in the browser before it's stored as a data URL (there's no
// object storage yet — see docs/DECISIONS.md), so a 6 MB phone photo of a
// bank slip becomes ~150–400 KB. Keeps the aspect ratio; never enlarges.
export async function shrinkImage(file: File, maxSide = 1600, quality = 0.82): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('not an image'))
      el.src = url
    })
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no canvas')
    ctx.fillStyle = '#fff' // transparent PNGs get a white background as JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    URL.revokeObjectURL(url)
  }
}

// A company logo: at most 512 px on its longest side. PNG / WebP / GIF stay
// PNG so a transparent background stays transparent; a JPEG stays JPEG.
export async function shrinkLogo(file: File, maxSide = 512): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('not an image'))
      el.src = url
    })
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('not an image')
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no canvas')
    const jpeg = file.type === 'image/jpeg'
    if (jpeg) {
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return jpeg ? canvas.toDataURL('image/jpeg', 0.9) : canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}
