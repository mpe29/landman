import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import 'mapbox-gl/dist/mapbox-gl.css'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import { api, supabase } from '../api'
import { POINT_TYPES, POINT_DRAW_MODES } from '../constants/pointTypes'
import { ACTIVE_LAYERS } from '../constants/layers'
import { filterObservations } from '../utils/obsFilter'
import { T, C } from '../constants/theme'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

// Build a Mapbox match expression for point asset type → color
const POINT_COLOR_EXPR = [
  'match', ['get', 'type'],
  ...POINT_TYPES.flatMap((pt) => [pt.id, pt.color]),
  '#94a3b8', // fallback
]

// Fetch all spatial data and partition into layer buckets
async function loadAllData() {
  const [properties, areas, pointAssets, observations, livestockCounts, devicePositions] = await Promise.all([
    api.getProperties(),
    api.getAreas(),
    api.getPointAssets(),
    api.getObservations(),
    api.getLivestockCampCounts().catch(() => []),
    api.getDevicePositions(),
  ])
  return {
    properties,
    farms:            areas.filter((a) => a.level === 'farm'),
    camps:            areas.filter((a) => a.level === 'camp'),
    point_assets:     pointAssets,
    observations,
    livestock_counts: livestockCounts,
    live_devices:     devicePositions,
  }
}

// Convert device_positions rows → GeoJSON FeatureCollection with staleness status
const TWO_HOURS_MS = 2 * 60 * 60 * 1000
function toDeviceFC(devices) {
  const now = Date.now()
  return {
    type: 'FeatureCollection',
    features: devices
      .filter((d) => d.lat != null && d.lng != null)
      .map((d) => {
        const age    = d.last_seen_at ? now - new Date(d.last_seen_at).getTime() : Infinity
        const status = !d.active ? 'inactive' : age < TWO_HOURS_MS ? 'fresh' : 'stale'
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
          properties: {
            id:               d.id,
            name:             d.name,
            dev_eui:          d.dev_eui,
            active:           d.active,
            last_seen_at:     d.last_seen_at,
            battery_pct:      d.battery_pct,
            area_name:        d.area_name,
            device_type_name: d.device_type_name,
            device_type_icon: d.device_type_icon ?? '📡',
            status,
          },
        }
      }),
  }
}

// Convert DB rows to GeoJSON FeatureCollection
// tag_ids is an array — excluded to avoid Mapbox property serialization quirks
const EXCLUDE_KEYS = new Set(['boundary', 'tag_ids'])
function toFC(items, geomKey = 'boundary') {
  return {
    type: 'FeatureCollection',
    features: items
      .filter((x) => x[geomKey])
      .map((x) => ({
        type: 'Feature',
        geometry: x[geomKey],
        properties: Object.fromEntries(
          Object.entries(x).filter(([k]) => k !== geomKey && !EXCLUDE_KEYS.has(k))
        ),
      })),
  }
}

// Approximate GeoJSON circle polygon from center + radius (meters)
function geoCircle(lng, lat, radiusMeters, steps = 64) {
  const R = 6371000
  const coords = []
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI
    const dx = radiusMeters * Math.cos(angle)
    const dy = radiusMeters * Math.sin(angle)
    const dLng = (dx / (R * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI)
    const dLat = (dy / R) * (180 / Math.PI)
    coords.push([lng + dLng, lat + dLat])
  }
  return { type: 'Polygon', coordinates: [coords] }
}

// Inject GPS dot CSS once
let gpsCssInjected = false
function injectGpsCss() {
  if (gpsCssInjected) return
  gpsCssInjected = true
  const style = document.createElement('style')
  style.textContent = `
    .gps-dot {
      width: 16px; height: 16px;
      background: #3b82f6;
      border: 2.5px solid #fff;
      border-radius: 50%;
      box-shadow: 0 1px 4px rgba(0,0,0,0.35);
      animation: gps-pulse 2s ease-out infinite;
    }
    @keyframes gps-pulse {
      0%   { box-shadow: 0 0 0 0   rgba(59,130,246,0.55), 0 1px 4px rgba(0,0,0,0.35); }
      70%  { box-shadow: 0 0 0 14px rgba(59,130,246,0),   0 1px 4px rgba(0,0,0,0.35); }
      100% { box-shadow: 0 0 0 0   rgba(59,130,246,0),    0 1px 4px rgba(0,0,0,0.35); }
    }
  `
  document.head.appendChild(style)
}

