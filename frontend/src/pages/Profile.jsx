/*
  Profile.jsx — User profile page
  Protected — requires login.
  Two tabs: Preferences, Interaction History.
*/

import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { getPreferences, savePreferences, getInteractions, getMyFeedback, getStudentEnquiries, updateProfile, formatPrice, Auth, propertyImg } from '../api'
import { CAMPUSES, DEFAULT_BUDGET_MIN, DEFAULT_BUDGET_MAX } from '../constants'

export default function Profile() {
  const navigate     = useNavigate()
  const [params]     = useSearchParams()
  const user         = Auth.getUser()

  const [tab,          setTab]          = useState(params.get('setup') ? 'preferences' : 'account')
  const [loading,      setLoading]      = useState(false)
  const [alert,        setAlert]        = useState({ msg: '', type: '' })
  const [interactions, setInteractions] = useState([])
  const [histLoading,  setHistLoading]  = useState(false)
  const [histFilter,   setHistFilter]   = useState('all')
  const [reviews,      setReviews]      = useState([])
  const [revLoading,   setRevLoading]   = useState(false)
  const [myEnquiries,  setMyEnquiries]  = useState([])
  const [enqLoading,   setEnqLoading]   = useState(false)

  // Personal profile state
  const [profile, setProfile] = useState({
    full_name:     user?.full_name     || '',
    gender:        user?.gender        || '',
    uitm_campus:   user?.uitm_campus   || '',
    age:           user?.age           || '',
    year_of_study: user?.year_of_study || '',
    home_state:    user?.home_state    || '',
    transport:     user?.transport     || '',
  })
  const [profileLoading, setProfileLoading] = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)

  // Preferences state
  const [prefs, setPrefs] = useState({
    preferred_price_min:   DEFAULT_BUDGET_MIN,
    preferred_price_max:   DEFAULT_BUDGET_MAX,
    preferred_state:       '',
    preferred_type:        '',
    preferred_distance:    '',
    preferred_gender:      'any',
    preferred_facilities:  '',
    uitm_campus:           user?.uitm_campus || '',
  })

  useEffect(() => { loadPrefs() }, [])

  async function loadPrefs() {
    try {
      const data = await getPreferences()
      if (data && !data.message) {
        setPrefs(prev => ({ ...prev, ...data }))
      }
    } catch (err) {}
  }

  async function handleSavePrefs(e) {
    e.preventDefault()
    setLoading(true)
    try {
      await savePreferences(prefs)
      setAlert({ msg: 'Preferences saved! Your recommendations will now be more accurate. ✓', type: 'success' })
      setTimeout(() => setAlert({ msg: '', type: '' }), 4000)
    } catch (err) {
      setAlert({ msg: err.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  async function loadHistory() {
    setHistLoading(true)
    try {
      const [interData, enqData] = await Promise.all([getInteractions(), getStudentEnquiries()])
      setInteractions(interData || [])
      setMyEnquiries(enqData || [])
    } catch (err) {}
    finally { setHistLoading(false) }
  }

  async function loadReviews() {
    setRevLoading(true)
    try {
      const data = await getMyFeedback()
      setReviews(data || [])
    } catch (err) {}
    finally { setRevLoading(false) }
  }

  async function loadEnquiries() {
    setEnqLoading(true)
    try {
      const data = await getStudentEnquiries()
      setMyEnquiries(data || [])
    } catch (err) {}
    finally { setEnqLoading(false) }
  }

  const p = (field, val) => setPrefs(prev => ({ ...prev, [field]: val }))
  const pp = (field, val) => setProfile(prev => ({ ...prev, [field]: val }))

  async function handleSaveProfile(e) {
    e.preventDefault()
    setProfileLoading(true)
    try {
      const res = await updateProfile(profile)
      Auth.setUser(res.user)
      setEditingProfile(false)
      setAlert({ msg: 'Profile updated successfully ✓', type: 'success' })
      setTimeout(() => setAlert({ msg: '', type: '' }), 4000)
    } catch (err) {
      setAlert({ msg: err.message, type: 'error' })
    } finally {
      setProfileLoading(false)
    }
  }

  function cancelEditProfile() {
    const u = Auth.getUser()
    setProfile({
      full_name:     u?.full_name     || '',
      gender:        u?.gender        || '',
      uitm_campus:   u?.uitm_campus   || '',
      age:           u?.age           || '',
      year_of_study: u?.year_of_study || '',
      home_state:    u?.home_state    || '',
      transport:     u?.transport     || '',
    })
    setEditingProfile(false)
  }

  const initials = user?.full_name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'

  /* ── History helpers ── */
  const saves     = interactions.filter(i => i.interaction_type === 'save').length
  const views     = interactions.filter(i => i.interaction_type === 'view').length
  const contacted = myEnquiries.length
  const unique    = new Set(interactions.map(i => i.property_id)).size
  const _filtered  = interactions.filter(i =>
    histFilter === 'all' || histFilter === 'contacted' || i.interaction_type === histFilter
  )
  const _seenIds = new Set()
  const filtered = _filtered.filter(i => {
    if (_seenIds.has(i.property_id)) return false
    _seenIds.add(i.property_id)
    return true
  })
  const TYPE_STYLE = {
    save:    { bg: '#D4EDE6', color: '#1A5E4A', icon: '❤️', label: 'Saved' },
    view:    { bg: '#EDE6F8', color: '#4D2D78', icon: '👁️', label: 'Viewed' },
    inquiry: { bg: '#FFF3CD', color: '#856404', icon: '✉️', label: 'Enquired' },
  }

  return (
    <div>
      <Navbar />

      <div className="container" style={{ padding: '1.5rem 1.5rem 3rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1.5rem' }}>

          {/* ── Sidebar ─────────────────────────────────────── */}
          <aside>
            <div className="card" style={{ position: 'sticky', top: '76px' }}>
              <div className="card-body" style={{ textAlign: 'center' }}>

                {/* Avatar */}
                <div style={{
                  width: '56px', height: '56px',
                  background: '#4D2D78',
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'Playfair Display', serif",
                  fontSize: '18px', color: '#fff',
                  margin: '0 auto 10px',
                }}>
                  {initials}
                </div>

                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '15px', marginBottom: '3px' }}>
                  {user?.full_name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '1.25rem' }}>
                  {user?.uitm_campus}
                </div>

                {/* Nav items */}
                {[
                  { id: 'account',     label: 'My profile',          icon: '👤' },
                  { id: 'preferences', label: 'My preferences',      icon: '⚙️' },
                  { id: 'history',     label: 'Interaction history',  icon: '📋', onSelect: loadHistory },
                  { id: 'reviews',     label: 'My reviews',           icon: '⭐', onSelect: loadReviews },
                  { id: 'enquiries',   label: 'My enquiries',         icon: '✉️', onSelect: loadEnquiries },
                ].map(item => (
                  <button key={item.id} onClick={() => { setTab(item.id); item.onSelect?.() }} style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '13px',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '3px',
                    background: tab === item.id ? '#EDE6F8' : 'transparent',
                    color: tab === item.id ? '#4D2D78' : 'var(--text2)',
                    textAlign: 'left',
                  }}>
                    <span>{item.icon}</span> {item.label}
                  </button>
                ))}

                <div style={{ borderTop: '1px solid #E8DDD0', marginTop: '12px', paddingTop: '12px' }}>
                  <button onClick={() => { Auth.logout(); window.location.href = '/' }} style={{
                    width: '100%', padding: '9px 12px',
                    borderRadius: '8px', border: 'none',
                    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                    fontSize: '13px', fontWeight: '500',
                    background: 'transparent', color: '#A02D2D',
                    display: 'flex', alignItems: 'center', gap: '8px',
                  }}>
                    🚪 Logout
                  </button>
                </div>
              </div>
            </div>
          </aside>

          {/* ── Main content ─────────────────────────────────── */}
          <main>
            {alert.msg && (
              <div className={`alert alert-${alert.type}`} style={{ marginBottom: '1rem' }}>
                {alert.msg}
              </div>
            )}

            {/* ── MY PROFILE TAB ──────────────────────────── */}
            {tab === 'account' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                  <div>
                    <h2 style={{ fontSize: '22px', marginBottom: '4px' }}>My profile</h2>
                    <p style={{ color: 'var(--text2)', fontSize: '13px' }}>Personal and demographic information</p>
                  </div>
                  {!editingProfile && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingProfile(true)}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      ✏️ Edit profile
                    </button>
                  )}
                </div>

                {/* ── VIEW MODE ── */}
                {!editingProfile && (
                  <div className="card">
                    <div className="card-body">
                      {/* Basic info section */}
                      <p style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text3)',
                        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '14px' }}>
                        Basic info
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '24px' }}>
                        {[
                          { label: 'Full name',    value: profile.full_name  },
                          { label: 'Gender',       value: profile.gender     },
                          { label: 'UiTM Campus',  value: profile.uitm_campus, full: true },
                        ].map(f => (
                          <div key={f.label} style={{ gridColumn: f.full ? '1 / -1' : undefined }}>
                            <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: '500', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              {f.label}
                            </div>
                            <div style={{ fontSize: '14px', color: f.value ? 'var(--text)' : 'var(--text3)', fontWeight: f.value ? '500' : '400', fontStyle: f.value ? 'normal' : 'italic' }}>
                              {f.value || 'Not set'}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div style={{ borderTop: '1px solid #E8DDD0', paddingTop: '20px' }}>
                        <p style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text3)',
                          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '14px' }}>
                          Demographics
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                          {[
                            { label: 'Age',            value: profile.age           },
                            { label: 'Year of study',  value: profile.year_of_study ? `Year ${profile.year_of_study}` : '' },
                            { label: 'Home state',     value: profile.home_state    },
                            { label: 'Transport',      value: {car:'Car', motorcycle:'Motorcycle', public:'Public Transport', walking:'Walking / Cycling'}[profile.transport] || profile.transport },
                          ].map(f => (
                            <div key={f.label} style={{ gridColumn: f.full ? '1 / -1' : undefined }}>
                              <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: '500', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                {f.label}
                              </div>
                              <div style={{ fontSize: '14px', color: f.value ? 'var(--text)' : 'var(--text3)', fontWeight: f.value ? '500' : '400', fontStyle: f.value ? 'normal' : 'italic' }}>
                                {f.value || 'Not set'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── EDIT MODE ── */}
                {editingProfile && (
                  <div className="card" style={{ border: '2px solid #C4A8E8' }}>
                    <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: '600', fontSize: '14px' }}>Editing profile</span>
                      <button onClick={cancelEditProfile} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text2)', lineHeight: 1 }}>×</button>
                    </div>
                    <div className="card-body">
                      <form onSubmit={handleSaveProfile}>
                        <p style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text3)',
                          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>
                          Basic info
                        </p>
                        <div className="grid-2">
                          <div className="form-group">
                            <label className="form-label">Full name</label>
                            <input className="form-input" type="text"
                              value={profile.full_name}
                              onChange={e => pp('full_name', e.target.value)} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Gender</label>
                            <select className="form-select" value={profile.gender}
                              onChange={e => pp('gender', e.target.value)}>
                              <option value="">Select</option>
                              <option>Male</option>
                              <option>Female</option>
                            </select>
                          </div>
                          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <label className="form-label">UiTM Campus</label>
                            <select className="form-select" value={profile.uitm_campus}
                              onChange={e => pp('uitm_campus', e.target.value)}>
                              <option value="">Select campus</option>
                              {CAMPUSES.map(c => <option key={c}>{c}</option>)}
                            </select>
                          </div>
                        </div>

                        <p style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text3)',
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                          marginBottom: '12px', marginTop: '8px' }}>
                          Demographics
                        </p>
                        <div className="grid-2">
                          <div className="form-group">
                            <label className="form-label">Age</label>
                            <input className="form-input" type="number"
                              value={profile.age}
                              onChange={e => pp('age', e.target.value)}
                              placeholder="e.g. 21" />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Year of study</label>
                            <select className="form-select" value={profile.year_of_study}
                              onChange={e => pp('year_of_study', e.target.value)}>
                              <option value="">Select</option>
                              <option value="1">Year 1</option>
                              <option value="2">Year 2</option>
                              <option value="3">Year 3</option>
                              <option value="4">Year 4</option>
                              <option value="5">Year 5+</option>
                            </select>
                          </div>
                          <div className="form-group">
                            <label className="form-label">Home state</label>
                            <select className="form-select" value={profile.home_state}
                              onChange={e => pp('home_state', e.target.value)}>
                              <option value="">Select</option>
                              {['Johor','Kedah','Kelantan','Melaka','Negeri Sembilan','Pahang',
                                'Perak','Perlis','Pulau Pinang','Sabah','Sarawak','Selangor',
                                'Terengganu','Kuala Lumpur','Labuan','Putrajaya'].map(s => (
                                <option key={s}>{s}</option>
                              ))}
                            </select>
                          </div>
                          <div className="form-group">
                            <label className="form-label">Transport</label>
                            <select className="form-select" value={profile.transport}
                              onChange={e => pp('transport', e.target.value)}>
                              <option value="">Select</option>
                              <option value="car">Car</option>
                              <option value="motorcycle">Motorcycle</option>
                              <option value="public">Public Transport</option>
                              <option value="walking">Walking / Cycling</option>
                            </select>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                          <button type="submit" className="btn btn-primary" disabled={profileLoading}>
                            {profileLoading ? 'Saving...' : 'Save changes'}
                          </button>
                          <button type="button" className="btn btn-ghost" onClick={cancelEditProfile}>
                            Cancel
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── PREFERENCES TAB ─────────────────────────── */}
            {tab === 'preferences' && (
              <div>
                <div style={{ marginBottom: '1.25rem' }}>
                  <h2 style={{ fontSize: '22px', marginBottom: '4px' }}>My preferences</h2>
                  <p style={{ color: 'var(--text2)', fontSize: '13px' }}>
                    These are used to generate your personalised recommendations
                  </p>
                </div>

                <div className="card">
                  <div className="card-body">
                    <form onSubmit={handleSavePrefs}>
                      <div className="grid-2">
                        <div className="form-group">
                          <label className="form-label">Min budget (RM)</label>
                          <input className="form-input" type="number"
                            value={prefs.preferred_price_min}
                            onChange={e => p('preferred_price_min', e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Max budget (RM)</label>
                          <input className="form-input" type="number"
                            value={prefs.preferred_price_max}
                            onChange={e => p('preferred_price_max', e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Preferred state</label>
                          <select className="form-select" value={prefs.preferred_state}
                            onChange={e => p('preferred_state', e.target.value)}>
                            <option value="">Any state</option>
                            <option>Negeri Sembilan</option>
                            <option>Melaka</option>
                            <option>Johor</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Property type</label>
                          <select className="form-select" value={prefs.preferred_type}
                            onChange={e => p('preferred_type', e.target.value)}>
                            <option value="">Any type</option>
                            <option value="room">Room</option>
                            <option value="unit">Unit</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Max distance from campus (km)</label>
                          <input className="form-input" type="number"
                            value={prefs.preferred_distance}
                            onChange={e => p('preferred_distance', e.target.value)}
                            placeholder="e.g. 5" />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Gender preference</label>
                          <select className="form-select" value={prefs.preferred_gender}
                            onChange={e => p('preferred_gender', e.target.value)}>
                            <option value="any">Any</option>
                            <option value="female">Female only</option>
                            <option value="male">Male only</option>
                          </select>
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">UiTM campus</label>
                        <select className="form-select" value={prefs.uitm_campus}
                          onChange={e => p('uitm_campus', e.target.value)}>
                          <option value="">Select campus</option>
                          {CAMPUSES.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Preferred facilities</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                          {[
                            { label: 'WiFi',        value: 'wifi' },
                            { label: 'Parking',     value: 'parking' },
                            { label: 'Laundromat',  value: 'washing machine' },
                            { label: 'Dobi',        value: 'dobi' },
                            { label: 'Mini mart',   value: 'mini market' },
                          ].map(({ label: fac, value: key }) => {
                            const selected = (prefs.preferred_facilities || '')
                              .toLowerCase().split(',').map(s => s.trim())
                              .includes(key)
                            return (
                              <button
                                key={fac}
                                type="button"
                                onClick={() => {
                                  const current = (prefs.preferred_facilities || '')
                                    .split(',').map(s => s.trim()).filter(Boolean)
                                  const next = selected
                                    ? current.filter(s => s.toLowerCase() !== key)
                                    : [...current, key]
                                  p('preferred_facilities', next.join(', '))
                                }}
                                style={{
                                  padding: '6px 14px',
                                  borderRadius: '20px',
                                  border: `1px solid ${selected ? '#4D2D78' : '#E8DDD0'}`,
                                  background: selected ? '#4D2D78' : '#FFFCF7',
                                  color: selected ? '#fff' : 'var(--text2)',
                                  fontSize: '12px',
                                  fontWeight: selected ? '600' : '400',
                                  cursor: 'pointer',
                                  fontFamily: "'DM Sans', sans-serif",
                                  transition: 'all 0.15s',
                                }}
                              >
                                {fac}
                              </button>
                            )
                          })}
                        </div>
                        {prefs.preferred_facilities && (
                          <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>
                            Selected: {prefs.preferred_facilities}
                          </p>
                        )}
                      </div>
                      <button type="submit" className="btn btn-primary" disabled={loading}>
                        {loading ? 'Saving...' : 'Save preferences'}
                      </button>
                      <button type="button" className="btn btn-ghost"
                        style={{ marginLeft: '10px' }}
                        onClick={() => navigate('/recommendations')}>
                        View my recommendations →
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}

            {/* ── HISTORY TAB ──────────────────────────────── */}
            {tab === 'history' && (
              <div>
                <div style={{ marginBottom: '1.25rem' }}>
                  <h2 style={{ fontSize: '22px', marginBottom: '4px' }}>Interaction history</h2>
                  <p style={{ color: 'var(--text2)', fontSize: '13px' }}>
                    Properties you have viewed or saved. These improve your AI recommendations.
                  </p>
                </div>

                {histLoading ? (
                  <div style={{ textAlign: 'center', padding: '3rem' }}>
                    <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 1rem' }} />
                    <p style={{ color: 'var(--text2)', fontSize: '13px' }}>Loading history...</p>
                  </div>
                ) : interactions.length === 0 && myEnquiries.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">📋</div>
                    <h3>No history yet</h3>
                    <p>Browse and save listings — they'll appear here and improve your recommendations.</p>
                    <button className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={() => navigate('/listings')}>
                      Browse listings
                    </button>
                  </div>
                ) : (
                  <div>
                    {/* ── Stats strip ── */}
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                      {[
                        { val: interactions.length, lbl: 'Total interactions', icon: '📊' },
                        { val: saves,               lbl: 'Saved',              icon: '❤️' },
                        { val: views,               lbl: 'Viewed',             icon: '👁️' },
                        { val: contacted,           lbl: 'Contacted',          icon: '✉️' },
                        { val: unique,              lbl: 'Unique properties',  icon: '🏠' },
                      ].map(s => (
                        <div key={s.lbl} style={{
                          flex: '1 1 120px',
                          background: '#FFFCF7',
                          border: '1px solid #E8DDD0',
                          borderRadius: '10px',
                          padding: '12px',
                          textAlign: 'center',
                        }}>
                          <div style={{ fontSize: '18px', marginBottom: '2px' }}>{s.icon}</div>
                          <div style={{ fontSize: '20px', fontWeight: '700', color: '#4D2D78', lineHeight: 1 }}>
                            {s.val}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '3px' }}>
                            {s.lbl}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* ── Filter tabs ── */}
                    <div style={{
                      display: 'flex', gap: '6px', marginBottom: '1rem',
                      borderBottom: '1px solid #E8DDD0', paddingBottom: '10px',
                      flexWrap: 'wrap',
                    }}>
                      {[
                        { key: 'all',       label: `All (${interactions.length})` },
                        { key: 'save',      label: `❤️ Saved (${saves})` },
                        { key: 'view',      label: `👁️ Viewed (${views})` },
                        { key: 'contacted', label: `✉️ Contacted (${contacted})` },
                      ].map(f => (
                        <button key={f.key} onClick={() => setHistFilter(f.key)} style={{
                          padding: '5px 14px',
                          borderRadius: '20px',
                          border: '1px solid',
                          fontSize: '12px',
                          fontFamily: "'DM Sans', sans-serif",
                          cursor: 'pointer',
                          fontWeight: histFilter === f.key ? '600' : '400',
                          background: histFilter === f.key ? '#4D2D78' : '#FFFCF7',
                          borderColor: histFilter === f.key ? '#4D2D78' : '#E8DDD0',
                          color: histFilter === f.key ? '#fff' : 'var(--text2)',
                        }}>
                          {f.label}
                        </button>
                      ))}
                    </div>

                    {/* ── Contacted cards ── */}
                    {histFilter === 'contacted' && (
                      myEnquiries.length === 0 ? (
                        <p style={{ color: 'var(--text2)', fontSize: '13px', textAlign: 'center', padding: '2rem' }}>
                          No contacted properties yet.
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {myEnquiries.filter((e, idx, arr) => arr.findIndex(x => x.property_id === e.property_id) === idx).map(e => {
                            const prop = e.property || {}
                            return (
                              <div key={e.id} style={{ background: '#FFFCF7', border: '1px solid #E8DDD0', borderRadius: '12px', padding: '14px', display: 'flex', gap: '14px', alignItems: 'center', transition: 'box-shadow 0.15s' }}
                                onMouseEnter={ev => ev.currentTarget.style.boxShadow = '0 2px 12px rgba(77,45,120,0.10)'}
                                onMouseLeave={ev => ev.currentTarget.style.boxShadow = 'none'}>
                                <img src={propertyImg(prop)} alt={prop.title || 'Property'} onError={ev => { ev.target.src = propertyImg({ ...prop, image_url: null }) }} style={{ width: '90px', height: '80px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {prop.title || e.property_title || `Property #${e.property_id}`}
                                  </div>
                                  <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '6px' }}>
                                    📍 {[prop.area, prop.state].filter(Boolean).join(', ') || '—'}
                                  </div>
                                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                    {prop.rental_price && <span style={{ fontSize: '13px', fontWeight: '700', color: '#4D2D78' }}>{formatPrice(prop.rental_price)}<span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: '11px' }}>/mo</span></span>}
                                    {prop.property_type && <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '10px', background: '#EDE6F8', color: '#4D2D78', fontWeight: '500', textTransform: 'capitalize' }}>🏠 {prop.property_type}</span>}
                                    {prop.distance_to_campus && <span style={{ fontSize: '10px', color: 'var(--text3)' }}>📏 {prop.distance_to_campus} km to UiTM</span>}
                                  </div>
                                </div>
                                <button onClick={() => navigate(`/property/${e.property_id}`)} style={{ padding: '5px 12px', borderRadius: '7px', border: '1px solid #C4A8E8', background: '#FFFCF7', color: '#4D2D78', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>View →</button>
                              </div>
                            )
                          })}
                        </div>
                      )
                    )}

                    {/* ── Interaction cards (Save / View / All) ── */}
                    {histFilter !== 'contacted' && filtered.length === 0 && (
                      <p style={{ color: 'var(--text2)', fontSize: '13px', textAlign: 'center', padding: '2rem' }}>
                        No {histFilter} interactions yet.
                      </p>
                    )}
                    {histFilter !== 'contacted' && filtered.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {filtered.map(i => {
                          const prop  = i.property || {}
                          const ts    = new Date(i.timestamp)
                          const date  = ts.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
                          const time  = ts.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })
                          const st    = TYPE_STYLE[i.interaction_type] || TYPE_STYLE.view
                          const stars = i.rating ? Math.round(i.rating) : 0
                          return (
                            <div key={i.id} style={{ background: '#FFFCF7', border: '1px solid #E8DDD0', borderRadius: '12px', padding: '14px', display: 'flex', gap: '14px', alignItems: 'flex-start', transition: 'box-shadow 0.15s' }}
                              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(77,45,120,0.10)'}
                              onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                              <img src={propertyImg(prop)} alt={prop.title || 'Property'} onError={e => { e.target.src = propertyImg({ ...prop, image_url: null }) }} style={{ width: '90px', height: '80px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {prop.title || `Property #${i.property_id}`}
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '5px' }}>
                                  📍 {[prop.area, prop.state].filter(Boolean).join(', ') || '—'}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                  {prop.rental_price && <span style={{ fontSize: '13px', fontWeight: '700', color: '#4D2D78' }}>{formatPrice(prop.rental_price)}<span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: '11px' }}>/mo</span></span>}
                                  {prop.property_type && <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '10px', background: '#EDE6F8', color: '#4D2D78', fontWeight: '500', textTransform: 'capitalize' }}>🏠 {prop.property_type}</span>}
                                  {prop.distance_to_campus && <span style={{ fontSize: '10px', color: 'var(--text3)' }}>📏 {prop.distance_to_campus} km to UiTM</span>}
                                </div>
                                {stars > 0 && (
                                  <div style={{ marginTop: '5px', fontSize: '12px' }}>
                                    {[1,2,3,4,5].map(n => <span key={n} style={{ color: n <= stars ? '#C9A96E' : '#E8DDD0' }}>★</span>)}
                                    <span style={{ fontSize: '10px', color: 'var(--text3)', marginLeft: '4px' }}>({i.rating})</span>
                                  </div>
                                )}
                              </div>
                              <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                                <span style={{ fontSize: '10px', fontWeight: '600', padding: '3px 9px', borderRadius: '12px', background: st.bg, color: st.color }}>{st.icon} {st.label}</span>
                                <div style={{ fontSize: '10px', color: 'var(--text3)', lineHeight: 1.4 }}>{date}<br />{time}</div>
                                <button onClick={() => navigate(`/property/${i.property_id}`)} style={{ padding: '5px 12px', borderRadius: '7px', border: '1px solid #C4A8E8', background: '#FFFCF7', color: '#4D2D78', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>View →</button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── REVIEWS TAB ──────────────────────────────── */}
            {tab === 'reviews' && (
              <div>
                <div style={{ marginBottom: '1.25rem' }}>
                  <h2 style={{ fontSize: '22px', marginBottom: '4px' }}>My reviews</h2>
                  <p style={{ color: 'var(--text2)', fontSize: '13px' }}>
                    Ratings and comments you have submitted. These are analysed by VADER to improve recommendations.
                  </p>
                </div>

                {revLoading ? (
                  <div style={{ textAlign: 'center', padding: '3rem' }}>
                    <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 1rem' }} />
                    <p style={{ color: 'var(--text2)', fontSize: '13px' }}>Loading reviews...</p>
                  </div>
                ) : reviews.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">⭐</div>
                    <h3>No reviews yet</h3>
                    <p>Rate a property on its detail page — your review will appear here.</p>
                    <button className="btn btn-primary" style={{ marginTop: '0.75rem' }}
                      onClick={() => navigate('/listings')}>
                      Browse listings
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {reviews.map(r => {
                      const prop  = r.property || {}
                      const stars = r.satisfaction_level || 0
                      const date  = new Date(r.created_at).toLocaleDateString('en-MY', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })
                      // Sentiment badge
                      const sentScore = r.sentiment_score || 0
                      const sentStyle = sentScore > 0.2
                        ? { bg: '#D4EDE6', color: '#1A5E4A', label: 'Positive' }
                        : sentScore < -0.2
                          ? { bg: '#FDECEA', color: '#A02D2D', label: 'Negative' }
                          : { bg: '#F5EDD8', color: '#7A5A2A', label: 'Neutral' }

                      return (
                        <div key={r.id}
                          style={{
                            background: '#FFFCF7',
                            border: '1px solid #E8DDD0',
                            borderRadius: '12px',
                            padding: '14px',
                            display: 'flex',
                            gap: '14px',
                            alignItems: 'flex-start',
                            transition: 'box-shadow 0.15s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(77,45,120,0.10)'}
                          onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                        >
                          {/* Thumbnail */}
                          <img
                            src={propertyImg(prop)}
                            alt={prop.title || 'Property'}
                            onError={e => { e.target.src = propertyImg({ ...prop, image_url: null }) }}
                            style={{
                              width: '80px', height: '72px',
                              borderRadius: '8px', objectFit: 'cover', flexShrink: 0,
                            }}
                          />

                          {/* Review body */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: '14px', fontWeight: '600', color: 'var(--text)',
                              marginBottom: '2px',
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>
                              {prop.title || `Property #${r.property_id}`}
                            </div>

                            <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '6px' }}>
                              📍 {[prop.area, prop.state].filter(Boolean).join(', ') || '—'}
                            </div>

                            {/* Stars */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                              <div>
                                {[1,2,3,4,5].map(n => (
                                  <span key={n} style={{ fontSize: '14px', color: n <= stars ? '#C9A96E' : '#E8DDD0' }}>★</span>
                                ))}
                              </div>
                              <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{stars}/5</span>
                            </div>

                            {/* Comment */}
                            {r.comment && (
                              <p style={{
                                fontSize: '12px', color: 'var(--text)',
                                lineHeight: 1.55, margin: 0,
                                display: '-webkit-box',
                                WebkitLineClamp: 3,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}>
                                "{r.comment}"
                              </p>
                            )}
                          </div>

                          {/* Right: date + sentiment + button */}
                          <div style={{
                            flexShrink: 0, textAlign: 'right',
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'flex-end', gap: '6px',
                          }}>
                            <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{date}</div>

                            <span style={{
                              fontSize: '10px', fontWeight: '600',
                              padding: '3px 8px', borderRadius: '12px',
                              background: sentStyle.bg, color: sentStyle.color,
                            }}>
                              {sentStyle.label}
                            </span>

                            {sentScore !== 0 && (
                              <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
                                VADER: {sentScore > 0 ? '+' : ''}{sentScore.toFixed(2)}
                              </div>
                            )}

                            <button
                              onClick={() => navigate(`/property/${r.property_id}`)}
                              style={{
                                padding: '5px 12px',
                                borderRadius: '7px',
                                border: '1px solid #C4A8E8',
                                background: '#FFFCF7',
                                color: '#4D2D78',
                                fontSize: '11px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                fontFamily: "'DM Sans', sans-serif",
                              }}
                            >
                              View →
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── ENQUIRIES TAB ─────────────────────────────── */}
            {tab === 'enquiries' && (
              <div>
                <div style={{ marginBottom: '1.25rem' }}>
                  <h2 style={{ fontSize: '22px', marginBottom: '4px' }}>My enquiries</h2>
                  <p style={{ color: 'var(--text2)', fontSize: '13px' }}>
                    Messages you sent to landlords. Replies from landlords appear here.
                  </p>
                </div>

                {enqLoading ? (
                  <div style={{ textAlign: 'center', padding: '3rem' }}>
                    <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 1rem' }} />
                    <p style={{ color: 'var(--text2)', fontSize: '13px' }}>Loading enquiries...</p>
                  </div>
                ) : myEnquiries.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">✉️</div>
                    <h3>No enquiries yet</h3>
                    <p>Send an enquiry on a property detail page — it will appear here.</p>
                    <button className="btn btn-primary" style={{ marginTop: '0.75rem' }}
                      onClick={() => navigate('/listings')}>
                      Browse listings
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {myEnquiries.map(e => (
                      <div key={e.id} className="card card-body" style={{
                        borderLeft: `3px solid ${e.status === 'replied' ? '#1A5E4A' : '#C4A8E8'}`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>
                            {e.property_title}
                          </div>
                          <span style={{
                            fontSize: '10px', fontWeight: '600', padding: '2px 9px', borderRadius: '20px',
                            background: e.status === 'replied' ? '#D4EDE6' : '#EDE6F8',
                            color:      e.status === 'replied' ? '#1A5E4A' : '#4D2D78',
                          }}>
                            {e.status === 'replied' ? 'Replied' : e.status === 'read' ? 'Seen' : 'Pending'}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '8px' }}>
                          Sent {new Date(e.created_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>

                        {/* Your message */}
                        <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, margin: '0 0 10px', background: '#FBF8F2', padding: '10px 12px', borderRadius: '8px' }}>
                          {e.message}
                        </p>

                        {/* Landlord reply */}
                        {e.reply ? (
                          <div style={{ background: '#D4EDE6', border: '1px solid #8CD4BE', borderRadius: '8px', padding: '10px 12px' }}>
                            <div style={{ fontSize: '11px', fontWeight: '600', color: '#1A5E4A', marginBottom: '4px' }}>
                              Landlord replied · {new Date(e.replied_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                            <p style={{ fontSize: '13px', color: '#1A5E4A', margin: 0, lineHeight: 1.6 }}>{e.reply}</p>
                          </div>
                        ) : (
                          <div style={{ fontSize: '12px', color: 'var(--text3)', fontStyle: 'italic' }}>
                            Awaiting landlord reply…
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
