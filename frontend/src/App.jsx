import { useState, useEffect } from 'react'
import Map from './components/Map'
import Toolbar from './components/Toolbar'
import LayerControl from './components/LayerControl'
import DrawAreaModal from './components/DrawAreaModal'
import DrawPointModal from './components/DrawPointModal'
import ObservationModal from './components/ObservationModal'
import FeaturePanel from './components/FeaturePanel'
import { api } from './api'
import { POINT_DRAW_MODES } from './constants/pointTypes'
import { DEFAULT_VISIBILITY } from './constants/layers'

const AREA_DRAW_MODES = new Set(['draw_property', 'draw_farm', 'draw_camp'])

export default function App() {
  const [mode, setMode]                   = useState('view')
  const [reloadKey, setReloadKey]         = useState(0)
  const [pendingGeometry, setPendingGeometry] = useState(null)
  const [saving, setSaving]               = useState(false)
  const [loadedData, setLoadedData]       = useState({ properties: [], farms: [], camps: [] })
  const [selectedFeature, setSelectedFeature] = useState(null)
  const [layerVisibility, setLayerVisibility] = useState(DEFAULT_VISIBILITY)
  const [showObsModal, setShowObsModal]   = useState(false)
  const [operations, setOperations]       = useState([])

  const handleLayerToggle = (id, visible) =>
    setLayerVisibility((prev) => ({ ...prev, [id]: visible }))

  const reload = () => setReloadKey((k) => k + 1)

  // Load operations whenever we have a property
  useEffect(() => {
    const propertyId = loadedData.properties[0]?.id
    if (!propertyId) return
    api.getOperations(propertyId).then(setOperations).catch(console.error)
  }, [loadedData.properties])

  const handleModeChange = (newMode) => {
    setMode(newMode)
    if (newMode === 'view') setPendingGeometry(null)
    if (newMode !== 'view') setSelectedFeature(null)
  }

  const handleDrawComplete = (geometry) => {
    setPendingGeometry(geometry)
  }

  const handleDataLoaded = (data) => {
    setLoadedData(data)
  }

  const handleFeatureClick = (feature) => {
    if (mode !== 'view') return
    setSelectedFeature(feature)
  }

  // ---- Area save (property / farm / camp) ----
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

  // ---- Point asset save ----
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
        onDrawComplete={handleDrawComplete}
        onDataLoaded={handleDataLoaded}
        onFeatureClick={handleFeatureClick}
      />

      <Toolbar
        mode={mode}
        onModeChange={handleModeChange}
        onObservationClick={() => setShowObsModal(true)}
      />

      <LayerControl visibility={layerVisibility} onChange={handleLayerToggle} />

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
          onSaved={() => { setShowObsModal(false); reload() }}
          onCancel={() => setShowObsModal(false)}
        />
      )}

      {/* Feature detail / edit panel */}
      {selectedFeature && !pendingGeometry && !showObsModal && (
        <FeaturePanel
          feature={selectedFeature}
          onClose={() => setSelectedFeature(null)}
          onSaved={() => { reload(); setSelectedFeature(null) }}
          onDeleted={() => { reload(); setSelectedFeature(null) }}
        />
      )}
    </div>
  )
}
