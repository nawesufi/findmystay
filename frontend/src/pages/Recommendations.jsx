/*
  Recommendations.jsx — AI recommendation results page
  Protected — requires login.
  Shows accuracy metrics (Precision@10) and top-10 ranked listings
  with CBF score, SVD score, final score, and explanation reason.
*/

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import MapView from '../components/MapView'
import { getRecommendations, getPreferences, logInteraction, formatPrice, getSentimentClass, getSentimentWidth, Auth, propertyImg } from '../api'

export default function Recommendations() {
  const navigate = useNavigate()
  const user     = Auth.getUser()

  const [recs,      setRecs]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [saved,     setSaved]     = useState({})
  const [viewMode,  setViewMode]  = useState('list')
  const [prefFacs,  setPrefFacs]  = useState([])   // user's preferred facility tokens

  // Map stored token → display label
  const FAC_LABELS = {
    'wifi':           'WiFi',
    'parking':        'Parking',
    'washing machine':'Laundromat',
    'dobi':           'Dobi',
    'mini market':    'Mini Mart',
  }

  const isNewUser     = !loading && recs.length > 0 && (recs[0]?.method || '').includes('new user')
  const isReturning   = !loading && recs.length > 0 && (recs[0]?.method || '').includes('hybrid')
  const firstName     = user?.full_name?.split(' ')[0] || 'there'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [data, prefs] = await Promise.all([getRecommendations(10), getPreferences()])
      setRecs(data?.recommendations || [])
      const raw = (prefs?.preferred_facilities || '').toLowerCase()
      setPrefFacs(raw.split(',').map(s => s.trim()).filter(Boolean))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(id) {
    try {
      await logInteraction(id, 'save')
      setSaved(prev => ({ ...prev, [id]: true }))
    } catch (err) {}
  }

  function handleView(id) {
    logInteraction(id, 'view').catch(() => {})
    navigate(`/property/${id}`)
  }

  return (
    <div>
      <Navbar />

      {/* ── Page header ──────────────────────────────────────── */}
      <div style={{ background: '#311A50', padding: '1.75rem 0' }}>
        <div className="container">
          <div style={{
            display: 'inline-block',
            background: 'rgba(201,169,110,0.15)',
            border: '1px solid rgba(201,169,110,0.35)',
            color: '#C9A96E',
            fontSize: '10px',
            fontWeight: '600',
            padding: '3px 10px',
            borderRadius: '20px',
            marginBottom: '8px',
            letterSpacing: '0.06em',
          }}>
            AI-POWERED
          </div>

          {isReturning ? (
            <>
              <h1 style={{ color: '#fff', fontSize: '22px', marginBottom: '4px' }}>
                Welcome back, {firstName}!
              </h1>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>
                Your recommendations are personalised based on your history and similar students' behaviour.
              </p>
            </>
          ) : isNewUser ? (
            <>
              <h1 style={{ color: '#fff', fontSize: '22px', marginBottom: '4px' }}>
                Hi {firstName}, here are your first matches!
              </h1>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>
                These are based on your preferences. Save and rate properties to unlock smarter recommendations.
              </p>
            </>
          ) : (
            <>
              <h1 style={{ color: '#fff', fontSize: '22px', marginBottom: '4px' }}>
                Your personalised recommendations
              </h1>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>
                {user ? `For ${firstName} · ` : ''}
                Based on your preferences and similar students' behaviour
              </p>
            </>
          )}
        </div>
      </div>

      <hr className="gold-divider" />

      <div className="container" style={{ padding: '1.5rem' }}>

        {/* ── Error ──────────────────────────────────────────── */}
        {error && (
          <div>
            {error.includes('preferences') ? (
              <div style={{
                background: '#EDE6F8',
                border: '1px solid #C4A8E8',
                borderRadius: '12px',
                padding: '2rem',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '40px', marginBottom: '1rem' }}>⚙️</div>
                <h3 style={{ marginBottom: '0.5rem' }}>Set your preferences first</h3>
                <p style={{ color: 'var(--text2)', marginBottom: '1rem', fontSize: '14px' }}>
                  Tell us your budget, campus, and room type to get personalised recommendations.
                </p>
                <button className="btn btn-primary" onClick={() => navigate('/profile?setup=1')}>
                  Set preferences
                </button>
              </div>
            ) : (
              <div className="alert alert-error">{error}</div>
            )}
          </div>
        )}

        {/* ── Loading ─────────────────────────────────────────── */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <div className="spinner" style={{ width: 36, height: 36, margin: '0 auto 1rem' }} />
            <p style={{ color: 'var(--text2)', fontFamily: "'Playfair Display', serif" }}>
              Finding your best matches...
            </p>
            <p style={{ color: 'var(--text3)', fontSize: '13px', marginTop: '4px' }}>
              Running TF-IDF + SVD hybrid algorithm
            </p>
          </div>
        )}

        {/* ── List / Map toggle ─────────────────────────────────── */}
        {!loading && !error && recs.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', border: '1px solid #E8DDD0', borderRadius: '8px', overflow: 'hidden' }}>
              {[['list', '☰ List'], ['map', '🗺 Map']].map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  style={{
                    padding: '6px 16px', fontSize: '12px',
                    fontFamily: "'DM Sans', sans-serif",
                    border: 'none', cursor: 'pointer',
                    background: viewMode === mode ? '#4D2D78' : '#FFFCF7',
                    color: viewMode === mode ? '#fff' : 'var(--text2)',
                    fontWeight: viewMode === mode ? '600' : '400',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Map view ──────────────────────────────────────────── */}
        {!loading && viewMode === 'map' && recs.length > 0 && (
          <MapView
            properties={recs}
            onView={r => handleView(r.id)}
            height={500}
          />
        )}

        {/* ── New user guide ───────────────────────────────────── */}
        {isNewUser && viewMode === 'list' && (
          <div style={{
            background: '#F3EEF9',
            border: '1px solid #C4A8E8',
            borderRadius: '12px',
            padding: '1.25rem 1.5rem',
            marginBottom: '1.25rem',
          }}>
            <p style={{ fontSize: '13px', fontWeight: '600', color: '#4D2D78', marginBottom: '1rem' }}>
              Get smarter recommendations in 3 steps:
            </p>
            <div style={{ display: 'flex', gap: '0', flexWrap: 'wrap' }}>
              {[
                { n: 1, done: true,  label: 'Set preferences',            sub: 'Done! Your campus & budget are saved.' },
                { n: 2, done: false, label: 'Save listings you like',      sub: 'Tap "Save" on any property below.' },
                { n: 3, done: false, label: 'Rate properties you visited', sub: 'Leave a review on the property page.' },
              ].map((step, idx, arr) => (
                <div key={step.n} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flex: '1 1 180px', minWidth: '160px', marginBottom: '4px' }}>
                  <div style={{
                    width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
                    background: step.done ? '#2e7d32' : '#C9A96E',
                    color: '#fff', fontSize: '12px', fontWeight: '700',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {step.done ? '✓' : step.n}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>{step.label}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '2px' }}>{step.sub}</div>
                  </div>
                  {idx < arr.length - 1 && (
                    <div style={{ fontSize: '16px', color: '#C9A96E', alignSelf: 'center', margin: '0 4px', flexShrink: 0 }}>→</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Recommendation cards ─────────────────────────────── */}
        {!loading && viewMode === 'list' && recs.map((r, i) => {
          const sentClass = getSentimentClass(r.sentiment_score || 0)
          const sentWidth = getSentimentWidth(r.sentiment_score || 0)
          const propFac   = (r.facilities || '').toLowerCase()
          const matchedFacs = prefFacs.filter(f => propFac.includes(f))

          return (
            <div key={r.id} style={{
              background: '#FFFCF7',
              border: '1px solid #E8DDD0',
              borderRadius: '12px',
              padding: '1.25rem',
              marginBottom: '1rem',
              display: 'flex',
              gap: '1rem',
              alignItems: 'flex-start',
            }}>
              {/* Rank badge */}
              <div style={{
                width: '28px', height: '28px',
                background: '#4D2D78',
                color: '#fff',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: "'Playfair Display', serif",
                fontSize: '13px',
                fontWeight: '600',
                flexShrink: 0,
                marginTop: '2px',
              }}>
                {i + 1}
              </div>

              {/* Property thumbnail */}
              <img
                src={propertyImg(r)}
                alt={r.area || r.title}
                onError={e => { e.target.src = propertyImg({ ...r, image_url: null }) }}
                style={{
                  width: '90px', height: '90px',
                  borderRadius: '10px',
                  objectFit: 'cover',
                  flexShrink: 0,
                  border: '1px solid #E8DDD0',
                }}
              />

              {/* Property details */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: '18px',
                  fontWeight: '600',
                  color: '#4D2D78',
                  marginBottom: '3px',
                }}>
                  {formatPrice(r.rental_price)} <span style={{ fontSize: '13px', fontWeight: '400', color: 'var(--text3)', fontFamily: "'DM Sans', sans-serif" }}>/ month</span>
                </div>

                <div style={{ fontSize: '14px', color: 'var(--text)', marginBottom: '8px', lineHeight: 1.4 }}>
                  {r.title}
                </div>

                {/* Tags */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
                  {r.state && <span className="tag">📍 {r.state}</span>}
                  <span className="tag tag-purple">
                    🏠 {r.property_type && r.property_type !== 'Not specified'
                          ? r.property_type.charAt(0).toUpperCase() + r.property_type.slice(1)
                          : 'Not specified'}
                  </span>
                  {r.gender_preference && r.gender_preference !== 'any' && (
                    <span className="tag" style={{
                      background: r.gender_preference === 'male' ? '#DBEAFE' : '#FCE7F3',
                      color:      r.gender_preference === 'male' ? '#1D4ED8' : '#9D174D',
                    }}>
                      {r.gender_preference === 'male' ? '♂ Male only' : '♀ Female only'}
                    </span>
                  )}
                  {(r.distance_to_preferred_campus ?? r.distance_to_campus) != null &&
                    <span className="tag tag-green">
                      📏 {r.distance_to_preferred_campus ?? r.distance_to_campus} km from your campus
                    </span>}
                </div>

                {/* Matched preferred facilities */}
                {matchedFacs.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
                    {matchedFacs.map(f => (
                      <span key={f} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: '#D4EDE6', color: '#1A5E4A', fontWeight: '600', border: '1px solid #8CD4BE' }}>
                        ✓ {FAC_LABELS[f] || f}
                      </span>
                    ))}
                  </div>
                )}

                {/* Sentiment bar */}
                <div className="sentiment-bar" style={{ marginBottom: '8px' }}>
                  <div className={`sentiment-fill ${sentClass}`} style={{ width: `${sentWidth}%` }} />
                </div>

                {/* Reason */}
                {r.reason && (
                  <div style={{
                    display: 'inline-block',
                    fontSize: '12px',
                    color: '#1A5E4A',
                    background: '#D4EDE6',
                    border: '1px solid #8CD4BE',
                    borderRadius: '6px',
                    padding: '3px 9px',
                    marginBottom: '10px',
                  }}>
                    ✓ {r.reason}
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-primary btn-sm" onClick={() => handleView(r.id)}>
                    View details
                  </button>
                  <button
                    className={`btn btn-sm ${saved[r.id] ? 'btn-gold' : 'btn-ghost'}`}
                    onClick={() => handleSave(r.id)}
                  >
                    {saved[r.id] ? '✓ Saved' : 'Save'}
                  </button>
                </div>
              </div>

            </div>
          )
        })}

        {/* Empty state */}
        {!loading && !error && recs.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <h3>No recommendations yet</h3>
            <p>Update your preferences or browse listings to get started.</p>
            <button className="btn btn-primary mt-2" onClick={() => navigate('/listings')}>
              Browse listings
            </button>
          </div>
        )}
      </div>
    </div>
  )
}