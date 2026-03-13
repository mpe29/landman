import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import 'mapbox-gl/dist/mapbox-gl.css'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import { api } from '../api'
import { POINT_TYPES, POINT_DRAW_MODES } from '../constants/pointTypes'
import { ACTIVE_LAYERS } from '../constants/layers'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

// Build a Mapbox match expression for point asset type → color
const POINT_COLOR_EXPR = [
  'match', ['get', 'type'],
  ...POINT_TYPES.flatMap((pt) => [pt.id, pt.color]),
  '#94a3b8', // fallback
]

// Fetch all spatial data and partition into layer buckets
async function loadAllData() {
  const [properties, areas, pointAssets, observations] = await Promise.all([
    api.getProperties(),
    api.getAreas(),
    api.getPointAssets(),
    api.getObservations(),
  ])
  return {
    properties,
    farms:        areas.filter((a) => a.level === 'farm'),
    camps:        areas.filter((a) => a.level === 'camp'),
    point_assets: pointAssets,
    observations,
  }
}

// Convert DB rows to GeoJSON FeatureCollection
function toFC(items, geomKey = 'boundary') {
  return {
    type: 'FeatureCollection',
    features: items
      .filter((x) => x[geomKey])
      .map((x) => ({
        type: 'Feature',
        geometry: x[geomKey],
        // Spread all non-geometry fields into properties so FeaturePanel gets them
        properties: Object.fromEntries(
          Object.entries(x).filter(([k]) => k !== geomKey && k !== 'boundary')
        ),
      })),
  }
}

export default function Map({ mode, reloadKey, layerVisibility, onDrawComplete, onDataLoaded, onFeatureClick }) {
  const mapContainer = useRef(null)
  const map          = useRef(null)
  const draw         = useRef(null)
  const [ready, setReady] = useState(false)

  // ── Init map & draw once ───────────────────────────────────────
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
      // Create sources + layers for every active layer in the registry
      ACTIVE_LAYERS.forEach((layer) => {
        map.current.addSource(layer.id, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })

        if (layer.type === 'polygon') {
          map.current.addLayer({
            id:     `${layer.id}-fill`,
            type:   'fill',
            source: layer.id,
            layout: { visibility: layer.defaultVisible ? 'visible' : 'none' },
            paint:  { 'fill-color': layer.color, 'fill-opacity': layer.fillOpacity },
          })
          map.current.addLayer({
            id:     `${layer.id}-outline`,
            type:   'line',
            source: layer.id,
            layout: { visibility: layer.defaultVisible ? 'visible' : 'none' },
            paint:  { 'line-color': layer.color, 'line-width': layer.lineWidth },
          })
          // Clicks on fill layer
          map.current.on('click', `${layer.id}-fill`, (e) => {
            onFeatureClick?.({ featureType: layer.featureType, data: e.features[0].properties })
          })
          map.current.on('mouseenter', `${layer.id}-fill`, () => { map.current.getCanvas().style.cursor = 'pointer' })
          map.current.on('mouseleave', `${layer.id}-fill`, () => { map.current.getCanvas().style.cursor = '' })

        } else if (layer.type === 'point') {
          map.current.addLayer({
            id:     `${layer.id}-circle`,
            type:   'circle',
            source: layer.id,
            layout: { visibility: layer.defaultVisible ? 'visible' : 'none' },
            paint:  {
              'circle-radius':        layer.circleRadius ?? 7,
              'circle-color':         layer.color === 'multi' ? POINT_COLOR_EXPR : layer.color,
              'circle-stroke-color':  '#fff',
              'circle-stroke-width':  1.5,
            },
          })
          map.current.on('click', `${layer.id}-circle`, (e) => {
            onFeatureClick?.({ featureType: layer.featureType, data: e.features[0].properties })
          })
          map.current.on('mouseenter', `${layer.id}-circle`, () => { map.current.getCanvas().style.cursor = 'pointer' })
          map.current.on('mouseleave', `${layer.id}-circle`, () => { map.current.getCanvas().style.cursor = '' })

        } else if (layer.type === 'line') {
          map.current.addLayer({
            id:     `${layer.id}-line`,
            type:   'line',
            source: layer.id,
            layout: { visibility: layer.defaultVisible ? 'visible' : 'none' },
            paint:  { 'line-color': layer.color, 'line-width': layer.lineWidth },
          })
        }
      })

      setReady(true)
    })

    map.current.on('draw.create', (e) => {
      const geometry = e.features[0]?.geometry
      if (geometry) onDrawComplete(geometry)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync layer visibility from props ──────────────────────────
  useEffect(() => {
    if (!ready || !layerVisibility) return
    ACTIVE_LAYERS.forEach((layer) => {
      const vis = layerVisibility[layer.id] !== false ? 'visible' : 'none'
      const mapLayerIds =
        layer.type === 'polygon' ? [`${layer.id}-fill`, `${layer.id}-outline`]
        : layer.type === 'point' ? [`${layer.id}-circle`]
        : [`${layer.id}-line`]
      mapLayerIds.forEach((lid) => {
        if (map.current.getLayer(lid)) {
          map.current.setLayoutProperty(lid, 'visibility', vis)
        }
      })
    })
  }, [ready, layerVisibility])

  // ── Activate / deactivate draw mode ───────────────────────────
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

  // ── Load / reload all spatial data ────────────────────────────
  useEffect(() => {
    if (!ready) return

    loadAllData().then((buckets) => {
      // Feed each layer source
      map.current.getSource('properties')?.setData(toFC(buckets.properties))
      map.current.getSource('farms')?.setData(toFC(buckets.farms))
      map.current.getSource('camps')?.setData(toFC(buckets.camps))
      map.current.getSource('point_assets')?.setData(toFC(buckets.point_assets, 'geom'))
      map.current.getSource('observations')?.setData(toFC(buckets.observations, 'geom'))

      // Notify App with raw data for dropdowns
      onDataLoaded?.({
        properties: buckets.properties,
        farms:      buckets.farms,
        camps:      buckets.camps,
      })

      // Fit to all polygons on first load
      if (reloadKey === 0) {
        const allPolygons = [
          ...toFC(buckets.properties).features,
          ...toFC(buckets.farms).features,
          ...toFC(buckets.camps).features,
        ]
        if (allPolygons.length > 0) {
          const bounds = new mapboxgl.LngLatBounds()
          allPolygons.forEach((f) =>
            f.geometry.coordinates[0].forEach((c) => bounds.extend(c))
          )
          map.current.fitBounds(bounds, { padding: 60 })
        }
      }
    })
  }, [ready, reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
}
