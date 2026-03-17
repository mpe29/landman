#!/usr/bin/env node
/**
 * Backfill thumbnails for existing observation images in Supabase Storage.
 *
 * For each image in the observation-images bucket that doesn't have a
 * corresponding thumb/<baseName>.jpg, this script downloads the original,
 * resizes it to 400px max dimension at 70% JPEG quality, and uploads the
 * thumbnail.
 *
 * Usage:
 *   npm install sharp @supabase/supabase-js   # one-time
 *   node scripts/backfill-thumbnails.mjs
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_KEY env vars (service role key
 * to bypass RLS). Get the service key from Supabase Dashboard → Settings → API.
 *
 * Set DRY_RUN=1 to list what would be processed without uploading.
 */

import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars.')
  console.error('Get the service role key from: Supabase Dashboard → Settings → API → service_role')
  process.exit(1)
}

const DRY_RUN = process.env.DRY_RUN === '1'
const BUCKET = 'observation-images'
const THUMB_MAX = 400
const THUMB_QUALITY = 70

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function listAllFiles(prefix = '') {
  const files = []
  let offset = 0
  const limit = 100
  while (true) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw error
    if (!data || data.length === 0) break
    files.push(...data)
    offset += data.length
    if (data.length < limit) break
  }
  return files
}

async function run() {
  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Backfilling thumbnails...\n`)

  // List originals (top-level files, not in thumb/ folder)
  const originals = (await listAllFiles(''))
    .filter((f) => f.name && !f.name.startsWith('.') && f.id) // skip folders

  // List existing thumbs
  const existingThumbs = new Set()
  try {
    const thumbFiles = await listAllFiles('thumb')
    thumbFiles.forEach((f) => existingThumbs.add(f.name))
  } catch {
    // thumb folder may not exist yet
  }

  console.log(`Found ${originals.length} originals, ${existingThumbs.size} existing thumbnails\n`)

  let created = 0
  let skipped = 0
  let failed = 0

  for (const file of originals) {
    const baseName = file.name.replace(/\.[^.]+$/, '')
    const thumbName = `${baseName}.jpg`

    if (existingThumbs.has(thumbName)) {
      skipped++
      continue
    }

    console.log(`  Processing: ${file.name}`)

    if (DRY_RUN) {
      created++
      continue
    }

    try {
      // Download original
      const { data: blob, error: dlErr } = await supabase.storage
        .from(BUCKET)
        .download(file.name)
      if (dlErr) throw dlErr

      // Resize with sharp
      const buffer = Buffer.from(await blob.arrayBuffer())
      const thumbBuffer = await sharp(buffer)
        .resize(THUMB_MAX, THUMB_MAX, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: THUMB_QUALITY })
        .toBuffer()

      // Upload thumbnail
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(`thumb/${thumbName}`, thumbBuffer, {
          contentType: 'image/jpeg',
          upsert: false,
        })
      if (upErr) throw upErr

      const sizeMB = (buffer.length / 1_000_000).toFixed(1)
      const thumbKB = (thumbBuffer.length / 1_000).toFixed(0)
      console.log(`    ✓ ${sizeMB} MB → ${thumbKB} KB thumbnail`)
      created++
    } catch (err) {
      console.error(`    ✗ Failed: ${err.message}`)
      failed++
    }
  }

  console.log(`\nDone: ${created} created, ${skipped} already existed, ${failed} failed`)
}

run().catch((err) => { console.error(err); process.exit(1) })
