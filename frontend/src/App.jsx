import { useState } from 'react'
import Map from './components/Map'
import Toolbar from './components/Toolbar'
import DrawPropertyModal from './components/DrawPropertyModal'
import { api } from './api'

export default function App() {
  const [mode, setMode] = useState('view')
  const [pendingGeometry, setPendingGeometry] = useState(null)
  const [saving, setSaving] = useState(false)

  // Called by Map when the user finishes drawing a polygon
  const handleDrawComplete = (geometry) => {
    setPendingGeometry(geometry)
    // Keep mode as 'draw_property' so Map holds the draw shape visible
  }

  const handleModeChange = (newMode) => {
    setMode(newMode)
    if (newMode === 'view') {
      setPendingGeometry(null)
    }
  }

  const handleSaveProperty = async ({ name, owner }) => {
    if (!pendingGeometry) return
    setSaving(true)
    try {
      await api.createProperty({ name, owner, boundary: pendingGeometry })
      // Reset state and reload map
      setPendingGeometry(null)
      setMode('view')
      // Signal map to reload properties
      setReloadKey((k) => k + 1)
    } catch (err) {
      console.error('Failed to save property:', err)
      alert('Failed to save property: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const [reloadKey, setReloadKey] = useState(0)

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Map
        mode={mode}
        reloadKey={reloadKey}
        onDrawComplete={handleDrawComplete}
      />
      <Toolbar mode={mode} onModeChange={handleModeChange} />
      {pendingGeometry && (
        <DrawPropertyModal
          saving={saving}
          onSave={handleSaveProperty}
          onCancel={() => {
            setPendingGeometry(null)
            setMode('view')
          }}
        />
      )}
    </div>
  )
}
