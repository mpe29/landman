import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import 'mapbox-gl/dist/mapbox-gl.css'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import { api } from '../api'
import { POINT_TYPES, POINT_DRAW_MODES } from '../constants/pointTypes'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

const AREA_STYLE = {
  properties: { fill: '#4ade80', opacity: 0.10, line: '#4ade80', width: 2.5 },
  farms:      { fill: '#fbbf24', opacity: 0.12, line: '#fbbf24', width: 1.8 },
  camps:      { fill: '#60a5fa', opacity: 0.12, line: '#60a5fa', width: 1.2 },
}

export default function Map({ mode, reloadKey, onDrawComplete, onDataLoaded, onFeatureClick }) {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const draw = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (map.current) return

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [25, -25],
      zoom: 4,
    })

    draw.current = new MapboxDraw({ displayControlsDefault: false })
    map.current.addControl(draw.current)
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')

    map.current.on('load', () => {
      // Polygon layers (z-order: property → farm → camp)
      Object.entries(AREA_STYLE).forEach(([id, cfg]) => {
        map.current.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.current.addLayer({ id: `${id}-fill`, type: 'fill', source: id, paint: { 'fill-color': cfg.fill, 'fill-opacity': cfg.opacity } })
        map.current.addLayer({ id: `${id}-outline`, type: 'line', source: id, paint: { 'line-color': cfg.line, 'line-width': cfg.width } })
        map.current.on('click', `${id}-fill`, (e) => {
          const feat = e.features[0]
          onFeatureClick?.({ featureType: id === 'properties' ? 'property' : 'area', data: feat.properties })
        })
        map.current.on('mouseenter', `${id}-fill`, () => { map.current.getCanvas().style.cursor = 'pointer' })
        map.current.on('mouseleave', `${id}-fill`, () => { map.current.getCanvas().style.cursor = '' })
      })

      // Point asset layer — one source with expression-based colors
      map.current.addSource('point_assets', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

      // Build a match expression for per-type colors
      const colorMatch = ['match', ['get', 'type']]
      POINT_TYPES.forEach((pt) => colorMatch.push(pt.id, pt.color))
      colorMatch.push('#94a3b8') // default fallback

      map.current.addLayer({
        id: 'point_assets-circle',
        type: 'circle',
        source: 'point_assets',
        paint: {
          'circle-radius': 7,
          'circle-color': colorMatch,
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1.5,
        },
      })

      map.current.on('click', 'point_assets-circle', (e) => {
        const feat = e.features[0]
        onFeatureClick?.({ featureType: 'point_asset', data: feat.properties })
      })
      map.current.on('mouseenter', 'point_assets-circle', () => { map.current.getCanvas().style.cursor = 'pointer' })
      map.current.on('mouseleave', 'point_assets-circle', () => { map.current.getCanvas().style.cursor = '' })

      setReady(true)
    })

    map.current.on('draw.create', (e) => {
      const geometry = e.features[0]?.geometry
      if (geometry) onDrawComplete(geometry)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Activate / deactivate draw mode
  useEffect(() => {
    if (!ready || !draw.current) return
    const isPoint = POINT_DRAW_MODES.has(mode)
    if (mode !== 'view') {
      draw.current.deleteAll()
      draw.current.changeMode(isPoint ? 'draw_point' : 'draw_polygon')
      map.current.getCanvas().style.cursor = 'crosshair'
    } else {
      draw.current.changeMode('simple_select')
      draw.current.deleteAll()
      map.current.getCanvas().style.cursor = ''
    }
  }, [mode, ready])

  // Load / reload all spatial data
  useEffect(() => {
    if (!ready) return

    Promise.all([api.getProperties(), api.getAreas(), api.getPointAssets()]).then(([properties, areas, pointAssets]) => {
      const farms = areas.filter((a) => a.level === 'farm')
      const camps = areas.filter((a) => a.level === 'camp')

      const toPolygonFeatures = (items) =>
        items.filter((x) => x.boundary).map((x) => ({
          type: 'Feature',
          geometry: x.boundary,
          properties: { id: x.id, name: x.name, level: x.level ?? null, area_ha: x.area_ha ?? null, type: x.type ?? null, notes: x.notes ?? null, owner: x.owner ?? null, property_id: x.property_id ?? null, parent_id: x.parent_id ?? null },
        }))

      const pointFeatures = pointAssets.filter((x) => x.geom).map((x) => ({
        type: 'Feature',
        geometry: x.geom,
        properties: { id: x.id, name: x.name, type: x.type ?? null, condition: x.condition ?? null, notes: x.notes ?? null, property_id: x.property_id ?? null },
      }))

      map.current.getSource('properties')?.setData({ type: 'FeatureCollection', features: toPolygonFeatures(properties) })
      map.current.getSource('farms')?.setData({ type: 'FeatureCollection', features: toPolygonFeatures(farms) })
      map.current.getSource('camps')?.setData({ type: 'FeatureCollection', features: toPolygonFeatures(camps) })
      map.current.getSource('point_assets')?.setData({ type: 'FeatureCollection', features: pointFeatures })

      onDataLoaded?.({ properties, farms, camps })

      if (reloadKey === 0) {
        const all = [...toPolygonFeatures(properties), ...toPolygonFeatures(farms), ...toPolygonFeatures(camps)]
        if (all.length > 0) {
          const bounds = new mapboxgl.LngLatBounds()
          all.forEach((f) => f.geometry.coordinates[0].forEach((c) => bounds.extend(c)))
          map.current.fitBounds(bounds, { padding: 60 })
        }
      }
    })
  }, [ready, reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
}
