import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

export const api = {
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
    const { data, error } = await q
    if (error) throw error
    return data
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

  async createObservation({ propertyId, operationId, geom, observedAt, type, notes, imageUrl }) {
    const { data, error } = await supabase.rpc('create_observation', {
      p_property_id:  propertyId,
      p_operation_id: operationId || null,
      p_geom:         geom || null,
      p_observed_at:  observedAt || null,
      p_type:         type || null,
      p_notes:        notes || null,
      p_image_url:    imageUrl || null,
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
  async uploadObservationImage(file) {
    const ext  = file.name.split('.').pop().toLowerCase()
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage
      .from('observation-images')
      .upload(path, file, { upsert: false })
    if (error) throw error
    const { data } = supabase.storage.from('observation-images').getPublicUrl(path)
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

  async updateProperty(id, { name, owner }) {
    const { error } = await supabase
      .from('properties')
      .update({ name, owner: owner || null })
      .eq('id', id)
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
