import { useState } from 'react'
import Map from './components/Map'
import Toolbar from './components/Toolbar'
import DrawAreaModal from './components/DrawAreaModal'
import { api } from './api'

export default function App() {
  const [mode, setMode] = useState('view')
  const [reloadKey, setReloadKey] = useState(0)
  const [pendingGeometry, setPendingGeometry] = useState(null)
  const [saving, setSaving] = useState(false)

  // Spatial data loaded from map — used to populate modal dropdowns
  const [loadedData, setLoadedData] = useState({ properties: [], farms: [], camps: [] })

  const handleModeChange = (newMode) => {
    setMode(newMode)
    if (newMode === 'view') setPendingGeometry(null)
  }

  const handleDrawComplete = (geometry) => {
    setPendingGeometry(geometry)
  }

  const handleDataLoaded = (data) => {
    setLoadedData(data)
  }

  const handleSave = async ({ name, owner, parentId }) => {
    if (!pendingGeometry) return
    setSaving(true)
    try {
      if (mode === 'draw_property') {
        await api.createProperty({ name, owner, boundary: pendingGeometry })

      } else if (mode === 'draw_farm') {
        // Farms belong to the first property (single-property system for now)
        const propertyId = loadedData.properties[0]?.id
        if (!propertyId) throw new Error('No property found. Draw a property boundary first.')
        await api.createArea({
          propertyId,
          level: 'farm',
          name,
          boundary: pendingGeometry,
        })

      } else if (mode === 'draw_camp') {
        // parentId is the selected farm; derive propertyId from it
        const parentFarm = loadedData.farms.find((f) => f.id === parentId)
        const propertyId = parentFarm?.property_id ?? loadedData.properties[0]?.id
        if (!propertyId) throw new Error('No property found. Draw a property boundary first.')
        await api.createArea({
          propertyId,
          parentId: parentId || null,
          level: 'camp',
          name,
          boundary: pendingGeometry,
        })
      }

      setPendingGeometry(null)
      setMode('view')
      setReloadKey((k) => k + 1)
    } catch (err) {
      console.error('Save failed:', err)
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Map
        mode={mode}
        reloadKey={reloadKey}
        onDrawComplete={handleDrawComplete}
        onDataLoaded={handleDataLoaded}
      />
      <Toolbar mode={mode} onModeChange={handleModeChange} />
      {pendingGeometry && (
        <DrawAreaModal
          drawMode={mode}
          properties={loadedData.properties}
          farms={loadedData.farms}
          saving={saving}
          onSave={handleSave}
          onCancel={() => {
            setPendingGeometry(null)
            setMode('view')
          }}
        />
      )}
    </div>
  )
}
