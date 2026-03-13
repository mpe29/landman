import { useState, useEffect, useMemo } from 'react'
import Map from './components/Map'
import MainMenu from './components/MainMenu'
import Toolbar from './components/Toolbar'
import LayerControl from './components/LayerControl'
import DrawAreaModal from './components/DrawAreaModal'
import DrawPointModal from './components/DrawPointModal'
import ObservationModal from './components/ObservationModal'
import ObservationFilterPanel from './components/ObservationFilterPanel'
import FeaturePanel from './components/FeaturePanel'
import { api } from './api'
import { POINT_DRAW_MODES } from './constants/pointTypes'
import { DEFAULT_VISIBILITY } from './constants/layers'
import { DEFAULT_OBS_FILTER, filterObservations } from './utils/obsFilter'

const AREA_DRAW_MODES = new Set(['draw_property', 'draw_farm', 'draw_camp'])

// ── localStorage helpers ───────────────────────────────────────────
function loadLS(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback }
  catch { return fallback }
}
function saveLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

export default function App() {
  const [mode, setMode]                   = useState('view')
  const [reloadKey, setReloadKey]         = useState(0)
  const [pendingGeometry, setPendingGeometry] = useState(null)
  const [saving, setSaving]               = useState(false)
  const [loadedData, setLoadedData]       = useState({ properties: [], farms: [], camps: [], observations: [] })
  const [selectedFeature, setSelectedFeature] = useState(null)
  const [showObsModal, setShowObsModal]   = useState(false)
  const [operations, setOperations]       = useState([])

  // ── Which bottom-left panel is open (only one at a time) ───────
  const [openPanel, setOpenPanel] = useState(null)
  const handlePanelOpen = (id) => setOpenPanel((prev) => prev === id ? null : id)

  // ── Persisted layer visibility ─────────────────────────────────
  const [layerVisibility, setLayerVisibility] = useState(() =>
    ({ ...DEFAULT_VISIBILITY, ...loadLS('landman_layer_visibility', {}) })
  )
  const handleLayerToggle = (id, visible) => {
    setLayerVisibility((prev) => {
      const next = { ...prev, [id]: visible }
      saveLS('landman_layer_visibility', next)
      return next
    })
  }

  // ── Persisted home view ────────────────────────────────────────
  const [homeView, setHomeView] = useState(() => loadLS('landman_home_view', null))

  const handleSetHome = ({ center, zoom }) => {
    const hv = { center, zoom, layerVisibility }
    setHomeView(hv)
    saveLS('landman_home_view', hv)
  }

  const handleRestoreVisibility = (vis) => {
    setLayerVisibility(vis)
    saveLS('landman_layer_visibility', vis)
  }

  // ── Observation filter (persisted) ────────────────────────────
  const [obsFilter, setObsFilter] = useState(() =>
    loadLS('landman_obs_filter', DEFAULT_OBS_FILTER)
  )
  const handleObsFilterChange = (next) => {
    setObsFilter(next)
    saveLS('landman_obs_filter', next)
  }

  const filteredObsCount = useMemo(
    () => filterObservations(loadedData.observations, obsFilter).length,
    [loadedData.observations, obsFilter]
  )

  // ── Heatmap mode ──────────────────────────────────────────────
  const [heatmap, setHeatmap] = useState(false)

  // ── Tag types ─────────────────────────────────────────────────
  const [tagTypes, setTagTypes] = useState([])

  useEffect(() => {
    const propertyId = loadedData.properties[0]?.id
    api.getObservationTagTypes(propertyId || null).then(setTagTypes).catch(console.error)
  }, [loadedData.properties])

  const handleAddTagType = async (name, emoji, color) => {
    const propertyId = loadedData.properties[0]?.id
    const created = await api.createObservationTagType({ propertyId, name, emoji, color })
    setTagTypes((prev) => [...prev, created])
  }

  // ── Operations ────────────────────────────────────────────────
  useEffect(() => {
    const propertyId = loadedData.properties[0]?.id
    if (!propertyId) return
    api.getOperations(propertyId).then(setOperations).catch(console.error)
  }, [loadedData.properties])

  // ── Mode helpers ──────────────────────────────────────────────
  const reload = () => setReloadKey((k) => k + 1)

  const handleModeChange = (newMode) => {
    setMode(newMode)
    if (newMode === 'view') setPendingGeometry(null)
    if (newMode !== 'view') setSelectedFeature(null)
  }

  const handleDrawComplete = (geometry) => setPendingGeometry(geometry)
  const handleDataLoaded   = (data) => setLoadedData(data)

  const handleFeatureClick = (feature) => {
    if (mode !== 'view') return
    setSelectedFeature(feature)
  }

  // ── Area save (property / farm / camp) ───────────────────────
  const handleSaveArea = async ({ name, owner, parentId }) => {
    if (!pendingGeometry) return
    setSaving(true)
    try {
      if (mode === 'draw_property') {
        await api.createProperty({ name, owner, boundary: pendingGeometry })
      } else if (mode === 'draw_farm') {
        const propertyId = loadedData.properties[0]?.id
        if (!propertyId) throw new Error('No property found — draw a property boundary first.')
        await api.createArea({ propertyId, level: 'farm', name, boundary: pendingGeometry })
      } else if (mode === 'draw_camp') {
        const parentFarm = loadedData.farms.find((f) => f.id === parentId)
        const propertyId = parentFarm?.property_id ?? loadedData.properties[0]?.id
        if (!propertyId) throw new Error('No property found — draw a property boundary first.')
        await api.createArea({ propertyId, parentId: parentId || null, level: 'camp', name, boundary: pendingGeometry })
      }
      setPendingGeometry(null)
      setMode('view')
      reload()
    } catch (err) {
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Point asset save ─────────────────────────────────────────
  const handleSavePoint = async ({ name, type, condition, notes }) => {
    if (!pendingGeometry) return
    setSaving(true)
    try {
      const propertyId = loadedData.properties[0]?.id
      if (!propertyId) throw new Error('No property found — draw a property boundary first.')
      await api.createPointAsset({ propertyId, name, type, condition, notes, geom: pendingGeometry })
      setPendingGeometry(null)
      setMode('view')
      reload()
    } catch (err) {
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const isAreaDraw  = AREA_DRAW_MODES.has(mode)
  const isPointDraw = POINT_DRAW_MODES.has(mode)

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Map
        mode={mode}
        reloadKey={reloadKey}
        layerVisibility={layerVisibility}
        obsFilter={obsFilter}
        homeView={homeView}
        onSetHome={handleSetHome}
        onRestoreVisibility={handleRestoreVisibility}
        onDrawComplete={handleDrawComplete}
        onDataLoaded={handleDataLoaded}
        onFeatureClick={handleFeatureClick}
        selectedObsId={selectedFeature?.featureType === 'observation' ? selectedFeature.data?.id : null}
        heatmap={heatmap}
      />

      {/* ── Top-left: app menu ── */}
      <MainMenu />

      {/* ── Bottom-left: stacked panels (only one open at a time) ── */}
      <div style={stackStyle}>
        <Toolbar
          mode={mode}
          onModeChange={handleModeChange}
          isOpen={openPanel === 'create'}
          onOpen={() => handlePanelOpen('create')}
        />
        <ObservationFilterPanel
          observations={loadedData.observations}
          tagTypes={tagTypes}
          filter={obsFilter}
          onChange={handleObsFilterChange}
          onAddTagType={handleAddTagType}
          filteredCount={filteredObsCount}
          heatmap={heatmap}
          onHeatmapToggle={() => setHeatmap((h) => !h)}
          onObservationClick={() => setShowObsModal(true)}
          isOpen={openPanel === 'observe'}
          onOpen={() => handlePanelOpen('observe')}
        />
        <LayerControl
          visibility={layerVisibility}
          onChange={handleLayerToggle}
          isOpen={openPanel === 'layers'}
          onOpen={() => handlePanelOpen('layers')}
        />
      </div>

      {/* Area draw modal */}
      {pendingGeometry && isAreaDraw && (
        <DrawAreaModal
          drawMode={mode}
          properties={loadedData.properties}
          farms={loadedData.farms}
          saving={saving}
          onSave={handleSaveArea}
          onCancel={() => { setPendingGeometry(null); setMode('view') }}
        />
      )}

      {/* Point asset draw modal */}
      {pendingGeometry && isPointDraw && (
        <DrawPointModal
          drawMode={mode}
          saving={saving}
          onSave={handleSavePoint}
          onCancel={() => { setPendingGeometry(null); setMode('view') }}
        />
      )}

      {/* Observation modal */}
      {showObsModal && (
        <ObservationModal
          propertyId={loadedData.properties[0]?.id}
          operations={operations}
          tagTypes={tagTypes}
          onSaved={() => { setShowObsModal(false); reload() }}
          onCancel={() => setShowObsModal(false)}
        />
      )}

      {/* Feature detail / edit panel */}
      {selectedFeature && !pendingGeometry && !showObsModal && (
        <FeaturePanel
          feature={selectedFeature}
          camps={loadedData.camps}
          propertyId={loadedData.properties[0]?.id}
          tagTypes={tagTypes}
          onClose={() => setSelectedFeature(null)}
          onSaved={() => { reload(); setSelectedFeature(null) }}
          onDeleted={() => { reload(); setSelectedFeature(null) }}
        />
      )}
    </div>
  )
}

const stackStyle = {
  position: 'absolute',
  bottom: 32,
  left: 16,
  zIndex: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  width: 240,
}
