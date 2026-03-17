// Derive a thumbnail URL from a Supabase observation-images public URL.
// Convention: thumbnails are stored at  thumb/<baseName>.jpg
// alongside the original at  <baseName>.<ext>
//
// Falls back to the original URL if the pattern doesn't match.
export function thumbUrl(imageUrl) {
  if (!imageUrl) return imageUrl
  const marker = '/observation-images/'
  const idx = imageUrl.lastIndexOf(marker)
  if (idx === -1) return imageUrl
  const base = imageUrl.slice(0, idx + marker.length)
  const filename = imageUrl.slice(idx + marker.length)
  const baseName = filename.replace(/\.[^.]+$/, '')
  return `${base}thumb/${baseName}.jpg`
}