// Inject device dot CSS once
let deviceCssInjected = false
function injectDeviceCss() {
  if (deviceCssInjected) return
  deviceCssInjected = true
  const style = document.createElement('style')
  style.textContent = `
    .device-dot {
      width: 16px; height: 16px;
      border: 2.5px solid #fff;
      border-radius: 50%;
      cursor: pointer;
    }
    .device-dot.fresh {
      background: #22c55e;
      box-shadow: 0 1px 4px rgba(0,0,0,0.35);
      animation: device-pulse 2s ease-out infinite;
    }
    .device-dot.stale {
      background: #f59e0b;
      box-shadow: 0 1px 4px rgba(0,0,0,0.35);
    }
    .device-dot.inactive {
      background: #9ca3af;
      box-shadow: 0 1px 4px rgba(0,0,0,0.25);
    }
    @keyframes device-pulse {
      0%   { box-shadow: 0 0 0 0   rgba(34,197,94,0.55), 0 1px 4px rgba(0,0,0,0.35); }
      70%  { box-shadow: 0 0 0 14px rgba(34,197,94,0),   0 1px 4px rgba(0,0,0,0.35); }
      100% { box-shadow: 0 0 0 0   rgba(34,197,94,0),    0 1px 4px rgba(0,0,0,0.35); }
    }
    .routing-dot {
      width: 20px; height: 20px;
      border: 2.5px solid #fff;
      border-radius: 50%;
      cursor: pointer;
    }
    .routing-dot.fresh {
      background: #a855f7;
      box-shadow: 0 1px 4px rgba(0,0,0,0.35);
      animation: routing-pulse 2s ease-out infinite;
    }
    .routing-dot.stale {
      background: #9333ea;
      box-shadow: 0 1px 4px rgba(0,0,0,0.35);
    }
    .routing-dot.inactive {
      background: #c084fc;
      box-shadow: 0 1px 4px rgba(0,0,0,0.25);
    }
    @keyframes routing-pulse {
      0%   { box-shadow: 0 0 0 0   rgba(168,85,247,0.55), 0 1px 4px rgba(0,0,0,0.35); }
      70%  { box-shadow: 0 0 0 14px rgba(168,85,247,0),   0 1px 4px rgba(0,0,0,0.35); }
      100% { box-shadow: 0 0 0 0   rgba(168,85,247,0),    0 1px 4px rgba(0,0,0,0.35); }
    }
  `
  document.head.appendChild(style)
}

