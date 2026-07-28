import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { getMyProperties, addProperty, updateProperty, deleteProperty, getLandlordEnquiries, markEnquiryRead, replyToEnquiry, getStats, getNotifications, markNotificationRead, markAllNotificationsRead, formatPrice, Auth } from '../api'
import { CAMPUSES, haversineKm } from '../campuses'

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

// Find nearest campus filtered to a specific state
function nearestCampusInState(lat, lng, state) {
  const stateTag = state === 'Negeri Sembilan' ? '(NS)'
                 : state === 'Melaka'           ? '(Melaka)'
                 : '(Johor)'
  let best = null, bestDist = Infinity
  for (const [name, pos] of Object.entries(CAMPUSES)) {
    if (!name.includes(stateTag)) continue
    const d = haversineKm(lat, lng, pos.lat, pos.lng)
    if (d < bestDist) { bestDist = d; best = { name, dist: d } }
  }
  // Fallback to any campus if state filter found nothing
  if (!best) {
    for (const [name, pos] of Object.entries(CAMPUSES)) {
      const d = haversineKm(lat, lng, pos.lat, pos.lng)
      if (d < bestDist) { bestDist = d; best = { name, dist: d } }
    }
  }
  return best
}

const EMPTY_FORM = {
  title: '', area: '', state: '', rental_price: '',
  property_type: 'room', gender_preference: 'any',
  distance_to_campus: '', nearest_campus: '',
  latitude: '', longitude: '',
  furnished: 'fully furnished',
  facilities: '', description: '', status: 'available',
  image_url: '',
}

const STATES     = ['Negeri Sembilan', 'Melaka', 'Johor']
const TYPES      = ['room', 'unit']
const FURNISHED  = ['fully furnished', 'partially furnished', 'unfurnished']
const GENDERS    = ['any', 'female', 'male']
const STATUSES   = ['available', 'rented']

