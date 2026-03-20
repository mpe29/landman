import { useState, useEffect, useRef } from 'react'
import { T, C, PANEL_SHELL } from '../constants/theme'
import { api } from '../api'

// Fields shown to everyone (self, admin, co-member)
const BASIC_FIELDS = [
  {
    title: 'Personal Details',
    fields: [
      { key: 'full_name',   label: 'Full Name',    type: 'text' },
      { key: 'email',       label: 'Email',         type: 'text', readOnly: true },
      { key: 'phone',       label: 'Cell Number',   type: 'tel' },
    ],
  },
]

// Fields only shown to self and admin
const SENSITIVE_FIELDS = [
  {
    title: 'Identity',
    fields: [
      { key: 'date_of_birth', label: 'Date of Birth', type: 'date' },
      { key: 'id_number',     label: 'ID Number',     type: 'text' },
      { key: 'address',       label: 'Address',        type: 'textarea' },
    ],
  },
  {
    title: 'Emergency Contact',
    fields: [
      { key: 'emergency_contact', label: 'Contact Name',  type: 'text' },
      { key: 'emergency_phone',   label: 'Contact Phone', type: 'tel' },
    ],
  },
  {
    title: 'Documents',
    fields: [
      { key: 'selfie_url',          label: 'Profile Image',    type: 'image' },
      { key: 'drivers_license_url', label: "Driver's License", type: 'image' },
    ],
  },
  {
    title: 'Notes',
    fields: [
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
]


export default function ProfilePanel({ onClose, viewUserId, isOwnProfile }) {
  const [profile, setProfile]       = useState(null)
  const [form, setForm]             = useState({})
  const [loadState, setLoadState]   = useState('loading') // 'loading' | 'loaded' | 'error'
  const [saving, setSaving]         = useState(false)
  const [saveMsg, setSaveMsg]       = useState(null)
  const [imageUrls, setImageUrls]   = useState({}) // resolved signed URLs
  const fileInputRef = useRef(null)
  const [uploadField, setUploadField] = useState(null)

  // Determined from server response
  const [accessLevel, setAccessLevel] = useState(null) // 'self' | 'admin' | 'member'

  // Self can always edit; admin can edit non-admin profiles
  const isAdminEditingNonAdmin = accessLevel === 'admin' && !profile?.is_admin
  const editable = accessLevel === 'self' || isAdminEditingNonAdmin
  const canSeeSensitive = accessLevel === 'self' || accessLevel === 'admin'

  const reloadProfile = async () => {
    let data
    if (isOwnProfile) {
      data = await api.getProfile(viewUserId)
      data.access_level = 'self'
    } else {
      data = await api.getProfileById(viewUserId)
    }
    if (data) {
      setProfile(data)
      setForm({ ...data })
      setAccessLevel(data.access_level || (isOwnProfile ? 'self' : 'member'))
      // Resolve signed URLs in background (don't block loading state)
      const urls = {}
      for (const field of ['selfie_url', 'drivers_license_url']) {
        if (data[field]) {
          urls[field] = await api.getProfileImageUrl(data[field])
        }
      }
      setImageUrls(urls)
    }
    return data
  }

  useEffect(() => {
    setLoadState('loading')
    reloadProfile()
      .then(() => setLoadState('loaded'))
      .catch((err) => { console.error('Failed to load profile:', err); setLoadState('error') })
  }, [viewUserId])

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setSaveMsg(null)
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveMsg(null)
    try {
      const allFields = [...BASIC_FIELDS, ...SENSITIVE_FIELDS]
      const updates = {}
      for (const section of allFields) {
        for (const field of section.fields) {
          if (field.readOnly || field.type === 'image') continue
          if (form[field.key] !== profile[field.key]) {
            updates[field.key] = form[field.key] || null
          }
        }
      }
      if (Object.keys(updates).length > 0) {
        if (isAdminEditingNonAdmin) {
          await api.updateProfileById(viewUserId, updates)
        } else {
          await api.updateProfile(updates)
        }
        await reloadProfile()
      }
      setSaveMsg('Saved')
      setTimeout(() => setSaveMsg(null), 2000)
    } catch (err) {
      setSaveMsg('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !uploadField) return
    try {
      setSaving(true)
      // When admin uploads for another user, pass their userId
      const targetUserId = isAdminEditingNonAdmin ? viewUserId : null
      const storedPath = await api.uploadProfileImage(file, uploadField, targetUserId)
      if (isAdminEditingNonAdmin) {
        await api.updateProfileById(viewUserId, { [uploadField]: storedPath })
      } else {
        await api.updateProfile({ [uploadField]: storedPath })
      }
      await reloadProfile()
      setSaveMsg('Image uploaded')
      setTimeout(() => setSaveMsg(null), 2000)
    } catch (err) {
      setSaveMsg('Upload failed: ' + err.message)
    } finally {
      setSaving(false)
      setUploadField(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDownload = async (fieldKey) => {
    const url = imageUrls[fieldKey]
    if (!url) return
    window.open(url, '_blank')
  }

  const allFields = [...BASIC_FIELDS, ...(canSeeSensitive ? SENSITIVE_FIELDS : [])]

  const hasChanges = profile && allFields.some((section) =>
    section.fields.some((f) => !f.readOnly && f.type !== 'image' && form[f.key] !== profile[f.key])
  )

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          <span style={s.title}>
            {accessLevel === 'self' ? 'My Profile' : (profile?.full_name || 'User Profile')}
          </span>
          <button style={s.closeBtn} onClick={onClose}>&times;</button>
        </div>

        {/* Role + access badge */}
        {profile && (
          <div style={s.roleBanner}>
            {profile.role && (
              <span style={s.roleTag}>{profile.role}</span>
            )}
            {profile.is_admin && <span style={s.adminTag}>Admin</span>}
            {profile.status === 'pending' && <span style={s.pendingTag}>Pending</span>}
            {accessLevel && accessLevel !== 'self' && (
              <span style={s.accessTag}>
                {isAdminEditingNonAdmin ? 'Editing' : accessLevel === 'admin' ? 'Full view' : 'Limited view'}
              </span>
            )}
          </div>
        )}

        {/* Content */}
        <div style={s.content}>
          {loadState !== 'loaded' || !profile ? (
            <div style={s.empty}>{loadState === 'error' ? 'Profile not found' : 'Loading...'}</div>
          ) : (
            <>
              {allFields.map((section) => (
                <div key={section.title} style={s.section}>
                  <div style={s.sectionTitle}>{section.title}</div>
                  {section.fields.map((field) => (
                    <div key={field.key} style={s.fieldRow}>
                      <label style={s.label}>{field.label}</label>
                      {field.type === 'image' ? (
                        <ImageField
                          url={imageUrls[field.key]}
                          editable={editable}
                          onUpload={() => {
                            setUploadField(field.key)
                            fileInputRef.current?.click()
                          }}
                          onDownload={() => handleDownload(field.key)}
                        />
                      ) : field.type === 'textarea' ? (
                        editable ? (
                          <textarea
                            style={s.textarea}
                            value={form[field.key] || ''}
                            onChange={(e) => handleChange(field.key, e.target.value)}
                            rows={3}
                          />
                        ) : (
                          <div style={s.readOnly}>{form[field.key] || '—'}</div>
                        )
                      ) : (
                        editable && !field.readOnly ? (
                          <input
                            type={field.type}
                            style={s.input}
                            value={form[field.key] || ''}
                            onChange={(e) => handleChange(field.key, e.target.value)}
                          />
                        ) : (
                          <div style={s.readOnly}>
                            {field.type === 'date' && form[field.key]
                              ? new Date(form[field.key]).toLocaleDateString('en-ZA')
                              : form[field.key] || '—'}
                          </div>
                        )
                      )}
                    </div>
                  ))}
                </div>
              ))}

              {/* Save button (own profile only) */}
              {editable && (
                <div style={s.footer}>
                  <button
                    style={{ ...s.saveBtn, opacity: hasChanges ? 1 : 0.5 }}
                    onClick={handleSave}
                    disabled={saving || !hasChanges}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  {saveMsg && (
                    <div style={{
                      ...s.saveMsg,
                      color: saveMsg.startsWith('Error') ? T.danger : '#15803d',
                    }}>
                      {saveMsg}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Hidden file input for image uploads */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleImageUpload}
        />
      </div>
    </div>
  )
}


/* ── Image Field ─────────────────────────────────────────────────── */
function ImageField({ url, editable, onUpload, onDownload }) {
  if (!url && !editable) {
    return <div style={s.readOnly}>—</div>
  }

  return (
    <div style={s.imageField}>
      {url ? (
        <>
          <img src={url} alt="" style={s.imageThumbnail} />
          <div style={s.imageActions}>
            <button style={s.imgBtn} onClick={onDownload}>Download</button>
            {editable && <button style={s.imgBtn} onClick={onUpload}>Replace</button>}
          </div>
        </>
      ) : (
        <button style={s.uploadBtn} onClick={onUpload}>Upload</button>
      )}
    </div>
  )
}


/* ── Styles ──────────────────────────────────────────────────────── */
const s = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 9100,
    background: 'rgba(0,0,0,0.35)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  panel: {
    ...PANEL_SHELL,
    width: '94%', maxWidth: 480, maxHeight: '85vh',
    display: 'flex', flexDirection: 'column',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 18px', borderBottom: `1px solid ${T.surfaceBorder}`,
  },
  title: {
    fontSize: 14, fontWeight: 700, color: C.deepOlive,
    letterSpacing: '0.08em',
  },
  closeBtn: {
    background: 'none', border: 'none', fontSize: 20,
    color: T.textMuted, cursor: 'pointer', fontFamily: 'inherit',
    lineHeight: 1, padding: 0,
  },
  roleBanner: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 18px', background: C.deepOlive + '08',
    borderBottom: `1px solid ${T.surfaceBorder}`,
  },
  roleTag: {
    fontSize: 11, fontWeight: 700, color: T.text,
    textTransform: 'capitalize',
  },
  adminTag: {
    fontSize: 9, fontWeight: 700, color: C.deepOlive,
    background: C.deepOlive + '18', padding: '2px 6px',
    borderRadius: 4, letterSpacing: '0.06em',
  },
  pendingTag: {
    fontSize: 9, fontWeight: 700, color: T.warn,
    background: T.warnBg, padding: '2px 6px', borderRadius: 4,
  },
  accessTag: {
    fontSize: 9, fontWeight: 600, color: T.textMuted,
    background: T.surfaceBorder, padding: '2px 6px',
    borderRadius: 4, marginLeft: 'auto',
  },
  content: {
    flex: 1, overflowY: 'auto', padding: '4px 0',
  },
  empty: {
    textAlign: 'center', color: T.textMuted, fontSize: 13, padding: 24,
  },
  section: {
    padding: '8px 18px 12px',
    borderBottom: `1px solid ${T.surfaceBorder}`,
  },
  sectionTitle: {
    fontSize: 9, fontWeight: 700, color: T.textMuted,
    letterSpacing: '0.1em', textTransform: 'uppercase',
    marginBottom: 8, marginTop: 4,
  },
  fieldRow: {
    marginBottom: 10,
  },
  label: {
    display: 'block', fontSize: 11, fontWeight: 600, color: T.textMuted,
    marginBottom: 3,
  },
  input: {
    width: '100%', padding: '8px 10px',
    border: `1px solid ${T.surfaceBorder}`, borderRadius: 6,
    fontSize: 13, fontFamily: 'inherit', outline: 'none',
    background: '#fff', color: T.text, boxSizing: 'border-box',
  },
  textarea: {
    width: '100%', padding: '8px 10px',
    border: `1px solid ${T.surfaceBorder}`, borderRadius: 6,
    fontSize: 13, fontFamily: 'inherit', outline: 'none',
    background: '#fff', color: T.text, boxSizing: 'border-box',
    resize: 'vertical',
  },
  readOnly: {
    fontSize: 13, color: T.text, padding: '6px 0',
    minHeight: 20,
  },
  imageField: {
    display: 'flex', alignItems: 'center', gap: 10,
  },
  imageThumbnail: {
    width: 64, height: 64, objectFit: 'cover',
    borderRadius: 8, border: `1px solid ${T.surfaceBorder}`,
  },
  imageActions: {
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  imgBtn: {
    padding: '4px 10px', fontSize: 10, fontWeight: 600,
    background: T.brandBg, color: C.deepOlive,
    border: `1px solid ${T.brandBorder}`, borderRadius: 4,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  uploadBtn: {
    padding: '8px 16px', fontSize: 11, fontWeight: 600,
    background: T.brandBg, color: C.deepOlive,
    border: `1px dashed ${T.brandBorder}`, borderRadius: 6,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  footer: {
    padding: '12px 18px', borderTop: `1px solid ${T.surfaceBorder}`,
  },
  saveBtn: {
    width: '100%', padding: '10px 0',
    background: C.deepOlive, color: C.panelBg,
    border: 'none', borderRadius: 8, cursor: 'pointer',
    fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
    transition: 'opacity 0.15s',
  },
  saveMsg: {
    fontSize: 11, textAlign: 'center', marginTop: 6,
  },
}
