import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { C, T } from './constants/theme'
import Map from './components/Map'
import MainMenu from './components/MainMenu'
import Toolbar from './components/Toolbar'
import LayerControl from './components/LayerControl'
import DrawAreaModal from './components/DrawAreaModal'
import DrawPointModal from './components/DrawPointModal'
import ObservationModal from './components/ObservationModal'
import ObservationFilterPanel from './components/ObservationFilterPanel'
import FeaturePanel from './components/FeaturePanel'
import DevicesPanel from './components/DevicesPanel'
import ImageStrip, { STRIP_HEIGHT, COLLAPSED_H } from './components/ImageStrip'
import Lightbox from './components/Lightbox'
import LoginScreen from './components/LoginScreen'
import JoinScreen from './components/JoinScreen'
import PendingScreen from './components/PendingScreen'
import UserManagementPanel from './components/UserManagementPanel'
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

// ── Parse #/join/TOKEN from URL ──────────────────────────────────
function getJoinToken() {
  const hash = window.location.hash
  const match = hash.match(/^#\/join\/(.+)$/)
  return match ? match[1] : null
}

export default function App() {
  // ── Auth state (always declared, never conditional) ─────────────
  const [session, setSession]           = useState(null)
  const [authLoading, setAuthLoading]   = useState(true)
  const [memberships, setMemberships]   = useState([])
  const [membershipsLoaded, setMembershipsLoaded] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [showUserMgmt, setShowUserMgmt] = useState(false)
  const [joinToken, setJoinToken] = useState(getJoinToken)

  // ── App state (always declared) ─────────────────────────────────
  const [mode, setMode]                     = useState('view')
  const [reloadKey, setReloadKey]           = useState(0)
  const [pendingGeometry, setPendingGeometry] = useState(null)
  const [saving, setSaving]                 = useState(false)
  const [editingBoundary, setEditingBoundary] = useState(null)
  const [editedGeometry, setEditedGeometry]   = useState(null)
  const [loadedData, setLoadedData]         = useState({ properties: [], farms: [], camps: [], observations: [] })
  const [selectedFeature, setSelectedFeature] = useState(null)
  const [showObsModal, setShowObsModal]     = useState(false)
  const [operations, setOperations]         = useState([])
  const [openPanel, setOpenPanel]           = useState(null)
  const [layerVisibility, setLayerVisibility] = useState(() =>
    ({ ...DEFAULT_VISIBILITY, ...loadLS('landman_layer_visibility', {}) })
  )
  const [homeView, setHomeView]   = useState(() => loadLS('landman_home_view', null))
  const [obsFilter, setObsFilter] = useState(() => loadLS('landman_obs_filter', DEFAULT_OBS_FILTER))
  const [obsMode, setObsMode]       = useState('individual')
  const [deviceMode, setDeviceMode] = useState('individual')
  const [tagTypes, setTagTypes]     = useState([])

  // ── Viewport observations (for ImageStrip) ─────────────────
  const [viewportObs, setViewportObs] = useState([])
  const [lightboxObs, setLightboxObs] = useState(null)
  const [stripCollapsed, setStripCollapsed] = useState(false)
  const [hoverLine, setHoverLine] = useState(null)
  const mapInstanceRef = useRef(null)

  const handleMapReady = useCallback((m) => { mapInstanceRef.current = m }, [])

  const handleStripHover = useCallback((info) => {
    if (!info || !mapInstanceRef.current) { setHoverLine(null); return }
    const { obs, x, y } = info
    const coords = obs.geom?.coordinates
    if (!coords) { setHoverLine(null); return }
    const dot = mapInstanceRef.current.project(coords)
    setHoverLine({ thumbX: x, thumbY: y, dotX: dot.x, dotY: dot.y })
  }, [])

  const vpDebounceRef = useRef(null)
  const handleViewportObs = useCallback((vpFeatures) => {
    if (vpDebounceRef.current) clearTimeout(vpDebounceRef.current)
    vpDebounceRef.current = setTimeout(() => {
      const idSet = new Set(vpFeatures.map((f) => f.id))
      const full = loadedData.observations.filter((o) => idSet.has(o.id))
      setViewportObs(full)
    }, 200)
  }, [loadedData.observations])

  const showImageStrip = obsMode !== 'hidden' && mode === 'view'

  // ── Auth effects ────────────────────────────────────────────────
  useEffect(() => {
    api.getSession().then((s) => {
      setSession(s)
      setAuthLoading(false)
    })
    const { data: { subscription } } = api.onAuthStateChange((_event, s) => {
      setSession(s)
      if (s && window.location.hash.startsWith('#/join/')) {
        window.history.replaceState(null, '', window.location.pathname + '#')
        setJoinToken(null)
      }
      if (!s) { setMemberships([]); setMembershipsLoaded(false); setPendingCount(0) }
    })
    return () => subscription.unsubscribe()
  }, [])

  // Load memberships when session changes
  useEffect(() => {
    if (!session) { setMembershipsLoaded(true); return }
    setMembershipsLoaded(false)
    api.getMyMemberships()
      .then((m) => { setMemberships(m); setMembershipsLoaded(true) })
      .catch((err) => { console.error(err); setMembershipsLoaded(true) })
  }, [session])

  // Derived auth values
  const activeMembership = memberships[0] || null
  const isAdmin = activeMembership?.is_admin || false
  const activePropertyId = activeMembership?.property_id || null

  // Pending count for admins
  useEffect(() => {
    if (!isAdmin || !activePropertyId) return
    api.getPendingCount(activePropertyId).then(setPendingCount).catch(console.error)
  }, [isAdmin, activePropertyId])

  // ── App effects (only run when authenticated) ───────────────────
  const filteredObsCount = useMemo(
    () => filterObservations(loadedData.observations, obsFilter).length,
    [loadedData.observations, obsFilter]
  )

  useEffect(() => {
    if (!session || !membershipsLoaded || memberships.length === 0) return
    const propertyId = loadedData.properties[0]?.id
    api.getObservationTagTypes(propertyId || null).then(setTagTypes).catch(console.error)
  }, [loadedData.properties, session, membershipsLoaded, memberships.length])

  useEffect(() => {
    if (!session || !membershipsLoaded || memberships.length === 0) return
    const propertyId = loadedData.properties[0]?.id
    if (!propertyId) return
    api.getOperations(propertyId).then(setOperations).catch(console.error)
  }, [loadedData.properties, session, membershipsLoaded, memberships.length])

  // ── Handlers ────────────────────────────────────────────────────
  const handlePanelOpen = (id) => setOpenPanel((prev) => prev === id ? null : id)
  const handleLayerToggle = (id, visible) => {
    setLayerVisibility((prev) => {
      const next = { ...prev, [id]: visible }
      saveLS('landman_layer_visibility', next)
      return next
    })
  }
  const handleSetHome = ({ center, zoom }) => {
    const hv = { center, zoom, layerVisibility }
    setHomeView(hv)
    saveLS('landman_home_view', hv)
  }
  const handleRestoreVisibility = (vis) => {
    setLayerVisibility(vis)
    saveLS('landman_layer_visibility', vis)
  }
  const handleObsFilterChange = (next) => {
    setObsFilter(next)
    saveLS('landman_obs_filter', next)
  }

  const cycleObs    = () => setObsMode((m) => m === 'individual' ? 'heatmap' : m === 'heatmap' ? 'hidden' : 'individual')
  const cycleDevice = () => setDeviceMode((m) => m === 'individual' ? 'heatmap' : m === 'heatmap' ? 'hidden' : 'individual')

  const handleAddTagType = async (name, emoji, color) => {
    const propertyId = loadedData.properties[0]?.id
    const created = await api.createObservationTagType({ propertyId, name, emoji, color })
    setTagTypes((prev) => [...prev, created])
  }

  const reload = () => setReloadKey((k) => k + 1)

  const handleModeChange = (newMode) => {
    setMode(newMode)
    if (newMode === 'view') { setPendingGeometry(null); setEditingBoundary(null); setEditedGeometry(null) }
    if (newMode !== 'view') setSelectedFeature(null)
  }

  const handleEditBoundary = ({ featureType, id, name, boundary }) => {
    setEditingBoundary({ featureType, id, name, boundary })
    setEditedGeometry(null)
    setSelectedFeature(null)
    setMode('edit_boundary')
  }

  const handleSaveBoundary = async () => {
    if (!editingBoundary) return
    const geometry = editedGeometry ?? editingBoundary.boundary
    setSaving(true)
    try {
      if (editingBoundary.featureType === 'area') {
        await api.updateAreaBoundary(editingBoundary.id, geometry)
      } else if (editingBoundary.featureType === 'property') {
        await api.updatePropertyBoundary(editingBoundary.id, geometry)
      }
      setEditingBoundary(null)
      setEditedGeometry(null)
      setMode('view')
      reload()
    } catch (err) {
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDrawComplete = (geometry) => setPendingGeometry(geometry)
  const handleDataLoaded   = (data) => setLoadedData(data)

  const handleFeatureClick = (feature) => {
    if (mode !== 'view') return
    setSelectedFeature(feature)
  }

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

  const handleLogout = () => api.signOut()

  const isAreaDraw  = AREA_DRAW_MODES.has(mode)
  const isPointDraw = POINT_DRAW_MODES.has(mode)

  // ── Auth gates (render-time only, after all hooks) ──────────────
  if (authLoading) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: `linear-gradient(135deg, ${C.deepOlive} 0%, ${C.pistachioGreen} 100%)` }}>
        <div style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 800, fontSize: 28,
          letterSpacing: '0.14em', color: C.panelBg }}>LANDMAN</div>
      </div>
    )
  }
  if (joinToken) {
    // Sign out any existing session so the join user can authenticate with their PIN
    if (session) { api.signOut(); return null }
    return <JoinScreen token={joinToken} />
  }
  if (!session) return <LoginScreen />
  if (!membershipsLoaded) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: `linear-gradient(135deg, ${C.deepOlive} 0%, ${C.pistachioGreen} 100%)` }}>
        <div style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 800, fontSize: 28,
          letterSpacing: '0.14em', color: C.panelBg }}>LANDMAN</div>
      </div>
    )
  }
  if (memberships.length === 0) return <PendingScreen />

  // ── Main app (authenticated + has membership) ───────────────────
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Map
        mode={mode}
        editBoundary={editingBoundary}
        reloadKey={reloadKey}
        layerVisibility={layerVisibility}
        obsFilter={obsFilter}
        homeView={homeView}
        onSetHome={handleSetHome}
        onRestoreVisibility={handleRestoreVisibility}
        onDrawComplete={handleDrawComplete}
        onDrawUpdate={setEditedGeometry}
        onDataLoaded={handleDataLoaded}
        onFeatureClick={handleFeatureClick}
        onViewportObs={handleViewportObs}
        onMapReady={handleMapReady}
        selectedObsId={selectedFeature?.featureType === 'observation' ? selectedFeature.data?.id : null}
        obsMode={obsMode}
        deviceMode={deviceMode}
      />

      {/* ── Top-left: app menu ── */}
      <MainMenu
        isOpen={openPanel === 'menu'}
        onOpen={() => handlePanelOpen('menu')}
        onLogout={handleLogout}
        isAdmin={isAdmin}
        pendingCount={pendingCount}
        onUserManagement={() => { setShowUserMgmt(true); setOpenPanel(null) }}
      />

      {/* ── Bottom-left: stacked panels (only one open at a time) ── */}
      <div style={{ ...stackStyle, bottom: showImageStrip ? (stripCollapsed ? COLLAPSED_H + 46 : STRIP_HEIGHT + 10) : 32 }}>
        <Toolbar
          mode={mode}
          onModeChange={handleModeChange}
          isOpen={openPanel === 'create'}
          onOpen={() => handlePanelOpen('create')}
        />
        <LayerControl
          visibility={layerVisibility}
          onChange={handleLayerToggle}
          isOpen={openPanel === 'layers'}
          onOpen={() => handlePanelOpen('layers')}
        />
        {/* DEVICES + display mode toggle side by side */}
        <div style={observeRowStyle}>
          <DevicesPanel
            isOpen={openPanel === 'devices'}
            onOpen={() => handlePanelOpen('devices')}
          />
          <button
            style={{ ...heatBtnStyle, ...(deviceMode !== 'hidden' ? devBtnOnStyle : dimBtnStyle) }}
            onClick={cycleDevice}
            title={deviceMode === 'individual' ? 'Switch to device heatmap' : deviceMode === 'heatmap' ? 'Hide devices' : 'Show devices'}
          >
            {deviceMode === 'individual' ? '●' : deviceMode === 'heatmap' ? '≋' : '○'}
          </button>
        </div>
        {/* OBSERVE + display mode toggle side by side */}
        <div style={observeRowStyle}>
          <ObservationFilterPanel
            observations={loadedData.observations}
            tagTypes={tagTypes}
            filter={obsFilter}
            onChange={handleObsFilterChange}
            onAddTagType={handleAddTagType}
            filteredCount={filteredObsCount}
            onObservationClick={() => setShowObsModal(true)}
            isOpen={openPanel === 'observe'}
            onOpen={() => handlePanelOpen('observe')}
          />
          <button
            style={{ ...heatBtnStyle, ...(obsMode !== 'hidden' ? heatBtnOnStyle : dimBtnStyle) }}
            onClick={cycleObs}
            title={obsMode === 'individual' ? 'Switch to heatmap' : obsMode === 'heatmap' ? 'Hide observations' : 'Show observations'}
          >
            {obsMode === 'individual' ? '●' : obsMode === 'heatmap' ? '≋' : '○'}
          </button>
        </div>
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

      {/* Feature detail / edit panel — skip for observations (handled by ImageStrip + Lightbox) */}
      {selectedFeature && selectedFeature.featureType !== 'observation' && !pendingGeometry && !showObsModal && !editingBoundary && (
        <FeaturePanel
          feature={selectedFeature}
          camps={loadedData.camps}
          propertyId={loadedData.properties[0]?.id}
          tagTypes={tagTypes}
          onClose={() => setSelectedFeature(null)}
          onSaved={() => { reload(); setSelectedFeature(null) }}
          onDeleted={() => { reload(); setSelectedFeature(null) }}
          onEditBoundary={handleEditBoundary}
        />
      )}

      {/* Edit boundary floating bar */}
      {editingBoundary && (
        <EditBoundaryBar
          name={editingBoundary.name}
          saving={saving}
          onSave={handleSaveBoundary}
          onCancel={() => { setEditingBoundary(null); setEditedGeometry(null); setMode('view') }}
        />
      )}

      {/* Bottom image strip — viewport-filtered observations */}
      {showImageStrip && (
        <ImageStrip
          observations={viewportObs}
          selectedObsId={selectedFeature?.featureType === 'observation' ? selectedFeature.data?.id : null}
          onSelect={(obs) => handleFeatureClick({ featureType: 'observation', data: obs })}
          onImageClick={(obs) => setLightboxObs(obs)}
          collapsed={stripCollapsed}
          onToggleCollapse={() => setStripCollapsed((c) => !c)}
          onHover={handleStripHover}
        />
      )}

      {/* Connector line from hovered thumbnail to map dot */}
      {hoverLine && <ConnectorLine line={hoverLine} />}

      {/* Lightbox for expanded image */}
      {lightboxObs && (
        <Lightbox
          observation={lightboxObs}
          observations={viewportObs.filter((o) => o.image_url).sort((a, b) => new Date(a.observed_at) - new Date(b.observed_at))}
          onClose={() => setLightboxObs(null)}
          onNavigate={(obs) => {
            setLightboxObs(obs)
            handleFeatureClick({ featureType: 'observation', data: obs })
          }}
        />
      )}

      {/* User Management panel (admin only) */}
      {showUserMgmt && activePropertyId && (
        <UserManagementPanel
          propertyId={activePropertyId}
          onClose={() => { setShowUserMgmt(false); if (isAdmin) api.getPendingCount(activePropertyId).then(setPendingCount).catch(() => {}) }}
        />
      )}
    </div>
  )
}