function ChartCard({ title, children }) {
  return (
    <div className="card card-body">
      <h3 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)', marginBottom: '1rem', borderBottom: '1px solid #E8DDD0', paddingBottom: '8px' }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

const DONUT_COLORS = ['#4D2D78', '#C9A96E', '#2D8B6F', '#4D7BC4', '#A0522D', '#C0392B', '#8E44AD', '#16A085']

// Donut chart via CSS conic-gradient — best for showing proportions/composition
function DonutChart({ data }) {
  const entries = Object.entries(data)
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1
  let cum = 0
  const segments = entries.map(([, v], i) => {
    const pct = (v / total) * 100
    const seg = `${DONUT_COLORS[i % DONUT_COLORS.length]} ${cum.toFixed(1)}% ${(cum + pct).toFixed(1)}%`
    cum += pct
    return seg
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
      <div style={{ position: 'relative', flexShrink: 0, width: 100, height: 100 }}>
        <div style={{
          width: 100, height: 100, borderRadius: '50%',
          background: `conic-gradient(${segments.join(', ')})`,
        }} />
        <div style={{
          position: 'absolute', inset: '28%', borderRadius: '50%',
          background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text)' }}>{total.toLocaleString()}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', flex: 1 }}>
        {entries.map(([label, value], i) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: 10, height: 10, borderRadius: '2px', background: DONUT_COLORS[i % DONUT_COLORS.length], flexShrink: 0 }} />
            <span style={{ fontSize: '12px', color: 'var(--text2)', flex: 1, textTransform: 'capitalize' }}>{label}</span>
            <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text)' }}>
              {value.toLocaleString()} <span style={{ color: 'var(--text2)', fontWeight: 400 }}>({((value / total) * 100).toFixed(0)}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Vertical column chart — best for ordered/sequential buckets (histogram-style)
function ColumnChart({ data, color }) {
  const entries = Object.entries(data)
  const max = Math.max(...entries.map(([, v]) => v), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '90px' }}>
        {entries.map(([label, value]) => (
          <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: '3px' }}>
            <span style={{ fontSize: '10px', fontWeight: '600', color: 'var(--text)' }}>{value.toLocaleString()}</span>
            <div style={{
              width: '100%',
              height: `${Math.max((value / max) * 76, value > 0 ? 4 : 0)}px`,
              background: color,
              borderRadius: '4px 4px 0 0',
              transition: 'height 0.4s ease',
            }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '6px', borderTop: '1px solid #E8DDD0', paddingTop: '5px' }}>
        {entries.map(([label]) => (
          <div key={label} style={{ flex: 1, fontSize: '10px', color: 'var(--text2)', textAlign: 'center', lineHeight: 1.3 }}>
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}

// Horizontal bar chart — best for ranked categories with long labels
function BarChart({ data, color }) {
  const entries = Object.entries(data)
  const max = Math.max(...entries.map(([, v]) => v), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {entries.map(([label, value]) => (
        <div key={label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text2)', marginBottom: '3px' }}>
            <span style={{ maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
            <span style={{ fontWeight: '600', color: 'var(--text)' }}>{value.toLocaleString()}</span>
          </div>
          <div style={{ background: '#F0EBF8', borderRadius: '4px', height: '8px' }}>
            <div style={{
              height: '8px', borderRadius: '4px',
              background: color,
              width: `${(value / max) * 100}%`,
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// Star rating chart — colour-coded bars per star level
function RatingChart({ data }) {
  const labels = { 1: '1 star', 2: '2 stars', 3: '3 stars', 4: '4 stars', 5: '5 stars' }
  const colors  = { 1: '#C0392B', 2: '#E67E22', 3: '#F1C40F', 4: '#27AE60', 5: '#2980B9' }
  const entries = Object.entries(data).map(([k, v]) => [Number(k), v]).sort((a, b) => b[0] - a[0])
  const max = Math.max(...entries.map(([, v]) => v), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {entries.map(([star, value]) => (
        <div key={star}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text2)', marginBottom: '3px' }}>
            <span>{'★'.repeat(star)}{'☆'.repeat(5 - star)} {labels[star]}</span>
            <span style={{ fontWeight: '600', color: 'var(--text)' }}>{value}</span>
          </div>
          <div style={{ background: '#F0EBF8', borderRadius: '4px', height: '8px' }}>
            <div style={{
              height: '8px', borderRadius: '4px',
              background: colors[star],
              width: `${(value / max) * 100}%`,
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function LandlordDashboard() {
  const navigate = useNavigate()
  const user     = Auth.getUser()

  const [activeTab,   setActiveTab]   = useState('listings')
  const [listings,    setListings]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [editTarget,  setEditTarget]  = useState(null)   // property being edited
  const [form,        setForm]        = useState(EMPTY_FORM)
  const [saving,      setSaving]      = useState(false)
  const [alert,       setAlert]       = useState({ msg: '', type: '' })
  const [deleteId,    setDeleteId]    = useState(null)
  const [enquiries,   setEnquiries]   = useState([])
  const [enqLoading,  setEnqLoading]  = useState(false)
  const [replyText,   setReplyText]   = useState({})   // { [enquiry_id]: text }
  const [replySaving, setReplySaving] = useState({})   // { [enquiry_id]: bool }
  const [geoLoading,  setGeoLoading]  = useState(false)
  const [geoError,    setGeoError]    = useState('')
  const [marketStats,   setMarketStats]   = useState(null)
  const [statsLoading,  setStatsLoading]  = useState(false)
  const [notifs,        setNotifs]        = useState([])
  const [notifsLoading, setNotifsLoading] = useState(false)
  const [formErrors,    setFormErrors]    = useState({})

  useEffect(() => {
    if (!Auth.isLoggedIn() || user?.role !== 'houseowner') {
      navigate('/login')
      return
    }
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const data = await getMyProperties()
      setListings(data || [])
    } catch {
      setListings([])
    } finally {
      setLoading(false)
    }
  }

  async function loadStats() {
    setStatsLoading(true)
    try {
      const data = await getStats()
      setMarketStats(data)
    } catch {
      setMarketStats(null)
    } finally {
      setStatsLoading(false)
    }
  }

  async function loadEnquiries() {
    setEnqLoading(true)
    try {
      const data = await getLandlordEnquiries()
      setEnquiries(data || [])
    } catch {
      setEnquiries([])
    } finally {
      setEnqLoading(false)
    }
  }

  async function loadNotifications() {
    setNotifsLoading(true)
    try {
      const data = await getNotifications()
      setNotifs(data || [])
    } catch {
      setNotifs([])
    } finally {
      setNotifsLoading(false)
    }
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead().catch(() => {})
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  async function handleMarkOneRead(id) {
    await markNotificationRead(id).catch(() => {})
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  async function handleMarkRead(id) {
    try {
      await markEnquiryRead(id)
      setEnquiries(prev => prev.map(e => e.id === id ? { ...e, status: 'read' } : e))
    } catch {}
  }

  async function handleReply(id) {
    const text = (replyText[id] || '').trim()
    if (!text) return
    setReplySaving(prev => ({ ...prev, [id]: true }))
    try {
      const res = await replyToEnquiry(id, text)
      setEnquiries(prev => prev.map(e => e.id === id ? res.enquiry : e))
      setReplyText(prev => ({ ...prev, [id]: '' }))
    } catch {}
    finally {
      setReplySaving(prev => ({ ...prev, [id]: false }))
    }
  }

  function openAdd() {
    setEditTarget(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(prop) {
    setEditTarget(prop)
    setGeoError('')
    setFormErrors({})
    setForm({
      title:              prop.title             || '',
      area:               prop.area              || '',
      state:              prop.state             || '',
      rental_price:       prop.rental_price      || '',
      property_type:      prop.property_type     || 'room',
      gender_preference:  prop.gender_preference || 'any',
      distance_to_campus: prop.distance_to_campus || '',
      nearest_campus:     prop.nearest_campus    || '',
      latitude:           prop.latitude          || '',
      longitude:          prop.longitude         || '',
      furnished:          prop.furnished         || 'fully furnished',
      facilities:         prop.facilities        || '',
      description:        prop.description       || '',
      status:             prop.status            || 'available',
      image_url:          prop.image_url         || '',
    })
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditTarget(null)
    setForm(EMPTY_FORM)
    setFormErrors({})
  }

  const f = (field, val) => {
    setForm(prev => ({ ...prev, [field]: val }))
    setFormErrors(prev => ({ ...prev, [field]: '' }))
  }

  async function autoCalcDistance() {
    if (!form.area || !form.state) {
      setGeoError('Enter area and state first.')
      return
    }
    setGeoLoading(true)
    setGeoError('')
    try {
      const addr = encodeURIComponent(`${form.area}, ${form.state}, Malaysia`)
      const res  = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${addr}&key=${MAPS_KEY}`
      )
      const data = await res.json()
      if (data.status !== 'OK' || !data.results.length) {
        setGeoError('Could not find this address. Try a more specific area name.')
        return
      }
      const { lat, lng } = data.results[0].geometry.location
      const nearest = nearestCampusInState(lat, lng, form.state)
      setForm(prev => ({
        ...prev,
        latitude:           lat,
        longitude:          lng,
        distance_to_campus: nearest.dist,
        nearest_campus:     nearest.name,
      }))
    } catch {
      setGeoError('Distance calculation failed. Please enter manually.')
    } finally {
      setGeoLoading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()

    // ── Validation — collect all errors before blocking ──────────
    const errors = {}

    if (!form.area.trim())
      errors.area = 'Area / neighbourhood is required.'
    else if (/\d/.test(form.area))
      errors.area = 'Area / neighbourhood must not contain numbers.'

    if (!form.state)
      errors.state = 'Please select a state.'

    const price = Number(form.rental_price)
    if (!form.rental_price || isNaN(price) || price <= 0)
      errors.rental_price = 'Monthly rent must be a positive number.'
    else if (price > 99999)
      errors.rental_price = 'Monthly rent seems too high. Please enter a realistic value.'

    if (form.title && /\d/.test(form.title))
      errors.title = 'Title must not contain numbers (e.g. "Single room near UiTM Seremban").'

    if (form.distance_to_campus !== '' && Number(form.distance_to_campus) < 0)
      errors.distance_to_campus = 'Distance to campus cannot be negative.'

    if (form.image_url && !/^https?:\/\/.+\..+/.test(form.image_url))
      errors.image_url = 'Must be a valid URL starting with http:// or https://'

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }
    setFormErrors({})
    setSaving(true)
    try {
      const payload = { ...form, rental_price: Number(form.rental_price), distance_to_campus: form.distance_to_campus ? Number(form.distance_to_campus) : null }
      if (editTarget) {
        await updateProperty(editTarget.id, payload)
        setAlert({ msg: 'Listing updated successfully.', type: 'success' })
      } else {
        await addProperty(payload)
        setAlert({ msg: 'Listing added successfully.', type: 'success' })
      }
      closeForm()
      load()
    } catch (err) {
      setAlert({ msg: err.message, type: 'error' })
    } finally {
      setSaving(false)
      setTimeout(() => setAlert({ msg: '', type: '' }), 4000)
    }
  }

  async function handleDelete(id) {
    try {
      await deleteProperty(id)
      setDeleteId(null)
      setAlert({ msg: 'Listing removed.', type: 'success' })
      load()
    } catch (err) {
      setAlert({ msg: err.message, type: 'error' })
    } finally {
      setTimeout(() => setAlert({ msg: '', type: '' }), 4000)
    }
  }

  const stats = {
    total:     listings.length,
    available: listings.filter(p => p.status === 'available').length,
    rented:    listings.filter(p => p.status === 'rented').length,
  }

  return (
    <div>
      <Navbar />

      <div style={{ background: '#311A50', padding: '1.75rem 0' }}>
        <div className="container">
          <h1 style={{ color: '#fff', fontSize: '22px', marginBottom: '4px' }}>
            Landlord dashboard
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>
            Manage your rental listings
          </p>
        </div>
      </div>
      <hr className="gold-divider" />

      <div className="container" style={{ padding: '1.5rem' }}>

        {alert.msg && (
          <div className={`alert alert-${alert.type}`} style={{ marginBottom: '1rem' }}>
            {alert.msg}
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          {[
            { label: 'Total listings', value: stats.total,     color: '#4D2D78' },
            { label: 'Available',      value: stats.available, color: '#2D8B6F' },
            { label: 'Rented',         value: stats.rented,    color: '#C9A96E' },
          ].map(s => (
            <div key={s.label} className="card card-body" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: '700', color: s.color, fontFamily: "'Playfair Display', serif" }}>
                {s.value}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '4px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '1.25rem', borderBottom: '2px solid #E8DDD0', paddingBottom: '0' }}>
          {[
            { id: 'listings',      label: 'My listings' },
            { id: 'enquiries',     label: `Enquiries${enquiries.length ? ` (${enquiries.filter(e => e.status === 'pending').length} new)` : ''}` },
            { id: 'notifications', label: `Notifications${notifs.filter(n => !n.is_read).length ? ` (${notifs.filter(n => !n.is_read).length})` : ''}` },
            { id: 'insights',      label: 'Market Insights' },
          ].map(t => (
            <button key={t.id}
              onClick={() => { setActiveTab(t.id); if (t.id === 'enquiries') loadEnquiries(); if (t.id === 'insights') loadStats(); if (t.id === 'notifications') loadNotifications() }}
              style={{
                padding: '8px 16px', border: 'none', cursor: 'pointer', fontSize: '13px',
                fontWeight: '600', fontFamily: "'DM Sans', sans-serif",
                background: 'transparent',
                borderBottom: activeTab === t.id ? '2px solid #4D2D78' : '2px solid transparent',
                color: activeTab === t.id ? '#4D2D78' : 'var(--text2)',
                marginBottom: '-2px',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Listings header */}
        {activeTab === 'listings' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '17px' }}>My listings</h2>
          <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add new listing</button>
        </div>
        )}

        {/* Add / Edit form */}
        {showForm && (
          <div className="card" style={{ marginBottom: '1.5rem', border: '2px solid #C4A8E8' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: '600' }}>{editTarget ? 'Edit listing' : 'Add new listing'}</span>
              <button onClick={closeForm} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text2)', lineHeight: 1 }}>×</button>
            </div>
            <div className="card-body">
              <form onSubmit={handleSubmit}>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Area / neighbourhood *</label>
                    <input
                      className="form-input"
                      value={form.area}
                      onChange={e => f('area', e.target.value)}
                      placeholder="e.g. Taman Seremban Jaya"
                      style={formErrors.area ? { borderColor: '#A02D2D' } : {}}
                    />
                    {formErrors.area && <p style={{ color: '#A02D2D', fontSize: '11px', marginTop: '4px' }}>{formErrors.area}</p>}
                  </div>
                  <div className="form-group">
                    <label className="form-label">State *</label>
                    <select
                      className="form-select"
                      value={form.state}
                      onChange={e => f('state', e.target.value)}
                      style={formErrors.state ? { borderColor: '#A02D2D' } : {}}
                    >
                      <option value="">Select state</option>
                      {STATES.map(s => <option key={s}>{s}</option>)}
                    </select>
                    {formErrors.state && <p style={{ color: '#A02D2D', fontSize: '11px', marginTop: '4px' }}>{formErrors.state}</p>}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Monthly rent (RM) *</label>
                    <input
                      className="form-input"
                      type="number" min="1" max="99999"
                      value={form.rental_price}
                      onChange={e => f('rental_price', e.target.value)}
                      placeholder="e.g. 450"
                      style={formErrors.rental_price ? { borderColor: '#A02D2D' } : {}}
                    />
                    {formErrors.rental_price && <p style={{ color: '#A02D2D', fontSize: '11px', marginTop: '4px' }}>{formErrors.rental_price}</p>}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Room type</label>
                    <select className="form-select" value={form.property_type} onChange={e => f('property_type', e.target.value)}>
                      {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Furnished</label>
                    <select className="form-select" value={form.furnished} onChange={e => f('furnished', e.target.value)}>
                      {FURNISHED.map(f => <option key={f}>{f}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Gender preference</label>
                    <select className="form-select" value={form.gender_preference} onChange={e => f('gender_preference', e.target.value)}>
                      {GENDERS.map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Distance to campus (km)</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        className="form-input"
                        type="number" step="0.1" min="0"
                        value={form.distance_to_campus}
                        onChange={e => f('distance_to_campus', e.target.value)}
                        placeholder="e.g. 2.5"
                        style={{ flex: 1, ...(formErrors.distance_to_campus ? { borderColor: '#A02D2D' } : {}) }}
                      />
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={autoCalcDistance}
                        disabled={geoLoading || !form.area || !form.state}
                        style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                      >
                        {geoLoading ? 'Calculating...' : 'Auto-calculate'}
                      </button>
                    </div>
                    {form.nearest_campus && (
                      <div style={{ marginTop: '6px', fontSize: '12px', color: '#2D8B6F', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span>✓</span>
                        <span>Nearest campus: <strong>{form.nearest_campus}</strong> ({form.distance_to_campus} km)</span>
                      </div>
                    )}
                    {geoError && (
                      <div style={{ marginTop: '5px', fontSize: '12px', color: '#A02D2D' }}>{geoError}</div>
                    )}
                    {formErrors.distance_to_campus && <p style={{ color: '#A02D2D', fontSize: '11px', marginTop: '4px' }}>{formErrors.distance_to_campus}</p>}
                  </div>
                  {editTarget && (
                    <div className="form-group">
                      <label className="form-label">Status</label>
                      <select className="form-select" value={form.status} onChange={e => f('status', e.target.value)}>
                        {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Title <span style={{ color: 'var(--text2)', fontWeight: 400 }}>(optional — auto-generated if blank)</span></label>
                  <input
                    className="form-input"
                    value={form.title}
                    onChange={e => f('title', e.target.value)}
                    placeholder="e.g. Single room near UiTM Seremban"
                    style={formErrors.title ? { borderColor: '#A02D2D' } : {}}
                  />
                  {formErrors.title && <p style={{ color: '#A02D2D', fontSize: '11px', marginTop: '4px' }}>{formErrors.title}</p>}
                </div>
                <div className="form-group">
                  <label className="form-label">Photo URL <span style={{ color: 'var(--text2)', fontWeight: 400 }}>(optional — paste a direct image link)</span></label>
                  <input
                    className="form-input"
                    type="url"
                    value={form.image_url}
                    onChange={e => f('image_url', e.target.value)}
                    placeholder="https://example.com/photo.jpg"
                    style={formErrors.image_url ? { borderColor: '#A02D2D' } : {}}
                  />
                  {formErrors.image_url && <p style={{ color: '#A02D2D', fontSize: '11px', marginTop: '4px' }}>{formErrors.image_url}</p>}
                  {form.image_url && !formErrors.image_url && (
                    <img src={form.image_url} alt="preview"
                      onError={e => { e.target.style.display = 'none' }}
                      style={{ marginTop: '8px', width: '100%', height: '140px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #E8DDD0' }} />
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Facilities</label>
                  <input className="form-input" value={form.facilities} onChange={e => f('facilities', e.target.value)} placeholder="e.g. WiFi, aircond, parking, washing machine" />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-input" rows={3} value={form.description} onChange={e => f('description', e.target.value)} placeholder="Describe the room, house rules, nearby amenities..." />
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? 'Saving...' : editTarget ? 'Save changes' : 'Add listing'}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={closeForm}>Cancel</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Listings tab content */}
        {activeTab === 'listings' && loading && (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <div className="spinner" style={{ width: 28, height: 28, margin: '0 auto' }} />
          </div>
        )}

        {activeTab === 'listings' && !loading && listings.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">🏠</div>
            <h3>No listings yet</h3>
            <p>Click "Add new listing" to post your first property</p>
          </div>
        )}

        {activeTab === 'listings' && !loading && listings.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {listings.map(p => (
              <div key={p.id} className="card card-body" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                  background: p.status === 'available' ? '#2D8B6F' : '#C9A96E',
                }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)', marginBottom: '2px' }}>
                    {p.area || p.title}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text2)', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <span>{p.state}</span>
                    <span>·</span>
                    <span style={{ textTransform: 'capitalize' }}>{p.property_type}</span>
                    <span>·</span>
                    <span style={{ textTransform: 'capitalize' }}>{p.furnished}</span>
                    {p.distance_to_campus && <><span>·</span><span>{p.distance_to_campus} km</span></>}
                  </div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: '#4D2D78' }}>
                    {formatPrice(p.rental_price)}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text2)' }}>/ month</div>
                </div>

                <span style={{
                  fontSize: '10px', fontWeight: '600', padding: '3px 10px',
                  borderRadius: '20px', flexShrink: 0,
                  background: p.status === 'available' ? '#D4EDE6' : '#F5EDD8',
                  color:      p.status === 'available' ? '#1A5E4A' : '#7A5E1A',
                }}>
                  {p.status}
                </span>

                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>Edit</button>
                  <button
                    className="btn btn-sm"
                    style={{ background: '#FDE8E8', color: '#A02D2D', border: 'none', cursor: 'pointer', borderRadius: '7px', padding: '5px 12px', fontSize: '12px', fontWeight: '500' }}
                    onClick={() => setDeleteId(p.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Enquiries tab */}
        {activeTab === 'enquiries' && (
          enqLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <div className="spinner" style={{ width: 28, height: 28, margin: '0 auto' }} />
            </div>
          ) : enquiries.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📬</div>
              <h3>No enquiries yet</h3>
              <p>Student enquiries for your listings will appear here</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {enquiries.map(e => {
                const statusColor = e.status === 'pending' ? '#4D2D78'
                                  : e.status === 'replied' ? '#1A5E4A'
                                  : '#7A6B5A'
                const statusBg    = e.status === 'pending' ? '#EDE6F8'
                                  : e.status === 'replied' ? '#D4EDE6'
                                  : '#F4EDE0'
                const statusLabel = e.status === 'pending' ? 'New'
                                  : e.status === 'replied' ? 'Replied'
                                  : 'Read'
                return (
                  <div key={e.id} className="card card-body" style={{
                    borderLeft: `3px solid ${statusColor}`,
                  }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>
                          {e.student_name}
                          <span style={{ fontWeight: 400, color: 'var(--text2)', marginLeft: '6px' }}>· {e.student_email}</span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '2px' }}>
                          For: <strong>{e.property_title}</strong> · {new Date(e.created_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <span style={{ fontSize: '10px', fontWeight: '600', padding: '2px 9px', borderRadius: '20px', background: statusBg, color: statusColor }}>
                          {statusLabel}
                        </span>
                        {e.status === 'pending' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => handleMarkRead(e.id)}>
                            Mark as read
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Student message */}
                    <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, margin: '0 0 12px', background: '#FBF8F2', padding: '10px 12px', borderRadius: '8px' }}>
                      {e.message}
                    </p>

                    {/* Existing reply */}
                    {e.reply && (
                      <div style={{ background: '#D4EDE6', border: '1px solid #8CD4BE', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' }}>
                        <div style={{ fontSize: '11px', fontWeight: '600', color: '#1A5E4A', marginBottom: '4px' }}>
                          Your reply · {new Date(e.replied_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                        <p style={{ fontSize: '13px', color: '#1A5E4A', margin: 0, lineHeight: 1.6 }}>{e.reply}</p>
                      </div>
                    )}

                    {/* Reply input */}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                      <textarea
                        rows={2}
                        className="form-input"
                        style={{ flex: 1, resize: 'vertical', fontSize: '13px' }}
                        placeholder={e.reply ? 'Update your reply…' : 'Write a reply…'}
                        value={replyText[e.id] || ''}
                        onChange={ev => setReplyText(prev => ({ ...prev, [e.id]: ev.target.value }))}
                      />
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ flexShrink: 0 }}
                        disabled={!replyText[e.id]?.trim() || replySaving[e.id]}
                        onClick={() => handleReply(e.id)}
                      >
                        {replySaving[e.id] ? 'Sending…' : e.reply ? 'Update' : 'Send reply'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}
        {/* Notifications tab */}
        {activeTab === 'notifications' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '16px', marginBottom: '2px' }}>Notifications</h2>
                <p style={{ fontSize: '12px', color: 'var(--text2)' }}>
                  Student enquiries, saves, and ratings on your listings
                </p>
              </div>
              {notifs.some(n => !n.is_read) && (
                <button onClick={handleMarkAllRead} style={{
                  fontSize: '12px', color: '#4D2D78', background: 'none',
                  border: '1px solid #C4A8E8', borderRadius: '6px',
                  padding: '5px 12px', cursor: 'pointer', fontWeight: '600',
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  Mark all as read
                </button>
              )}
            </div>

            {notifsLoading ? (
              <div style={{ textAlign: 'center', padding: '3rem' }}>
                <div className="spinner" style={{ width: 28, height: 28, margin: '0 auto 1rem' }} />
              </div>
            ) : notifs.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🔔</div>
                <h3>No notifications yet</h3>
                <p>You'll be notified when students enquire, save, or rate your listings.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {notifs.map(n => (
                  <div key={n.id} style={{
                    display: 'flex', gap: '12px', alignItems: 'flex-start',
                    padding: '12px 14px', borderRadius: '10px',
                    background: n.is_read ? '#FFFCF7' : '#F3EEF9',
                    border: `1px solid ${n.is_read ? '#E8DDD0' : '#C4A8E8'}`,
                  }}>
                    <span style={{ fontSize: '20px', flexShrink: 0 }}>
                      {n.type === 'enquiry' ? '✉️' : n.type === 'save' ? '🔖' : '⭐'}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.5 }}>
                        {n.message}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '3px' }}>
                        {new Date(n.created_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    {!n.is_read && (
                      <button onClick={() => handleMarkOneRead(n.id)} style={{
                        fontSize: '11px', color: '#4D2D78', background: 'none',
                        border: 'none', cursor: 'pointer', flexShrink: 0,
                        fontWeight: '600', fontFamily: "'DM Sans', sans-serif",
                      }}>
                        Mark read
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Market Insights tab */}
        {activeTab === 'insights' && (
          statsLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <div className="spinner" style={{ width: 28, height: 28, margin: '0 auto' }} />
            </div>
          ) : !marketStats ? (
            <div className="empty-state">
              <div className="empty-icon">📊</div>
              <h3>Could not load market data</h3>
              <p>Please try again later</p>
            </div>
          ) : (
            <div>
              {/* Summary row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                {[
                  { label: 'Total properties',  value: marketStats.total_properties,   color: '#4D2D78' },
                  { label: 'Total interactions', value: marketStats.total_interactions, color: '#2D8B6F' },
                  { label: 'Total reviews',      value: marketStats.total_reviews,      color: '#C9A96E' },
                ].map(s => (
                  <div key={s.label} className="card card-body" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '26px', fontWeight: '700', color: s.color, fontFamily: "'Playfair Display', serif" }}>{s.value.toLocaleString()}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '4px' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>

                {/* Donut — proportions of property types */}
                <ChartCard title="Property Type Distribution">
                  <DonutChart data={marketStats.type_breakdown} />
                </ChartCard>

                {/* Column — ordered price buckets (histogram) */}
                <ChartCard title="Price Distribution">
                  <ColumnChart data={marketStats.price_distribution} color="#C9A96E" />
                </ChartCard>

                {/* Horizontal bar — ranked campuses with long names */}
                <ChartCard title="Top Campuses by Supply">
                  <BarChart data={marketStats.campus_demand} color="#2D8B6F" />
                </ChartCard>

                {/* Column — ordered distance buckets (histogram) */}
                <ChartCard title="Distance to Campus">
                  <ColumnChart data={marketStats.distance_buckets} color="#4D7BC4" />
                </ChartCard>

                {/* Star bars — ordinal rating scale */}
                <ChartCard title="Review Ratings">
                  <RatingChart data={marketStats.rating_distribution} />
                </ChartCard>

                {/* Donut — proportions of interaction types */}
                <ChartCard title="Student Interaction Types">
                  <DonutChart data={marketStats.interaction_types} />
                </ChartCard>

              </div>
            </div>
          )
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteId && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
        }}>
          <div className="card card-body" style={{ maxWidth: '380px', width: '90%', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🗑️</div>
            <h3 style={{ marginBottom: '8px' }}>Remove this listing?</h3>
            <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '1.25rem' }}>
              This action cannot be undone. The listing will be permanently deleted.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button className="btn btn-ghost" onClick={() => setDeleteId(null)}>Cancel</button>
              <button
                className="btn btn-sm"
                style={{ background: '#A02D2D', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: '7px', padding: '8px 20px', fontSize: '13px', fontWeight: '600' }}
                onClick={() => handleDelete(deleteId)}
              >
                Yes, remove it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
