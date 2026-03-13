import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import 'mapbox-gl/dist/mapbox-gl.css'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import { api } from '../api'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

// Visual config per hierarchy level
const LAYER_STYLE = {
  properties: { fill: '#4ade80', opacity: 0.10, line: '#4ade80', width: 2.5 },
  farms:      { fill: '#fbbf24', opacity: 0.12, line: '#fbbf24', width: 1.8 },
  camps:      { fill: '#60a5fa', opacity: 0.12, line: '#60a5fa', width: 1.2 },
}

export default function Map({ mode, reloadKey, onDrawComplete, onDataLoaded }) {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const draw = useRef(null)
  const [ready, setReady] = useState(false)

  // Init map + draw once
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
      // Create all sources + layers in z-order (property → farm → camp on top)
      Object.entries(LAYER_STYLE).forEach(([id, cfg]) => {
        map.current.addSource(id, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        map.current.addLayer({
          id: `${id}-fill`,
          type: 'fill',
          source: id,
          paint: { 'fill-color': cfg.fill, 'fill-opacity': cfg.opacity },
        })
        map.current.addLayer({
          id: `${id}-outline`,
          type: 'line',
          source: id,
          paint: { 'line-color': cfg.line, 'line-width': cfg.width },
        })

        // Click popup for each layer
        map.current.on('click', `${id}-fill`, (e) => {
          const { name, level } = e.features[0].properties
          new mapboxgl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(
              `<strong>${name}</strong>` +
              (level ? `<br><span style="opacity:.6;font-size:11px;text-transform:capitalize">${level}</span>` : '')
            )
            .addTo(map.current)
        })
        map.current.on('mouseenter', `${id}-fill`, () => {
          map.current.getCanvas().style.cursor = 'pointer'
        })
        map.current.on('mouseleave', `${id}-fill`, () => {
          map.current.getCanvas().style.cursor = ''
        })
      })

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
    if (mode !== 'view') {
      draw.current.deleteAll()
      draw.current.changeMode('draw_polygon')
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

    Promise.all([api.getProperties(), api.getAreas()]).then(([properties, areas]) => {
      const farms = areas.filter((a) => a.level === 'farm')
      const camps = areas.filter((a) => a.level === 'camp')

      const toFeatures = (items) =>
        items
          .filter((x) => x.boundary)
          .map((x) => ({
            type: 'Feature',
            geometry: x.boundary,
            properties: { id: x.id, name: x.name, level: x.level ?? null },
          }))

      map.current.getSource('properties')?.setData({ type: 'FeatureCollection', features: toFeatures(properties) })
      map.current.getSource('farms')?.setData({ type: 'FeatureCollection', features: toFeatures(farms) })
      map.current.getSource('camps')?.setData({ type: 'FeatureCollection', features: toFeatures(camps) })

      // Pass loaded data up so App can populate dropdowns
      onDataLoaded?.({ properties, farms, camps })

      // Fit to all on first load only
      if (reloadKey === 0) {
        const all = [...toFeatures(properties), ...toFeatures(farms), ...toFeatures(camps)]
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
