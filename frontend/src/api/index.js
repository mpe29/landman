import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

// ---------------------------------------------------------------------------
// Thumbnail generation — create a small JPEG alongside the full-res original.
// Used by ImageStrip / FeaturePanel so browsers download ~20–40 KB instead of
// the full 3–12 MB original.  Lightbox still loads the original URL.
// ---------------------------------------------------------------------------
const THUMB_MAX = 400
const THUMB_QUALITY = 0.70

function createThumbnail(file) {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) return resolve(null)
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      const scale = THUMB_MAX / Math.max(width, height)
      if (scale >= 1) {
        // Image already small — just use it as its own thumbnail
        return resolve(null)
      }
      width = Math.round(width * scale)
      height = Math.round(height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => resolve(blob || null),
        'image/jpeg',
        THUMB_QUALITY,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}

export const api = {
  // ---------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------
  async signUp({ email, password, fullName }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    })
    if (error) throw error
    return data
  },

  async signIn({ email, password }) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  },

  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  async getSession() {
    const { data: { session } } = await supabase.auth.getSession()
    return session
  },

  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback)
  },

  async getProfile() {
    const { data, error } = await supabase.from('profiles').select('*').single()
    if (error) throw error
    return data
  },

  async getProfileById(userId) {
    const { data, error } = await supabase.rpc('get_user_profile', { p_user_id: userId })
    if (error) throw error
    return data
  },

  async updateProfile(updates) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')
    const { error } = await supabase
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', user.id)
    if (error) throw error
  },

  async uploadProfileImage(file, fieldName) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${user.id}/${fieldName}.${ext}`
    const { error: uploadErr } = await supabase.storage
      .from('profile-images')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (uploadErr) throw uploadErr
    // Private bucket — use signed URL (1 hour expiry)
    const { data: signedData, error: signErr } = await supabase.storage
      .from('profile-images')
      .createSignedUrl(path, 3600)
    if (signErr) throw signErr
    // Store the path, not the signed URL — we'll generate fresh signed URLs on read
    return path
  },

  // Generate a signed URL for a private profile image path
  async getProfileImageUrl(path) {
    if (!path) return null
    // If it's already a full URL (legacy public bucket), return as-is
    if (path.startsWith('http')) return path
    const { data, error } = await supabase.storage
      .from('profile-images')
      .createSignedUrl(path, 3600) // 1 hour
    if (error) return null
    return data.signedUrl
  },

  // ---------------------------------------------------------------
  // Memberships — current user's property access
  // ---------------------------------------------------------------
  async getMyMemberships() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    const { data, error } = await supabase
      .from('property_members')
      .select('*, properties(id, name)')
      .eq('user_id', user.id)
      .eq('status', 'approved')
    if (error) throw error
    return data
  },

  // ---------------------------------------------------------------
  // User Management (admin)
  // ---------------------------------------------------------------
  async createMember({ propertyId, fullName, role }) {
    const { data, error } = await supabase.functions.invoke('create-member', {
      body: { propertyId, fullName, role },
    })
    if (error) throw new Error(error.message || 'Failed to create member')
    return data
  },

  async updatePin(memberId, newPin) {
    const { data, error } = await supabase.functions.invoke('update-pin', {
      body: { memberId, newPin: newPin || undefined },
    })
    if (error) throw new Error(error.message || 'Failed to update PIN')
    return data
  },

  async getPropertyMembers(propertyId) {
    const { data, error } = await supabase
      .from('property_members')
      .select('*, profiles(full_name, email)')
      .eq('property_id', propertyId)
      .order('created_at')
    if (error) throw error
    return data
  },

  async updateMemberRole(memberId, role, isAdmin) {
    const updates = {}
    if (role !== undefined) updates.role = role
    if (isAdmin !== undefined) updates.is_admin = isAdmin
    const { error } = await supabase
      .from('property_members')
      .update(updates)
      .eq('id', memberId)
    if (error) throw error
  },

  async removeMember(memberId) {
    const { error } = await supabase
      .from('property_members')
      .delete()
      .eq('id', memberId)
    if (error) throw error
  },

  async getPendingCount(propertyId) {
    const { count, error } = await supabase
      .from('property_members')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', propertyId)
      .eq('status', 'pending')
    if (error) throw error
    return count || 0
  },

  // ---------------------------------------------------------------
  // Join flow (public — resolve token to sign in)
  // ---------------------------------------------------------------
  async resolveJoinToken(token) {
    const { data, error } = await supabase.functions.invoke('resolve-join', {
      body: { token },
    })
    if (error) throw new Error(error.message || 'Invalid link')
    return data
  },

  async lookupPinUser(name) {
    const { data, error } = await supabase.functions.invoke('lookup-pin-user', {
      body: { name },
    })
    if (error) throw new Error(error.message || 'Name not found')
    return data
  },

  // ---------------------------------------------------------------
  // Reads — query the *_geo views which return GeoJSON geometry
  // ---------------------------------------------------------------
  async getProperties() {
    const { data, error } = await supabase.from('properties_geo').select('*')
    if (error) throw error
    return data
  },

  // propertyId optional — omit to load all areas (used by map)
  async getAreas(propertyId) {
    let q = supabase.from('areas_geo').select('*')
    if (propertyId) q = q.eq('property_id', propertyId)
    const { data, error } = await q
    if (error) throw error
    return data
  },

  async getLinearAssets(propertyId) {
    const { data, error } = await supabase
      .from('linear_assets_geo')
      .select('*')
      .eq('property_id', propertyId)
    if (error) throw error
    return data
  },

  // propertyId optional — omit to load all (used by map)
  async getPointAssets(propertyId) {
    let q = supabase.from('point_assets_geo').select('*')
    if (propertyId) q = q.eq('property_id', propertyId)
    const { data, error } = await q
    if (error) throw error
    return data
  },

  async getObservations(propertyId) {
    let q = supabase.from('observations_geo').select('*').order('observed_at', { ascending: false })
    if (propertyId) q = q.eq('property_id', propertyId)
    const { data: obs, error: obsErr } = await q
    if (obsErr) throw obsErr
    if (!obs.length) return obs

    // Fetch tags for all observations and join client-side
    const ids = obs.map((o) => o.id)
    const { data: tags, error: tagErr } = await supabase
      .from('observation_tags')
      .select('observation_id, tag_type_id')
      .in('observation_id', ids)
    if (tagErr) throw tagErr

    const tagMap = {}
    tags.forEach((t) => {
      if (!tagMap[t.observation_id]) tagMap[t.observation_id] = []
      tagMap[t.observation_id].push(t.tag_type_id)
    })
    return obs.map((o) => ({ ...o, tag_ids: tagMap[o.id] || [] }))
  },

  // Operations = events/campaigns (e.g. "North Fence Build 2025")
  async getOperations(propertyId) {
    let q = supabase.from('operations').select('*').order('started_at', { ascending: false })
    if (propertyId) q = q.eq('property_id', propertyId)
    const { data, error } = await q
    if (error) throw error
    return data
  },

  // ---------------------------------------------------------------
  // Creates — use RPC functions so PostGIS can parse GeoJSON geometry
  // ---------------------------------------------------------------
  async createProperty({ name, owner, boundary }) {
    const { data, error } = await supabase.rpc('create_property', {
      p_name:     name,
      p_owner:    owner || null,
      p_boundary: boundary || null,
    })
    if (error) throw error
    return data
  },

  async createArea({ propertyId, parentId, level, name, type, notes, boundary }) {
    const { data, error } = await supabase.rpc('create_area', {
      p_property_id: propertyId,
      p_parent_id:   parentId || null,
      p_level:       level || 'camp',
      p_name:        name,
      p_type:        type || null,
      p_notes:       notes || null,
      p_boundary:    boundary || null,
    })
    if (error) throw error
    return data
  },

  async createLinearAsset({ propertyId, name, type, condition, notes, geom }) {
    const { data, error } = await supabase.rpc('create_linear_asset', {
      p_property_id: propertyId,
      p_name:        name,
      p_type:        type || null,
      p_condition:   condition || null,
      p_notes:       notes || null,
      p_geom:        geom || null,
    })
    if (error) throw error
    return data
  },

  async createPointAsset({ propertyId, name, type, condition, notes, geom }) {
    const { data, error } = await supabase.rpc('create_point_asset', {
      p_property_id: propertyId,
      p_name:        name,
      p_type:        type || null,
      p_condition:   condition || null,
      p_notes:       notes || null,
      p_geom:        geom || null,
    })
    if (error) throw error
    return data
  },

  async createObservation({ propertyId, operationId, geom, observedAt, type, notes, imageUrl, bearing, imageHash }) {
    const { data, error } = await supabase.rpc('create_observation', {
      p_property_id:  propertyId,
      p_operation_id: operationId || null,
      p_geom:         geom || null,
      p_observed_at:  observedAt || null,
      p_type:         type || null,
      p_notes:        notes || null,
      p_image_url:    imageUrl || null,
      p_bearing:      bearing ?? null,
      p_image_hash:   imageHash || null,
    })
    if (error) throw error
    return data
  },

  async createOperation({ propertyId, name, type, startedAt, notes }) {
    const { data, error } = await supabase
      .from('operations')
      .insert({
        property_id: propertyId,
        name,
        type:       type || null,
        started_at: startedAt || null,
        notes:      notes || null,
      })
      .select()
    if (error) throw error
    return data[0]
  },

  // ---------------------------------------------------------------
  // Storage — observation images
  // ---------------------------------------------------------------

  // Hash raw file bytes for duplicate detection.
  // Uses SHA-256 (crypto.subtle) when available (HTTPS / localhost).
  // Falls back to a pure-JS FNV-1a 64-bit hash on plain-HTTP contexts where
  // crypto.subtle is blocked — prefixed "fnv:" so values never collide with
  // SHA-256 hashes stored by secure-context uploads.
  async hashFile(file) {
    const buffer = await file.arrayBuffer()
    if (crypto?.subtle) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
      return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    }
    // Pure-JS FNV-1a 64-bit (two 32-bit halves)
    const bytes = new Uint8Array(buffer)
    let h1 = 0x811c9dc5 >>> 0
    let h2 = 0xc4ceb9fe >>> 0
    for (let i = 0; i < bytes.length; i++) {
      h1 = Math.imul(h1 ^ bytes[i], 0x01000193) >>> 0
      h2 = Math.imul(h2 ^ bytes[i], 0x811c9dc5) >>> 0
    }
    return 'fnv:' + h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')
  },

  // Returns the existing observation row if this hash already exists for the
  // property, otherwise null. Callers use this to warn before re-uploading.
  async findDuplicateObservation(propertyId, imageHash) {
    const { data, error } = await supabase
      .from('observations')
      .select('id, observed_at, image_url')
      .eq('property_id', propertyId)
      .eq('image_hash', imageHash)
      .maybeSingle()
    if (error) throw error
    return data   // null = no duplicate
  },

  async uploadObservationImage(file) {
    const ext  = file.name.split('.').pop().toLowerCase()
    const baseName = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const path = `${baseName}.${ext}`

    // Upload full-res original
    const { error } = await supabase.storage
      .from('observation-images')
      .upload(path, file, { upsert: false })
    if (error) throw error
    const { data } = supabase.storage.from('observation-images').getPublicUrl(path)

    // Upload thumbnail alongside (best-effort, don't block on failure).
    // Convention: thumb/<baseName>.jpg — frontend derives this from image_url.
    createThumbnail(file).then((blob) => {
      if (!blob) return
      supabase.storage
        .from('observation-images')
        .upload(`thumb/${baseName}.jpg`, blob, { upsert: false, contentType: 'image/jpeg' })
        .catch(() => {}) // silent — original still works
    })

    return data.publicUrl
  },

  // ---------------------------------------------------------------
  // Updates — no geometry, direct table access
  // ---------------------------------------------------------------
  async updateArea(id, { name, type, notes }) {
    const { error } = await supabase
      .from('areas')
      .update({ name, type: type || null, notes: notes || null })
      .eq('id', id)
    if (error) throw error
  },

  async updateAreaBoundary(id, boundary) {
    const { error } = await supabase.rpc('update_area_boundary', {
      p_id:       id,
      p_boundary: boundary,
    })
    if (error) throw error
  },

  async updateProperty(id, { name, owner }) {
    const { error } = await supabase
      .from('properties')
      .update({ name, owner: owner || null })
      .eq('id', id)
    if (error) throw error
  },

  async updatePropertyBoundary(id, boundary) {
    const { error } = await supabase.rpc('update_property_boundary', {
      p_id:       id,
      p_boundary: boundary,
    })
    if (error) throw error
  },

  async updatePointAsset(id, { name, type, condition, notes }) {
    const { error } = await supabase
      .from('point_assets')
      .update({ name, type: type || null, condition: condition || null, notes: notes || null })
      .eq('id', id)
    if (error) throw error
  },

  async updateObservation(id, { notes }) {
    const { error } = await supabase
      .from('observations')
      .update({ notes: notes || null })
      .eq('id', id)
    if (error) throw error
  },

  // ---------------------------------------------------------------
  // Observation tags
  // ---------------------------------------------------------------
  async getObservationTagTypes(propertyId) {
    // Returns global tags + property-specific tags (if propertyId given)
    let q = supabase
      .from('observation_tag_types')
      .select('*')
      .order('sort_order')
      .order('name')
    if (propertyId) {
      q = q.or(`property_id.is.null,property_id.eq.${propertyId}`)
    } else {
      q = q.is('property_id', null)
    }
    const { data, error } = await q
    if (error) throw error
    return data
  },

  async getObservationTags(observationId) {
    // Returns full tag_type objects for one observation
    const { data, error } = await supabase
      .from('observation_tags')
      .select('tag_type_id, observation_tag_types(id, name, emoji, color)')
      .eq('observation_id', observationId)
    if (error) throw error
    return data.map((row) => row.observation_tag_types).filter(Boolean)
  },

  async addObservationTag(observationId, tagTypeId) {
    const { error } = await supabase
      .from('observation_tags')
      .insert({ observation_id: observationId, tag_type_id: tagTypeId })
    if (error && error.code !== '23505') throw error // 23505 = duplicate, ignore
  },

  async removeObservationTag(observationId, tagTypeId) {
    const { error } = await supabase
      .from('observation_tags')
      .delete()
      .eq('observation_id', observationId)
      .eq('tag_type_id', tagTypeId)
    if (error) throw error
  },

  async createObservationTagType({ propertyId, name, emoji, color }) {
    const { data, error } = await supabase
      .from('observation_tag_types')
      .insert({
        property_id: propertyId || null,
        name,
        emoji: emoji || '📌',
        color: color || '#6b7280',
      })
      .select()
      .single()
    if (error) throw error
    return data
  },

  // ---------------------------------------------------------------
  // Livestock
  // ---------------------------------------------------------------
  async getLivestockTypes() {
    const { data, error } = await supabase
      .from('livestock_types')
      .select('*')
      .order('category')
      .order('common_name')
    if (error) throw error
    return data
  },

  async getBreeds(typeId) {
    const { data, error } = await supabase
      .from('breeds')
      .select('*')
      .eq('livestock_type_id', typeId)
      .order('name')
    if (error) throw error
    return data
  },

  async getLivestockCampCounts(propertyId) {
    let q = supabase.from('livestock_camp_counts').select('*')
    if (propertyId) q = q.eq('property_id', propertyId)
    const { data, error } = await q
    if (error) throw error
    return data
  },

  async getLivestockForCamp(campId) {
    const { data, error } = await supabase
      .from('livestock_alive_counts')
      .select('*')
      .eq('camp_id', campId)
      .order('created_at')
    if (error) throw error
    return data
  },

  async createLivestock({ propertyId, campId, typeId, breedId, isGroup, headCount, sex, dob, tagNumber, acquiredAt, notes }) {
    const { data, error } = await supabase.rpc('create_livestock', {
      p_property_id:       propertyId,
      p_camp_id:           campId       || null,
      p_livestock_type_id: typeId       || null,
      p_breed_id:          breedId      || null,
      p_is_group:          isGroup      ?? true,
      p_head_count:        headCount    || 1,
      p_sex:               sex          || null,
      p_dob:               dob          || null,
      p_tag_number:        tagNumber    || null,
      p_acquired_at:       acquiredAt   || null,
      p_notes:             notes        || null,
    })
    if (error) throw error
    return data
  },

  async createLivestockEvent({ livestockId, eventType, eventDate, headCount, campFrom, campTo, notes }) {
    const { data, error } = await supabase.rpc('create_livestock_event', {
      p_livestock_id: livestockId,
      p_event_type:   eventType,
      p_event_date:   eventDate   || new Date().toISOString().slice(0, 10),
      p_head_count:   headCount   || 1,
      p_camp_from:    campFrom    || null,
      p_camp_to:      campTo      || null,
      p_notes:        notes       || null,
    })
    if (error) throw error
    return data
  },

  async updateLivestock(id, { campId, notes }) {
    const updates = {}
    if (campId !== undefined) updates.camp_id = campId
    if (notes  !== undefined) updates.notes   = notes || null
    const { error } = await supabase.from('livestock').update(updates).eq('id', id)
    if (error) throw error
  },

  async deleteLivestock(id) {
    const { error } = await supabase.from('livestock').delete().eq('id', id)
    if (error) throw error
  },

  // ---------------------------------------------------------------
  // Devices / IoT
  // ---------------------------------------------------------------
  // Devices / IoT
  // ---------------------------------------------------------------
  async getDeviceTypes() {
    const { data, error } = await supabase.from('device_types').select('*').order('name')
    if (error) throw error
    return data
  },

  async getDevicePositions() {
    const { data, error } = await supabase.from('device_positions').select('*')
    if (error) throw error
    return data
  },

  async getDevices() {
    const { data, error } = await supabase
      .from('devices')
      .select('*, device_types(name, category, icon)')
      .order('active', { ascending: false })
      .order('last_seen_at', { ascending: false, nullsFirst: false })
    if (error) throw error
    return data
  },

  async updateDevice(id, { name, active, notes, areaId, deviceTypeId }) {
    const updates = {}
    if (name         !== undefined) updates.name           = name
    if (active       !== undefined) updates.active         = active
    if (notes        !== undefined) updates.notes          = notes || null
    if (areaId       !== undefined) updates.area_id        = areaId || null
    if (deviceTypeId !== undefined) updates.device_type_id = deviceTypeId || null
    const { error } = await supabase.from('devices').update(updates).eq('id', id)
    if (error) throw error
  },

  async backfillDeviceReadings(deviceId) {
    const { data, error } = await supabase.rpc('backfill_device_readings', { p_device_id: deviceId })
    if (error) throw error
    return data // integer — number of rows updated
  },

  async getDeviceReadings(deviceId, limit = 20) {
    const { data, error } = await supabase
      .from('sensor_readings')
      .select('id, received_at, device_time, lat, lng, battery_pct, rssi, snr, extra')
      .eq('device_id', deviceId)
      .order('received_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data
  },

  // Time-filtered readings for multiple devices (ascending for trail drawing)
  async getDeviceReadingsForDevices(deviceIds, from, to, limit = 5000) {
    let q = supabase
      .from('sensor_readings')
      .select('id, device_id, received_at, lat, lng, battery_pct, rssi, snr, extra')
      .in('device_id', deviceIds)
      .not('lat', 'is', null)
      .order('received_at', { ascending: true })
    if (from) q = q.gte('received_at', from)
    if (to) q = q.lte('received_at', to)
    if (limit) q = q.limit(limit)
    const { data, error } = await q
    if (error) throw error
    return data
  },

  // Routing devices (gateways, starlinks, relays)
  async getRoutingDevices() {
    const { data, error } = await supabase
      .from('devices')
      .select('*, device_types!inner(name, category, icon)')
      .eq('device_types.category', 'routing')
      .order('last_seen_at', { ascending: false, nullsFirst: false })
    if (error) throw error
    return data
  },

  // Routing log: which end devices pinged through a given routing device
  // gateway_id in sensor_readings may be the EUI or the TTN gateway_id,
  // so we query by the device's dev_eui (matches EUI) OR metadata gateway_id
  async getRoutingLog(gatewayEui, limit = 50) {
    const { data, error } = await supabase
      .from('routing_log')
      .select('*')
      .or(`gateway_id.eq.${gatewayEui},gateway_id.eq.${gatewayEui.toLowerCase()}`)
      .order('received_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    // If no results, try looking up the TTN gateway_id from device metadata
    if (data.length === 0) {
      const { data: dev } = await supabase
        .from('devices')
        .select('metadata')
        .eq('dev_eui', gatewayEui)
        .maybeSingle()
      const ttnGwId = dev?.metadata?.gateway_id
      if (ttnGwId && ttnGwId !== gatewayEui) {
        const { data: fallback, error: fbErr } = await supabase
          .from('routing_log')
          .select('*')
          .eq('gateway_id', ttnGwId)
          .order('received_at', { ascending: false })
          .limit(limit)
        if (!fbErr && fallback.length > 0) return fallback
      }
    }
    return data
  },

  // Manual placement of a device on the map (primarily for routing devices)
  async updateDeviceLocation(id, { lat, lng }) {
    const { error } = await supabase
      .from('devices')
      .update({ last_lat: lat, last_lng: lng })
      .eq('id', id)
    if (error) throw error
  },

  // ---------------------------------------------------------------
  // Deletes
  // ---------------------------------------------------------------
  async deleteArea(id) {
    const { error } = await supabase.from('areas').delete().eq('id', id)
    if (error) throw error
  },

  async deleteProperty(id) {
    const { error } = await supabase.from('properties').delete().eq('id', id)
    if (error) throw error
  },

  async deletePointAsset(id) {
    const { error } = await supabase.from('point_assets').delete().eq('id', id)
    if (error) throw error
  },

  async deleteObservation(id) {
    const { error } = await supabase.from('observations').delete().eq('id', id)
    if (error) throw error
  },
}
