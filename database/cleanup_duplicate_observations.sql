-- ── Find and delete duplicate observations ─────────────────────────────────
-- Duplicates are identified by matching image_url within the same property.
-- For each group of duplicates, the OLDEST observation (earliest created_at)
-- is kept; all newer copies are deleted.
--
-- STEP 1: Preview — see what will be deleted (run this first!)
-- STEP 2: Delete — remove the duplicates
-- STEP 3: Cleanup storage — optional, removes orphaned image files
--
-- Run in Supabase SQL Editor.

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1: PREVIEW duplicates (safe — read-only)
-- ═══════════════════════════════════════════════════════════════════════════
-- Shows each duplicate group: how many copies, which one is kept, which deleted.

SELECT
  property_id,
  image_url,
  COUNT(*) AS copies,
  MIN(created_at) AS kept_created_at,
  ARRAY_AGG(id ORDER BY created_at) AS all_ids,
  (ARRAY_AGG(id ORDER BY created_at))[1] AS kept_id,
  ARRAY_REMOVE(ARRAY_AGG(id ORDER BY created_at), (ARRAY_AGG(id ORDER BY created_at))[1]) AS to_delete_ids
FROM observations
WHERE image_url IS NOT NULL
GROUP BY property_id, image_url
HAVING COUNT(*) > 1
ORDER BY copies DESC;


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2: DELETE duplicates (keeps the oldest of each group)
-- ═══════════════════════════════════════════════════════════════════════════
-- Uncomment and run after reviewing STEP 1 output.

/*
WITH duplicates AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY property_id, image_url
      ORDER BY created_at ASC
    ) AS rn
  FROM observations
  WHERE image_url IS NOT NULL
)
DELETE FROM observations
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);
*/


-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 3 (optional): Also find duplicates by image_hash
-- ═══════════════════════════════════════════════════════════════════════════
-- Some duplicates may have different image_urls but identical file content.
-- This catches re-uploads of the same photo that got a different storage path.

/*
SELECT
  property_id,
  image_hash,
  COUNT(*) AS copies,
  ARRAY_AGG(image_url ORDER BY created_at) AS image_urls,
  ARRAY_AGG(id ORDER BY created_at) AS all_ids,
  (ARRAY_AGG(id ORDER BY created_at))[1] AS kept_id
FROM observations
WHERE image_hash IS NOT NULL
GROUP BY property_id, image_hash
HAVING COUNT(*) > 1
ORDER BY copies DESC;
*/

-- To delete hash-based duplicates (keeps oldest):
/*
WITH hash_dupes AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY property_id, image_hash
      ORDER BY created_at ASC
    ) AS rn
  FROM observations
  WHERE image_hash IS NOT NULL
)
DELETE FROM observations
WHERE id IN (
  SELECT id FROM hash_dupes WHERE rn > 1
);
*/