/* ── Edit Boundary floating bar ──────────────────────────────────── */
function EditBoundaryBar({ name, saving, onSave, onCancel }) {
  return (
    <div style={ebBar.wrap}>
      <span style={ebBar.hint}>Editing: <strong>{name}</strong> — drag vertices or click midpoints to add</span>
      <div style={ebBar.btns}>
        <button style={ebBar.cancel} onClick={onCancel} disabled={saving}>Cancel</button>
        <button style={ebBar.save}   onClick={onSave}   disabled={saving}>
          {saving ? 'Saving…' : 'Save Boundary'}
        </button>
      </div>
    </div>
  )
}

/* ── Connector line: thumbnail → map dot ────────────────────────── */
function ConnectorLine({ line }) {
  const { thumbX, thumbY, dotX, dotY } = line
  return (
    <svg
      style={{
        position: 'absolute', inset: 0, zIndex: 11,
        pointerEvents: 'none', overflow: 'visible',
      }}
      width="100%"
      height="100%"
    >
      <line
        x1={dotX} y1={dotY}
        x2={thumbX} y2={thumbY}
        stroke="rgba(255,255,255,0.7)"
        strokeWidth="1.5"
        strokeDasharray="none"
      />
      <circle cx={dotX} cy={dotY} r="4" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
    </svg>
  )
}

