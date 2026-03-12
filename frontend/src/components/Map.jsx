import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { api } from '../api'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

export default function Map() {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const [ready, setReady] = useState(false)

  // Initialise the map once
  useEffect(() => {
    if (map.current) return

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [25, -25], // Southern Africa default
      zoom: 4,
    })

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')
    map.current.on('load', () => setReady(true))
  }, [])

  // Load properties and render boundaries once map is ready
  useEffect(() => {
    if (!ready) return

    api.getProperties().then((properties) => {
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
        paint: {
          'fill-color': '#4ade80',
          'fill-opacity': 0.2,
        },
      })

      map.current.addLayer({
        id: 'properties-outline',
        type: 'line',
        source: 'properties',
        paint: {
          'line-color': '#4ade80',
          'line-width': 2,
        },
      })

      // Show property name on click
      map.current.on('click', 'properties-fill', (e) => {
        const { name } = e.features[0].properties
        new mapboxgl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`<strong>${name}</strong>`)
          .addTo(map.current)
      })

      map.current.on('mouseenter', 'properties-fill', () => {
        map.current.getCanvas().style.cursor = 'pointer'
      })
      map.current.on('mouseleave', 'properties-fill', () => {
        map.current.getCanvas().style.cursor = ''
      })

      // Fit map to property boundaries
      const bounds = new mapboxgl.LngLatBounds()
      features.forEach((f) => {
        f.geometry.coordinates[0].forEach((coord) => bounds.extend(coord))
      })
      map.current.fitBounds(bounds, { padding: 60 })
    })
  }, [ready])

  return <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
}
