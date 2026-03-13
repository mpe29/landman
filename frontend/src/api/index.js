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

  async getPointAssets(propertyId) {
    const { data, error } = await supabase
      .from('point_assets_geo')
      .select('*')
      .eq('property_id', propertyId)
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
  // Writes — use RPC functions so PostGIS can parse GeoJSON geometry
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
}