export default function Map({
  mode,
  editBoundary,
  reloadKey,
  layerVisibility,
  obsFilter,
  homeView,
  onSetHome,
  onRestoreVisibility,
  onDrawComplete,
  onDrawUpdate,
  onDataLoaded,
  onFeatureClick,
  onViewportObs,
  onMapReady,
  selectedObsId,
  obsMode,
  deviceMode,
  deviceTrailData,
  deviceFilterActive,
  onMapClick,
  onMapBackground,
  onContextMenu: onContextMenuProp,
}) {
  const mapContainer     = useRef(null)
  const map              = useRef(null)
  const draw             = useRef(null)
  const obsModeRef       = useRef('individual')  // shadow for layerVisibility effect
  const deviceModeRef    = useRef('individual')  // shadow for layerVisibility effect
  const onFeatureClickRef  = useRef(onFeatureClick) // always-current ref (avoids stale closure)
  const onMapClickRef      = useRef(onMapClick)
  const onMapBackgroundRef = useRef(onMapBackground)
  const onContextMenuRef   = useRef(onContextMenuProp)
  const onViewportObsRef = useRef(onViewportObs)
  const onDrawUpdateRef  = useRef(onDrawUpdate)
  const modeRef          = useRef(mode)          // always-current mode for event listeners
  const gpsWatchRef      = useRef(null)
  const gpsMarkerRef     = useRef(null)
  const gpsFlyDoneRef    = useRef(false)
  // Device HTML markers — keyed by device id
  const deviceMarkersRef = useRef({})
  const deviceDataRef    = useRef({})   // device data by id — for proximity selection
  const deviceVisRef     = useRef(true)         // current live_devices layer visibility
  const [ready, setReady]       = useState(false)
  const [gpsActive, setGpsActive] = useState(false)

  // Keep refs current whenever props change
  useEffect(() => { onFeatureClickRef.current = onFeatureClick }, [onFeatureClick])
  useEffect(() => { onMapClickRef.current = onMapClick }, [onMapClick])
  useEffect(() => { onMapBackgroundRef.current = onMapBackground }, [onMapBackground])
  useEffect(() => { onContextMenuRef.current = onContextMenuProp }, [onContextMenuProp])
  useEffect(() => { onViewportObsRef.current  = onViewportObs  }, [onViewportObs])
  useEffect(() => { onDrawUpdateRef.current   = onDrawUpdate   }, [onDrawUpdate])
  useEffect(() => { modeRef.current           = mode           }, [mode])

  // ── Init map & draw once ───────────────────────────────────────
  useEffect(() => {
    if (map.current) return

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [25, -25],
      zoom: 4,
      clickTolerance: 10,  // default 3px — increased for mobile finger imprecision
      maxTileCacheSize: 200,  // cache more tiles (default ~50) to reduce re-fetches
      fadeDuration: 0,        // eliminate tile fade delay — tiles appear instantly
    })

    draw.current = new MapboxDraw({ displayControlsDefault: false })
    map.current.addControl(draw.current)
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')

    map.current.on('load', () => {
      // ── State for mobile touch-dedup ─────────────────────────────
      // touchend fires before the synthesized Mapbox click. When the
      // touchend handler finds and dispatches a feature, it sets
      // touchHandled = true so the subsequent layer click is ignored.
      let touchHandled = false
      let touchHandledTimer = null
      const markTouchHandled = () => {
        touchHandled = true
        clearTimeout(touchHandledTimer)
        touchHandledTimer = setTimeout(() => { touchHandled = false }, 600)
      }

      // Returns the nearest visible device's data if within 22px of canvas point (x, y),
      // otherwise null. Used to give devices top selection priority over all Mapbox layers.
      const nearestDevice = (x, y) => {
        const cr = map.current.getCanvas().getBoundingClientRect()
        for (const [id, marker] of Object.entries(deviceMarkersRef.current)) {
          const el = marker.getElement()
          if (el.style.display === 'none') continue
          const mr = el.getBoundingClientRect()
          const mx = mr.left + mr.width  / 2 - cr.left
          const my = mr.top  + mr.height / 2 - cr.top
          if (Math.hypot(x - mx, y - my) <= 22) return deviceDataRef.current[id]
        }
        return null
      }

      ACTIVE_LAYERS.forEach((layer) => {
        map.current.addSource(layer.id, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })

        if (layer.type === 'polygon') {
          map.current.addLayer({
            id: `${layer.id}-fill`, type: 'fill', source: layer.id,
            layout: { visibility: layer.defaultVisible ? 'visible' : 'none' },
            paint:  { 'fill-color': layer.color, 'fill-opacity': layer.fillOpacity },
          })
          map.current.addLayer({
            id: `${layer.id}-outline`, type: 'line', source: layer.id,
            layout: { visibility: layer.defaultVisible ? 'visible' : 'none' },
            paint:  { 'line-color': layer.color, 'line-width': layer.lineWidth },
          })
          map.current.on('click', `${layer.id}-fill`, (e) => {
            if (touchHandled) { touchHandled = false; return }
            if (onMapClickRef.current) return  // placement mode — handled by general click
            const device = nearestDevice(e.point.x, e.point.y)
            if (device) { onFeatureClickRef.current?.({ featureType: 'device', data: device }); return }
            onFeatureClickRef.current?.({
              featureType: layer.featureType,
              data: { ...e.features[0].properties, _geometry: e.features[0].geometry },
            })
          })
          map.current.on('mouseenter', `${layer.id}-fill`, () => { map.current.getCanvas().style.cursor = 'pointer' })
          map.current.on('mouseleave', `${layer.id}-fill`, () => { map.current.getCanvas().style.cursor = '' })

        } else if (layer.type === 'point') {
          map.current.addLayer({
            id: `${layer.id}-circle`, type: 'circle', source: layer.id,
            layout: { visibility: layer.defaultVisible ? 'visible' : 'none' },
            paint: {
              'circle-radius':       layer.circleRadius ?? 7,
              'circle-color':        layer.color === 'multi' ? POINT_COLOR_EXPR : layer.color,
              'circle-stroke-color': '#fff',
              'circle-stroke-width': 1.5,
            },
          })
          map.current.on('click', `${layer.id}-circle`, (e) => {
            if (touchHandled) { touchHandled = false; return }
            if (onMapClickRef.current) return  // placement mode — handled by general click
            const device = nearestDevice(e.point.x, e.point.y)
            if (device) { onFeatureClickRef.current?.({ featureType: 'device', data: device }); return }
            onFeatureClickRef.current?.({ featureType: layer.featureType, data: e.features[0].properties })
          })
          map.current.on('mouseenter', `${layer.id}-circle`, () => { map.current.getCanvas().style.cursor = 'pointer' })
          map.current.on('mouseleave', `${layer.id}-circle`, () => { map.current.getCanvas().style.cursor = '' })

        } else if (layer.type === 'line') {
          map.current.addLayer({
            id: `${layer.id}-line`, type: 'line', source: layer.id,
            layout: { visibility: layer.defaultVisible ? 'visible' : 'none' },
            paint:  { 'line-color': layer.color, 'line-width': layer.lineWidth },
          })
        } else if (layer.type === 'symbol') {
          map.current.addLayer({
            id: `${layer.id}-symbol`, type: 'symbol', source: layer.id,
            layout: {
              visibility:              layer.defaultVisible ? 'visible' : 'none',
              'text-field':            ['get', 'label'],
              'text-size':             13,
              'text-anchor':           'center',
              'text-offset':           [0, 0],
              'text-allow-overlap':    true,
              'text-ignore-placement': true,
            },
            paint: {
              'text-color':      '#2F2F2F',
              'text-halo-color': '#F3F1E8',
              'text-halo-width': 2,
            },
          })
        } else if (layer.type === 'html_marker') {
          // Device positions rendered as HTML markers (see updateDeviceMarkers).
          // No Mapbox layer needed — skip. Source is still registered above
          // so setData calls are harmless (source exists, no layers consume it).
        }
      })

      // ── Observations heatmap — toggled separately, starts hidden ─
      map.current.addLayer({
        id: 'observations-heat',
        type: 'heatmap',
        source: 'observations',
        layout: { visibility: 'none' },
        paint: {
          // Low intensity + tight radius so hundreds of obs are needed to saturate.
          // Color stops pushed right: warm colours only appear at genuine high density.
          'heatmap-weight': 1,
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.4, 9, 1.2],
          'heatmap-radius':    ['interpolate', ['linear'], ['zoom'], 0, 4, 9, 20],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,    'rgba(78,91,60,0)',
            0.15, C.pistachioGreen,
            0.4,  C.dryGrassYellow,
            0.7,  C.burntOrange,
            1,    '#b91c1c',
          ],
          'heatmap-opacity': 0.85,
        },
      }, 'observations-circle') // insert behind the circles

      // ── Device positions heatmap — green theme, starts hidden ────
      map.current.addLayer({
        id: 'devices-heat',
        type: 'heatmap',
        source: 'live_devices',
        layout: { visibility: 'none' },
        paint: {
          // Focused glow per device — small radius so individual positions
          // are distinct even with few devices (scores, not thousands).
          'heatmap-weight': 1,
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.6, 9, 1.5, 14, 2.5],
          'heatmap-radius':    ['interpolate', ['linear'], ['zoom'], 0, 6, 9, 18, 14, 30],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,    'rgba(78,91,60,0)',
            0.15, '#86efac',
            0.4,  C.pistachioGreen,
            0.7,  C.deepOlive,
            1,    '#14532d',
          ],
          'heatmap-opacity': 0.75,
        },
      })

      // ── GPS accuracy ring ─────────────────────────────────────────
      map.current.addSource('gps-accuracy', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.current.addLayer({
        id: 'gps-accuracy-fill', type: 'fill', source: 'gps-accuracy',
        paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.08 },
      })
      map.current.addLayer({
        id: 'gps-accuracy-outline', type: 'line', source: 'gps-accuracy',
        paint: { 'line-color': '#3b82f6', 'line-width': 1.2, 'line-opacity': 0.45 },
      })

      // ── Device trail layers (for time-filtered movement display) ──
      map.current.addSource('device-trail', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.current.addSource('device-trail-points', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.current.addLayer({
        id: 'device-trail-line', type: 'line', source: 'device-trail',
        layout: { visibility: 'none', 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#22c55e'],
          'line-width': 2.5,
          'line-opacity': 0.8,
        },
      })
      map.current.addLayer({
        id: 'device-trail-points-circle', type: 'circle', source: 'device-trail-points',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': 4,
          'circle-color': ['coalesce', ['get', 'color'], '#22c55e'],
          'circle-stroke-width': 1,
          'circle-stroke-color': '#fff',
          'circle-opacity': 0.85,
        },
      })

      // ── Desktop: placement mode click intercept + close panels ──
      map.current.on('click', (e) => {
        if (onMapClickRef.current) {
          onMapClickRef.current(e.lngLat)
          return
        }
        // Close panels/menus on background click (no feature hit)
        const allLayerIds = ACTIVE_LAYERS.flatMap((l) =>
          l.type === 'polygon' ? [`${l.id}-fill`] : [`${l.id}-circle`]
        )
        const hits = map.current.queryRenderedFeatures(e.point, { layers: allLayerIds.filter((id) => map.current.getLayer(id)) })
        if (hits.length === 0 && !nearestDevice(e.point.x, e.point.y)) {
          onMapBackgroundRef.current?.()
        }
      })

      // ── Right-click context menu (desktop) ──
      map.current.on('contextmenu', (e) => {
        e.preventDefault()
        onContextMenuRef.current?.(e.lngLat, e.point)
      })

      // ── Mobile: canvas touchend for reliable small-feature taps ──
      // map.on('click', layerId, ...) works on desktop but on iOS the
      // rendered circle is only 6px radius — too small for a fingertip.
      // Hooking touchend on the raw canvas gives us a wider bbox query
      // (44px diameter) while the movement threshold prevents misfires
      // during map panning. touchHandled prevents the subsequent Mapbox
      // synthesised click event from firing a second dispatch.
      const polyFillIds  = ACTIVE_LAYERS.filter((l) => l.type === 'polygon').map((l) => `${l.id}-fill`)
      const pointCircIds = ACTIVE_LAYERS.filter((l) => l.type === 'point' && l.id !== 'observations').map((l) => `${l.id}-circle`)

      const canvas = map.current.getCanvas()
      let touchStartX = 0, touchStartY = 0

      canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          touchStartX = e.touches[0].clientX
          touchStartY = e.touches[0].clientY
        }
      }, { passive: true })

      canvas.addEventListener('touchend', (e) => {
        if (modeRef.current !== 'view') return  // draw/edit modes handle their own events
        if (e.changedTouches.length !== 1) return
        const touch = e.changedTouches[0]
        // Ignore if the finger moved (pan gesture)
        if (Math.abs(touch.clientX - touchStartX) > 8 ||
            Math.abs(touch.clientY - touchStartY) > 8) return

        // Placement mode intercept — routing device placement
        if (onMapClickRef.current) {
          const lngLat = map.current.unproject([
            touch.clientX - canvas.getBoundingClientRect().left,
            touch.clientY - canvas.getBoundingClientRect().top,
          ])
          markTouchHandled()
          onMapClickRef.current(lngLat)
          return
        }

        const rect = canvas.getBoundingClientRect()
        const cx = touch.clientX - rect.left
        const cy = touch.clientY - rect.top

        // 0. Device markers — highest priority, 44px hit zone
        for (const [id, marker] of Object.entries(deviceMarkersRef.current)) {
          const el = marker.getElement()
          if (el.style.display === 'none') continue
          const mRect = el.getBoundingClientRect()
          const mx = mRect.left + mRect.width / 2 - rect.left
          const my = mRect.top + mRect.height / 2 - rect.top
          if (Math.hypot(cx - mx, cy - my) <= 22) {
            markTouchHandled()
            const data = deviceDataRef.current[id]
            if (data) onFeatureClickRef.current?.({ featureType: 'device', data })
            return
          }
        }

        // 1. Observations — 44px diameter hit zone
        const obsHits = map.current.queryRenderedFeatures(
          [[cx - 22, cy - 22], [cx + 22, cy + 22]],
          { layers: ['observations-circle'] },
        )
        if (obsHits.length > 0) {
          markTouchHandled()
          onFeatureClickRef.current?.({ featureType: 'observation', data: obsHits[0].properties })
          return
        }

        // 2. Point assets — 28px diameter hit zone
        if (pointCircIds.length > 0) {
          const ptHits = map.current.queryRenderedFeatures(
            [[cx - 14, cy - 14], [cx + 14, cy + 14]],
            { layers: pointCircIds },
          )
          if (ptHits.length > 0) {
            markTouchHandled()
            const lb    = ptHits[0].layer.id.replace('-circle', '')
            const layer = ACTIVE_LAYERS.find((l) => l.id === lb)
            onFeatureClickRef.current?.({ featureType: layer?.featureType, data: ptHits[0].properties })
            return
          }
        }

        // 3. Polygons — exact point (large targets)
        if (polyFillIds.length > 0) {
          const polyHits = map.current.queryRenderedFeatures([cx, cy], { layers: polyFillIds })
          if (polyHits.length > 0) {
            markTouchHandled()
            const lb    = polyHits[0].layer.id.replace('-fill', '')
            const layer = ACTIVE_LAYERS.find((l) => l.id === lb)
            onFeatureClickRef.current?.({
              featureType: layer?.featureType,
              data: { ...polyHits[0].properties, _geometry: polyHits[0].geometry },
            })
          }
        }
      }, { passive: true })

      // ── Long-press context menu (mobile) ──
      let longPressTimer = null
      let longPressStart = null
      canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) { clearTimeout(longPressTimer); return }
        longPressStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        longPressTimer = setTimeout(() => {
          const rect = canvas.getBoundingClientRect()
          const point = { x: longPressStart.x - rect.left, y: longPressStart.y - rect.top }
          const lngLat = map.current.unproject(point)
          onContextMenuRef.current?.(lngLat, point)
          longPressTimer = null
        }, 500)
      }, { passive: true })
      canvas.addEventListener('touchmove', (e) => {
        if (!longPressStart) return
        const dx = e.touches[0].clientX - longPressStart.x
        const dy = e.touches[0].clientY - longPressStart.y
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearTimeout(longPressTimer)
      }, { passive: true })
      canvas.addEventListener('touchend', () => { clearTimeout(longPressTimer) }, { passive: true })

      // ── Viewport observation reporting for ImageStrip ──────────
      const reportViewportObs = () => {
        if (!map.current.getLayer('observations-circle')) return
        const features = map.current.queryRenderedFeatures({ layers: ['observations-circle'] })
        // Deduplicate (Mapbox can return tiles with overlap)
        const seen = new Set()
        const obs = []
        for (const f of features) {
          if (seen.has(f.properties.id)) continue
          seen.add(f.properties.id)
          obs.push(f.properties)
        }
        onViewportObsRef.current?.(obs)
      }
      map.current.on('moveend', reportViewportObs)
      map.current.on('sourcedata', (e) => {
        if (e.sourceId === 'observations' && e.isSourceLoaded) reportViewportObs()
      })

      setReady(true)
      onMapReady?.(map.current)
    })

    map.current.on('draw.create', (e) => {
      const geometry = e.features[0]?.geometry
      if (geometry) onDrawComplete(geometry)
    })
    map.current.on('draw.update', (e) => {
      const geometry = e.features[0]?.geometry
      if (geometry) onDrawUpdateRef.current?.(geometry)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Re-apply observation filter when it changes (no DB refetch) ─
  const lastObsRef = useRef([])
  useEffect(() => {
    if (!ready) return
    const filtered = filterObservations(lastObsRef.current, obsFilter)
    map.current.getSource('observations')?.setData(toFC(filtered, 'geom'))
  }, [ready, obsFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync layer visibility from props ──────────────────────────
  useEffect(() => {
    if (!ready || !layerVisibility) return
    ACTIVE_LAYERS.forEach((layer) => {
      if (layer.type === 'html_marker') {
        // Device markers are DOM elements — toggle display directly
        const layerOn = layerVisibility[layer.id] !== false
        deviceVisRef.current = layerOn
        const hideDots = !layerOn || deviceModeRef.current === 'hidden'
        const showHeat = layerOn && deviceModeRef.current === 'heatmap'
        Object.values(deviceMarkersRef.current).forEach((m) => {
          const el = m.getElement()
          if (hideDots) {
            el.style.display = 'none'
          } else {
            const isHeat = deviceModeRef.current === 'heatmap'
            el.style.display = ''
            el.style.opacity = isHeat ? '0.3' : '1'
            el.style.border = isHeat ? 'none' : ''
            el.style.width = isHeat ? '10px' : '16px'
            el.style.height = isHeat ? '10px' : '16px'
            el.style.animation = isHeat ? 'none' : ''
          }
        })
        if (map.current.getLayer('devices-heat'))
          map.current.setLayoutProperty('devices-heat', 'visibility', showHeat ? 'visible' : 'none')
        return
      }
      const vis = layerVisibility[layer.id] !== false ? 'visible' : 'none'
      const ids =
        layer.type === 'polygon' ? [`${layer.id}-fill`, `${layer.id}-outline`]
        : layer.type === 'point'   ? [`${layer.id}-circle`]
        : layer.type === 'symbol'  ? [`${layer.id}-symbol`]
        : [`${layer.id}-line`]
      ids.forEach((lid) => {
        if (!map.current.getLayer(lid)) return
        // Keep circles visible in heatmap mode (ghost dots), hidden only when mode is 'hidden'
        const effectiveVis = (lid === 'observations-circle' && obsModeRef.current === 'hidden') ? 'none' : vis
        map.current.setLayoutProperty(lid, 'visibility', effectiveVis)
      })
    })
  }, [ready, layerVisibility])

  // ── Activate / deactivate draw mode ───────────────────────────
  useEffect(() => {
    if (!ready || !draw.current) return
    const isPoint = POINT_DRAW_MODES.has(mode)
    if (mode === 'edit_boundary') {
      draw.current.deleteAll()
      if (editBoundary?.boundary) {
        const ids = draw.current.add({ type: 'Feature', geometry: editBoundary.boundary, properties: {} })
        if (ids?.length > 0) {
          // direct_select shows all vertex handles immediately for dragging + midpoint clicks to add vertices
          draw.current.changeMode('direct_select', { featureId: ids[0] })
        }
      }
      map.current.getCanvas().style.cursor = ''
    } else if (mode !== 'view') {
      draw.current.deleteAll()
      draw.current.changeMode(isPoint ? 'draw_point' : 'draw_polygon')
      map.current.getCanvas().style.cursor = 'crosshair'
    } else {
      draw.current.changeMode('simple_select')
      draw.current.deleteAll()
      map.current.getCanvas().style.cursor = ''
    }
  }, [mode, ready, editBoundary])

  // ── Load / reload all spatial data ────────────────────────────
  useEffect(() => {
    if (!ready) return

    loadAllData().then((buckets) => {
      map.current.getSource('properties')?.setData(toFC(buckets.properties))
      map.current.getSource('farms')?.setData(toFC(buckets.farms))
      map.current.getSource('camps')?.setData(toFC(buckets.camps))
      map.current.getSource('point_assets')?.setData(toFC(buckets.point_assets, 'geom'))
      map.current.getSource('livestock_counts')?.setData(toFC(buckets.livestock_counts, 'geom'))
      updateDeviceMarkers(buckets.live_devices, deviceVisRef.current)

      // Apply observation filter before feeding to map source
      lastObsRef.current = buckets.observations
      const filteredObs = filterObservations(buckets.observations, obsFilter)
      map.current.getSource('observations')?.setData(toFC(filteredObs, 'geom'))

      onDataLoaded?.({
        properties:   buckets.properties,
        farms:        buckets.farms,
        camps:        buckets.camps,
        observations: buckets.observations, // raw (unfiltered) for FilterPanel
      })

      // On first load: fit to all polygons, then auto-save as home if none saved yet
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
          map.current.fitBounds(bounds, { padding: 60, duration: 0 })

          // Auto-save initial view as home if not yet set
          if (!homeView) {
            map.current.once('moveend', () => {
              const c = map.current.getCenter()
              onSetHome?.({ center: [c.lng, c.lat], zoom: map.current.getZoom() })
            })
          }
        }
      }
    })
  }, [ready, reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Highlight selected observation (Google Images-style invert) ─
  useEffect(() => {
    if (!ready) return
    const layer = 'observations-circle'
    if (!map.current.getLayer(layer)) return
    const isHeat = obsModeRef.current === 'heatmap'
    if (selectedObsId) {
      map.current.setPaintProperty(layer, 'circle-radius',
        ['case', ['==', ['get', 'id'], selectedObsId], 10, isHeat ? 4 : 6])
      map.current.setPaintProperty(layer, 'circle-color',
        ['case', ['==', ['get', 'id'], selectedObsId], '#fff', C.burntOrange])
      map.current.setPaintProperty(layer, 'circle-stroke-color',
        ['case', ['==', ['get', 'id'], selectedObsId], C.burntOrange, '#fff'])
      map.current.setPaintProperty(layer, 'circle-stroke-width',
        ['case', ['==', ['get', 'id'], selectedObsId], 3, isHeat ? 0 : 1.5])
      map.current.setPaintProperty(layer, 'circle-opacity',
        ['case', ['==', ['get', 'id'], selectedObsId], 1, isHeat ? 0.15 : 1])
      map.current.setPaintProperty(layer, 'circle-stroke-opacity',
        ['case', ['==', ['get', 'id'], selectedObsId], 1, isHeat ? 0 : 1])
    } else {
      map.current.setPaintProperty(layer, 'circle-radius', isHeat ? 4 : 6)
      map.current.setPaintProperty(layer, 'circle-color', C.burntOrange)
      map.current.setPaintProperty(layer, 'circle-stroke-color', '#fff')
      map.current.setPaintProperty(layer, 'circle-stroke-width', isHeat ? 0 : 1.5)
      map.current.setPaintProperty(layer, 'circle-opacity', isHeat ? 0.15 : 1)
      map.current.setPaintProperty(layer, 'circle-stroke-opacity', isHeat ? 0 : 1)
    }
  }, [ready, selectedObsId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Observation display mode: individual | heatmap | hidden ──
  // In heatmap mode, dots stay visible but ghost-like (no stroke, low opacity)
  // so they remain clickable without crowding the heatmap.
  useEffect(() => {
    if (!ready) return
    obsModeRef.current = obsMode
    if (map.current.getLayer('observations-heat'))
      map.current.setLayoutProperty('observations-heat', 'visibility', obsMode === 'heatmap' ? 'visible' : 'none')
    if (map.current.getLayer('observations-circle')) {
      map.current.setLayoutProperty('observations-circle', 'visibility', obsMode === 'hidden' ? 'none' : 'visible')
      if (obsMode === 'heatmap') {
        map.current.setPaintProperty('observations-circle', 'circle-radius', 4)
        map.current.setPaintProperty('observations-circle', 'circle-opacity', 0.15)
        map.current.setPaintProperty('observations-circle', 'circle-stroke-width', 0)
        map.current.setPaintProperty('observations-circle', 'circle-stroke-opacity', 0)
      } else {
        map.current.setPaintProperty('observations-circle', 'circle-radius', 6)
        map.current.setPaintProperty('observations-circle', 'circle-opacity', 1)
        map.current.setPaintProperty('observations-circle', 'circle-stroke-width', 1.5)
        map.current.setPaintProperty('observations-circle', 'circle-stroke-opacity', 1)
      }
    }
  }, [ready, obsMode])

  // ── Device display mode: individual | heatmap | hidden ────────
  // In heatmap mode, device dots stay visible but ghost-like so they remain clickable.
  useEffect(() => {
    if (!ready) return
    deviceModeRef.current = deviceMode
    const layerOn = deviceVisRef.current
    const showHeat = layerOn && deviceMode === 'heatmap'
    const hideDots = !layerOn || deviceMode === 'hidden'
    Object.values(deviceMarkersRef.current).forEach((m) => {
      const el = m.getElement()
      if (hideDots) {
        el.style.display = 'none'
      } else {
        el.style.display = ''
        const isHeat = deviceMode === 'heatmap'
        el.style.opacity = isHeat ? '0.3' : '1'
        el.style.border = isHeat ? 'none' : ''
        el.style.width = isHeat ? '10px' : '16px'
        el.style.height = isHeat ? '10px' : '16px'
        el.style.animation = isHeat ? 'none' : ''
      }
    })
    if (map.current.getLayer('devices-heat'))
      map.current.setLayoutProperty('devices-heat', 'visibility', showHeat ? 'visible' : 'none')
  }, [ready, deviceMode])

  // ── Device trail rendering (time-filtered movement) ─────────
  const TRAIL_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
  useEffect(() => {
    if (!ready) return
    const emptyFC = { type: 'FeatureCollection', features: [] }
    const trailSrc  = map.current.getSource('device-trail')
    const pointsSrc = map.current.getSource('device-trail-points')
    if (!trailSrc || !pointsSrc) return

    if (!deviceFilterActive || !deviceTrailData?.length) {
      trailSrc.setData(emptyFC)
      pointsSrc.setData(emptyFC)
      map.current.setLayoutProperty('device-trail-line', 'visibility', 'none')
      map.current.setLayoutProperty('device-trail-points-circle', 'visibility', 'none')
      // Restore live marker opacity
      Object.values(deviceMarkersRef.current).forEach((m) => {
        m.getElement().style.opacity = ''
      })
      return
    }

    // Group readings by device_id
    const byDevice = {}
    deviceTrailData.forEach((r) => {
      if (r.lat == null || r.lng == null) return
      if (!byDevice[r.device_id]) byDevice[r.device_id] = []
      byDevice[r.device_id].push(r)
    })

    const deviceIds = Object.keys(byDevice)
    const lineFeatures = []
    const pointFeatures = []

    deviceIds.forEach((did, i) => {
      const color = TRAIL_COLORS[i % TRAIL_COLORS.length]
      const readings = byDevice[did]
      if (readings.length > 1) {
        lineFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: readings.map((r) => [r.lng, r.lat]),
          },
          properties: { device_id: did, color },
        })
      }
      readings.forEach((r) => {
        pointFeatures.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
          properties: { device_id: did, color, received_at: r.received_at, battery_pct: r.battery_pct },
        })
      })
    })

    trailSrc.setData({ type: 'FeatureCollection', features: lineFeatures })
    pointsSrc.setData({ type: 'FeatureCollection', features: pointFeatures })
    map.current.setLayoutProperty('device-trail-line', 'visibility', 'visible')
    map.current.setLayoutProperty('device-trail-points-circle', 'visibility', 'visible')

    // Also feed trail points into heatmap source for density view
    map.current.getSource('live_devices')?.setData({ type: 'FeatureCollection', features: pointFeatures })

    // Dim live markers while trail is shown
    Object.values(deviceMarkersRef.current).forEach((m) => {
      m.getElement().style.opacity = '0.15'
    })

    // Fit bounds to trail
    if (pointFeatures.length > 0) {
      const coords = pointFeatures.map((f) => f.geometry.coordinates)
      const lngs = coords.map((c) => c[0])
      const lats = coords.map((c) => c[1])
      map.current.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 60, duration: 800 }
      )
    }
  }, [ready, deviceTrailData, deviceFilterActive])

  // ── Realtime: update device positions on new sensor reading ───
  useEffect(() => {
    if (!ready) return
    const channel = supabase
      .channel('sensor_readings_live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sensor_readings' }, () => {
        api.getDevicePositions().then((devices) => {
          updateDeviceMarkers(devices, deviceVisRef.current)
        }).catch(console.error)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [ready]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── GPS locate ────────────────────────────────────────────────
  const stopGps = () => {
    if (gpsWatchRef.current != null) {
      navigator.geolocation.clearWatch(gpsWatchRef.current)
      gpsWatchRef.current = null
    }
    gpsMarkerRef.current?.remove()
    gpsMarkerRef.current = null
    gpsFlyDoneRef.current = false
    map.current?.getSource('gps-accuracy')?.setData({ type: 'FeatureCollection', features: [] })
    setGpsActive(false)
  }

  const toggleGps = () => {
    if (!ready) return
    if (gpsActive) { stopGps(); return }

    if (!navigator.geolocation) {
      alert('Location is not available in this browser.')
      return
    }

    // Geolocation only works on HTTPS (or localhost). Warn early on HTTP.
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      alert('Location requires a secure connection (HTTPS). Open the app via HTTPS to use GPS.')
      return
    }

    injectGpsCss()
    setGpsActive(true)

    gpsWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { longitude: lng, latitude: lat, accuracy } = pos.coords

        // Update accuracy ring
        map.current.getSource('gps-accuracy')?.setData({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: geoCircle(lng, lat, accuracy), properties: {} }],
        })

        // Create or reposition the dot marker
        if (!gpsMarkerRef.current) {
          const el = document.createElement('div')
          el.className = 'gps-dot'
          gpsMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([lng, lat])
            .addTo(map.current)
        } else {
          gpsMarkerRef.current.setLngLat([lng, lat])
        }

        // Fly to location on first fix
        if (!gpsFlyDoneRef.current) {
          gpsFlyDoneRef.current = true
          map.current.flyTo({ center: [lng, lat], zoom: Math.max(map.current.getZoom(), 15), duration: 1400 })
        }
      },
      (err) => {
        stopGps()
        const msg = err.code === 1 ? 'Location permission denied. Check your browser/device settings.'
          : err.code === 2 ? 'Location unavailable. Check device GPS is enabled.'
          : 'Location request timed out.'
        alert(msg)
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    )
  }

  // Clean up GPS watch on unmount
  useEffect(() => () => stopGps(), []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Device HTML markers ───────────────────────────────────────
  const updateDeviceMarkers = (devices, visible) => {
    if (!map.current) return
    deviceVisRef.current = visible
    const now    = Date.now()
    const seenIds = new Set()

    devices
      .filter((d) => d.lat != null && d.lng != null)
      .forEach((d) => {
        seenIds.add(d.id)
        const age    = d.last_seen_at ? now - new Date(d.last_seen_at).getTime() : Infinity
        const status = !d.active ? 'inactive' : age < TWO_HOURS_MS ? 'fresh' : 'stale'

        deviceDataRef.current[d.id] = { ...d, status }

        if (!deviceMarkersRef.current[d.id]) {
          injectDeviceCss()
          const isRouting = d.device_type_category === 'routing'
          const el = document.createElement('div')
          el.className = `${isRouting ? 'routing-dot' : 'device-dot'} ${status}`
          el.addEventListener('click', () => {
            onFeatureClickRef.current?.({ featureType: 'device', data: deviceDataRef.current[d.id] ?? { ...d, status } })
          })
          deviceMarkersRef.current[d.id] = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([d.lng, d.lat])
            .addTo(map.current)
        } else {
          const marker = deviceMarkersRef.current[d.id]
          marker.setLngLat([d.lng, d.lat])
          const isRouting = d.device_type_category === 'routing'
          marker.getElement().className = `${isRouting ? 'routing-dot' : 'device-dot'} ${status}`
        }
        const el = deviceMarkersRef.current[d.id].getElement()
        const hide = !visible || deviceModeRef.current === 'hidden'
        if (hide) {
          el.style.display = 'none'
        } else {
          const isHeat = deviceModeRef.current === 'heatmap'
          el.style.display = ''
          el.style.opacity = isHeat ? '0.3' : '1'
          el.style.border = isHeat ? 'none' : ''
          el.style.width = isHeat ? '10px' : '16px'
          el.style.height = isHeat ? '10px' : '16px'
          el.style.animation = isHeat ? 'none' : ''
        }
      })

    // Remove markers for devices no longer in the list
    Object.keys(deviceMarkersRef.current).forEach((id) => {
      if (!seenIds.has(id)) {
        deviceMarkersRef.current[id].remove()
        delete deviceMarkersRef.current[id]
        delete deviceDataRef.current[id]
      }
    })

    // Keep the GeoJSON source in sync so the heatmap layer has data
    map.current.getSource('live_devices')?.setData({
      type: 'FeatureCollection',
      features: devices
        .filter((d) => d.lat != null && d.lng != null)
        .map((d) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
          properties: {},
        })),
    })
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      {ready && (
        <HomeControl
          map={map.current}
          homeView={homeView}
          layerVisibility={layerVisibility}
          onSetHome={onSetHome}
          onRestoreVisibility={onRestoreVisibility}
          gpsActive={gpsActive}
          onToggleGps={toggleGps}
        />
      )}
    </div>
  )
}