const ebBar = {
  wrap: {
    position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)',
    zIndex: 20,
    background: T.surface, backdropFilter: 'blur(12px)',
    border: `1px solid ${T.surfaceBorder}`, borderRadius: 10,
    boxShadow: '0 4px 20px rgba(47,47,47,0.18)',
    padding: '10px 16px',
    display: 'flex', alignItems: 'center', gap: 12,
    whiteSpace: 'nowrap',
  },
  hint: { fontSize: 12, color: T.textMuted },
  btns: { display: 'flex', gap: 8 },
  cancel: {
    background: 'transparent', border: `1px solid ${T.surfaceBorder}`,
    borderRadius: 6, color: T.textMuted, fontSize: 12,
    padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit',
  },
  save: {
    background: C.pistachioGreen, border: 'none',
    borderRadius: 6, color: T.textOnDark, fontSize: 12, fontWeight: 700,
    padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit',
  },
}

const stackStyle = {
  position: 'absolute',
  left: 16,
  zIndex: 10,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 6,
  transition: 'bottom 0.25s ease',
}

const observeRowStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 6,
}

const heatBtnStyle = {
  width: 30, height: 30,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: T.surface, backdropFilter: 'blur(10px)',
  border: `1px solid ${T.surfaceBorder}`, borderRadius: 8,
  boxShadow: T.surfaceShadow, cursor: 'pointer',
  fontSize: 14, color: T.textMuted, fontFamily: 'inherit', padding: 0,
  transition: 'all 0.15s', flexShrink: 0,
}
const heatBtnOnStyle = {
  background: C.burntOrange + '18',
  border: `1px solid ${C.burntOrange}55`,
  color: C.burntOrange,
}
const devBtnOnStyle = {
  background: C.pistachioGreen + '18',
  border: `1px solid ${C.pistachioGreen}55`,
  color: C.pistachioGreen,
}
const dimBtnStyle = { opacity: 0.4 }
