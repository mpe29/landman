import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

export const api = {
  async getProperties() {
    const { data, error } = await supabase.from('properties_geo').select('*')
    if (error) throw error
    return data
  },

  async getAreas(propertyId) {
    const { data, error } = await supabase
      .from('areas_geo')
      .select('*')
      .eq('property_id', propertyId)
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

  async createObservation(observation) {
    const { data, error } = await supabase
      .from('observations')
      .insert(observation)
      .select()
    if (error) throw error
    return data[0]
  },
}
