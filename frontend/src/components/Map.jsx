import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import 'mapbox-gl/dist/mapbox-gl.css'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import { api } from '../api'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

export default function Map({ mode, reloadKey, onDrawComplete }) {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const draw = useRef(null)
  const [ready, setReady] = useState(false)

  // Initialise the map and draw control once
  useEffect(() => {
    if (map.current) return

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [25, -25],
      zoom: 4,
    })

    draw.current = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: false, trash: false }, // we control modes ourselves
    })

    map.current.addControl(draw.current)
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')

    map.current.on('load', () => setReady(true))

    map.current.on('draw.create', (e) => {
      const geometry = e.features[0]?.geometry
      if (geometry) onDrawComplete(geometry)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // React to mode changes
  useEffect(() => {
    if (!ready || !draw.current) return

    if (mode === 'draw_property') {
      draw.current.deleteAll()
      draw.current.changeMode('draw_polygon')
      map.current.getCanvas().style.cursor = 'crosshair'
    } else {
      draw.current.changeMode('simple_select')
      draw.current.deleteAll()
      map.current.getCanvas().style.cursor = ''
    }
  }, [mode, ready])

  // Load / reload property boundaries whenever reloadKey changes
  useEffect(() => {
    if (!ready) return

    api.getProperties().then((properties) => {
      // Remove existing layers/source if reloading
      if (map.current.getSource('properties')) {
        map.current.removeLayer('properties-fill')
        map.current.removeLayer('properties-outline')
        map.current.removeSource('properties')
      }

      const features = properties
        .filter((p) => p.boundary)
        .map((p) => ({
          type: 'Feature',
          geometry: p.boundary,
          properties: { id: p.id, name: p.name },
        }))

      if (features.length === 0) return

      map.current.addSource('properties', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
      })

      map.current.addLayer({
        id: 'properties-fill',
        type: 'fill',
        source: 'properties',
        paint: { 'fill-color': '#4ade80', 'fill-opacity': 0.15 },
      })

      map.current.addLayer({
        id: 'properties-outline',
        type: 'line',
        source: 'properties',
        paint: { 'line-color': '#4ade80', 'line-width': 2 },
      })

      // Click to show property name
      map.current.on('click', 'properties-fill', (e) => {
        new mapboxgl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`<strong>${e.features[0].properties.name}</strong>`)
          .addTo(map.current)
      })

      map.current.on('mouseenter', 'properties-fill', () => {
        if (mode === 'view') map.current.getCanvas().style.cursor = 'pointer'
      })
      map.current.on('mouseleave', 'properties-fill', () => {
        map.current.getCanvas().style.cursor = ''
      })

      // Fit to boundaries on first load
      if (reloadKey === 0) {
        const bounds = new mapboxgl.LngLatBounds()
        features.forEach((f) =>
          f.geometry.coordinates[0].forEach((c) => bounds.extend(c)),
        )
        map.current.fitBounds(bounds, { padding: 60 })
      }
    })
  }, [ready, reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
}