/* ── Home Control ────────────────────────────────────────────────── */

function HomeControl({ map, homeView, layerVisibility, onSetHome, onRestoreVisibility, gpsActive, onToggleGps }) {
  const [flash, setFlash] = useState(null) // 'saved' | 'home'

  const goHome = () => {
    if (!homeView) return
    map.flyTo({ center: homeView.center, zoom: homeView.zoom, duration: 1400 })
    if (homeView.layerVisibility) onRestoreVisibility?.(homeView.layerVisibility)
    setFlash('home')
    setTimeout(() => setFlash(null), 1200)
  }

  const setHome = () => {
    const c = map.getCenter()
    onSetHome?.({ center: [c.lng, c.lat], zoom: map.getZoom() })
    setFlash('saved')
    setTimeout(() => setFlash(null), 1500)
  }

  return (
    <div style={hc.wrap}>
      <button
        onClick={goHome}
        disabled={!homeView}
        title="Fly to home view"
        style={{ ...hc.btn, opacity: homeView ? 1 : 0.4 }}
      >
        {flash === 'home' ? '✓' : '🏠'}
      </button>
      <button
        onClick={setHome}
        title="Save current view as home"
        style={hc.btn}
      >
        {flash === 'saved' ? '✓' : '📍'}
      </button>
      <button
        onClick={onToggleGps}
        title={gpsActive ? 'Stop GPS tracking' : 'Show my location'}
        style={{ ...hc.btn, ...(gpsActive ? hc.btnGpsOn : {}) }}
      >
        ◎
      </button>
    </div>
  )
}

const hc = {
  wrap: {
    position: 'absolute',
    top: 120,
    right: 10,
    zIndex: 5,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  btn: {
    width: 30,
    height: 30,
    background: T.surface,
    border: `1px solid ${T.surfaceBorder}`,
    borderRadius: 6,
    boxShadow: T.surfaceShadow,
    fontSize: 15,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s',
    padding: 0,
    color: T.textMuted,
  },
  btnGpsOn: {
    background: '#3b82f618',
    border: '1px solid #3b82f655',
    color: '#3b82f6',
  },
}
