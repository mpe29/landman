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

  // propertyId optional — omit to load all point assets (used by map)
  async getPointAssets(propertyId) {
    let q = supabase.from('point_assets_geo').select('*')
    if (propertyId) q = q.eq('property_id', propertyId)
    const { data, error } = await q
    if (error) throw error
    return data
  },

  async getObservations(propertyId) {
    const { data, error } = await supabase
      .from('observations_geo')
      .select('*')
      .eq('property_id', propertyId)
    if (error) throw error
    return data
  },

  // ---------------------------------------------------------------
  // Creates — use RPC functions so PostGIS can parse GeoJSON geometry
  // ---------------------------------------------------------------
  async createProperty({ name, owner, boundary }) {
    const { data, error } = await supabase.rpc('create_property', {
      p_name: name,
      p_owner: owner || null,
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
      p_name: name,
      p_type: type || null,
      p_condition: condition || null,
      p_notes: notes || null,
      p_geom: geom || null,
    })
    if (error) throw error
    return data
  },

  async createPointAsset({ propertyId, name, type, condition, notes, geom }) {
    const { data, error } = await supabase.rpc('create_point_asset', {
      p_property_id: propertyId,
      p_name: name,
      p_type: type || null,
      p_condition: condition || null,
      p_notes: notes || null,
      p_geom: geom || null,
    })
    if (error) throw error
    return data
  },

  async createObservation(observation) {
    const { data, error } = await supabase
      .from('observations')
      .insert(observation)
      .select()
    if (error) throw error
    return data[0]
  },

  // ---------------------------------------------------------------
  // Updates — no geometry, so direct table access is fine
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
}
