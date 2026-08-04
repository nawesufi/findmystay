import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import MapView from '../components/MapView'
import { CAMPUSES, STATE_FALLBACK_COORDS, haversineKm, findNearestCampus } from '../campuses'
import { getProperty, logInteraction, submitFeedback, getPropertyFeedback, submitEnquiry, getStudentEnquiries, getPreferences, formatPrice, Auth, propertyImg } from '../api'

const DUMMY_CONTACTS = [
  { name: 'Ahmad Faizal bin Razali',  phone: '011-2345 6789', company: 'Faizal Property Management' },
  { name: 'Siti Norzahra bt Hamid',   phone: '012-8876 5432', company: 'SN Realty Sdn Bhd' },
  { name: 'Mohd Haziq bin Zulkifli',  phone: '013-7654 3210', company: '' },
  { name: 'Nurul Aina bt Kamarudin',  phone: '014-9988 7766', company: 'Aina Home Rentals' },
  { name: 'Khairul Anwar bin Hassan', phone: '016-3344 5566', company: 'KA Properties' },
  { name: 'Rozita bt Othman',         phone: '017-6677 8899', company: '' },
  { name: 'Fadzli bin Nordin',        phone: '011-5566 7788', company: 'Fadzli & Associates' },
  { name: 'Wan Suraya bt Wan Ismail', phone: '012-2233 4455', company: 'WS House Management' },
]

function ContactCard({ prop }) {
  const pick  = (arr) => arr[prop.id % arr.length]
  const dummy = pick(DUMMY_CONTACTS)
  const c     = prop.contact || dummy
  const initials = c.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()

  return (
    <div className='card card-body' style={{ marginBottom: '1rem' }}>
      <h3 style={{ marginBottom: '1rem', fontSize: '15px' }}>Landlord contact</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <div style={{
          width: '44px', height: '44px', borderRadius: '50%',
          background: '#311A50', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '14px', fontWeight: '700', color: '#C9A96E',
        }}>
          {initials}
        </div>
        <div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)' }}>{c.name}</div>
          {c.company && (
            <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '2px' }}>{c.company}</div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {c.phone && (
          <a href={`tel:${c.phone.replace(/\s/g, '')}`} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            fontSize: '13px', color: '#2D8B6F', textDecoration: 'none',
            background: '#D4EDE6', borderRadius: '8px', padding: '8px 12px',
          }}>
            <span>📞</span> {c.phone}
          </a>
        )}
        {c.email && (
          <a href={`mailto:${c.email}`} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            fontSize: '13px', color: '#4D2D78', textDecoration: 'none',
            background: '#EDE6F8', borderRadius: '8px', padding: '8px 12px',
            wordBreak: 'break-all',
          }}>
            <span>✉️</span> {c.email}
          </a>
        )}
      </div>
    </div>
  )
}

export default function PropertyDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()

  const [prop,      setProp]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [rating,    setRating]    = useState(0)
  const [comment,   setComment]   = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [fbError,   setFbError]   = useState('')
  const [saved,     setSaved]     = useState(false)
  const [saveError, setSaveError] = useState('')
  const [reviews,       setReviews]       = useState([])
  const [enqMessage,     setEnqMessage]     = useState('')
  const [enqSubmitted,   setEnqSubmitted]   = useState(false)
  const [enqAlreadySent, setEnqAlreadySent] = useState(false)
  const [enqError,       setEnqError]       = useState('')
  const [enqLoading,     setEnqLoading]     = useState(false)
  const [userPrefs,     setUserPrefs]     = useState(null)
  const [related,       setRelated]       = useState([])
  const viewLogged = useRef(false)

  useEffect(() => {
    getProperty(id)
      .then(data => setProp(data))
      .catch(() => navigate('/listings'))
      .finally(() => setLoading(false))
    getPropertyFeedback(id).then(data => setReviews(data || [])).catch(() => {})
    // Load related properties: same state + type, excluding current property
    getProperty(id).then(current => {
      if (!current) return
      getProperties({
        state:         current.state,
        property_type: current.property_type,
        limit:         7,
      }).then(data => {
        const list = Array.isArray(data) ? data : (data?.properties || [])
        setRelated(list.filter(p => String(p.id) !== String(id)).slice(0, 4))
      }).catch(() => {})
    }).catch(() => {})
    if (Auth.isLoggedIn()) {
      if (!viewLogged.current) {
        viewLogged.current = true
        logInteraction(Number(id), 'view').catch(() => {})
      }
      getPreferences().then(data => setUserPrefs(data)).catch(() => {})
      getStudentEnquiries()
        .then(list => {
          const already = (list || []).some(e => String(e.property_id) === String(id))
          if (already) setEnqAlreadySent(true)
        })
        .catch(() => {})
    }
  }, [id])

  async function handleSave() {
    if (!Auth.isLoggedIn()) return navigate('/login')
    try {
      await logInteraction(Number(id), 'save')
      setSaved(true)
      setSaveError('')
    } catch (err) {
      setSaveError(err.message || 'Failed to save. Please try again.')
    }
  }

  async function handleFeedback(e) {
    e.preventDefault()
    if (!Auth.isLoggedIn()) return navigate('/login')
    setFbError('')
    try {
      await submitFeedback(Number(id), rating, comment)
      setSubmitted(true)
      const updated = await getPropertyFeedback(id)
      setReviews(updated || [])
    } catch (err) {
      setFbError(err.message)
    }
  }

  async function handleEnquiry(e) {
    e.preventDefault()
    if (!enqMessage.trim()) return setEnqError('Please enter a message.')
    setEnqLoading(true)
    setEnqError('')
    try {
      await submitEnquiry(Number(id), enqMessage)
      setEnqSubmitted(true)
      setEnqMessage('')
    } catch (err) {
      setEnqError(err.message)
    } finally {
      setEnqLoading(false)
    }
  }

  if (loading) {
    return (
      <div>
        <Navbar />
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text2)' }}>
          <div className='spinner' style={{ width: 32, height: 32, margin: '0 auto 1rem' }} />
          Loading...
        </div>
      </div>
    )
  }

  if (!prop) return null

  // Prefer saved preferences campus; fall back to registration campus
  const userCampus = userPrefs?.uitm_campus || Auth.getUser()?.uitm_campus || ''

  // Calculate distances from property coordinates (if available);
  // fall back to an approximate state-centre coordinate when the property
  // has no lat/lng, so distance is still a real (if approximate) figure.
  const hasCoords = prop.latitude && prop.longitude
  const stateFallback = !hasCoords ? STATE_FALLBACK_COORDS[prop.state] : null
  const originLat = hasCoords ? prop.latitude : stateFallback?.lat
  const originLng = hasCoords ? prop.longitude : stateFallback?.lng
  const isApprox  = !hasCoords && !!stateFallback

  // Distance to user's preferred campus (calculated live from lat/lng)
  const preferredCampusPos = userCampus
    ? Object.entries(CAMPUSES).find(([name]) =>
        name.toLowerCase().includes(userCampus.toLowerCase())
      )?.[1]
    : null

  const preferredDist = originLat && originLng && preferredCampusPos
    ? haversineKm(originLat, originLng, preferredCampusPos.lat, preferredCampusPos.lng)
    : null

  // Nearest UiTM campus (calculated live from lat/lng)
  const nearest = originLat && originLng ? findNearestCampus(originLat, originLng) : null

  // Decide what to show in the distance card
  const preferredIsSameAsNearest = nearest && userCampus &&
    nearest.name.toLowerCase().includes(userCampus.toLowerCase())

  const distanceLabel = userCampus
    ? `Distance to ${userCampus}`
    : 'Distance to nearest UiTM'

  const distanceValue = preferredDist != null
    ? `${isApprox ? '~' : ''}${preferredDist} km`
    : prop.distance_to_campus
      ? `${prop.distance_to_campus} km`
      : 'Not specified'

  // Side note: nearest campus if it differs from preferred, plus an approx. flag
  const nearestNote = [
    nearest && !preferredIsSameAsNearest ? `Nearest: ${nearest.name} — ${nearest.dist} km` : null,
    isApprox ? 'Estimated from state, exact location not available' : null,
  ].filter(Boolean).join(' · ') || null

  const GENDER_LABELS = { any: 'Any', male: 'Male only', female: 'Female only' }
  const genderLabel = GENDER_LABELS[(prop.gender_preference || 'any').toLowerCase()] || 'Any'

  const details = [
    { label: 'Property type', value: prop.property_type || 'Not specified' },
    { label: 'Furnished',     value: prop.furnished     || 'Not specified' },
    { label: distanceLabel,   value: distanceValue, note: nearestNote },
    { label: 'Gender',        value: genderLabel },
  ]

  return (
    <div>
      <Navbar />

      <div style={{ background: '#311A50', padding: '1.5rem 0' }}>
        <div className='container'>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: 'none', border: 'none',
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer', fontSize: '13px',
              marginBottom: '8px', display: 'block',
            }}
          >
            ← Back
          </button>
          <h1 style={{ color: '#fff', fontSize: '20px', lineHeight: 1.3 }}>{prop.area || prop.title}</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', marginTop: '4px' }}>
            {prop.area}, {prop.state}
          </p>
        </div>
      </div>
      <hr className='gold-divider' />

      {/* Property image */}
      <div style={{ width: '100%', height: '320px', overflow: 'hidden', background: '#F5EDD8' }}>
        <img
          src={propertyImg(prop)}
          alt={prop.area || prop.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={e => {
            e.target.src = propertyImg({ ...prop, image_url: null })
          }}
        />
      </div>

      <div className='container' style={{ padding: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.5rem' }}>

          {/* Main content */}
          <div>
            <div className='card card-body' style={{ marginBottom: '1rem' }}>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <div style={{ fontSize: '28px', color: '#4D2D78', fontWeight: '600' }}>
                    {formatPrice(prop.rental_price)}
                    <span style={{ fontSize: '14px', fontWeight: '400', color: 'var(--text2)' }}> /month</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#7A6B5A', marginTop: '2px', marginBottom: '2px' }}>
                    {prop.property_type?.toLowerCase() === 'unit' ? 'per unit' : 'per room'}
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text2)', marginTop: '4px' }}>
                    {prop.source === 'synthetic' ? 'Community listing' : prop.source} · {prop.status}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <button
                    onClick={handleSave}
                    className={saved ? 'btn btn-gold btn-sm' : 'btn btn-ghost btn-sm'}
                  >
                    {saved ? '✓ Saved' : '+ Save'}
                  </button>
                  {saveError && (
                    <div style={{ fontSize: '11px', color: '#A02D2D', marginTop: '4px' }}>
                      {saveError}
                    </div>
                  )}
                </div>
              </div>

              <div className='grid-2' style={{ marginBottom: '1rem' }}>
                {details.map(r => (
                  <div key={r.label} style={{
                    background: '#FBF8F2', border: '1px solid #E8DDD0',
                    borderRadius: '8px', padding: '0.75rem 1rem',
                  }}>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '3px', textTransform: 'uppercase' }}>
                      {r.label}
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text)', textTransform: 'capitalize' }}>
                      {r.value}
                    </div>
                    {r.note && (
                      <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '4px', fontStyle: 'italic' }}>
                        {r.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {prop.facilities && (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '6px', fontWeight: '600' }}>FACILITIES</div>
                  <p style={{ fontSize: '14px', color: 'var(--text)' }}>{prop.facilities}</p>
                </div>
              )}

              {prop.description && (
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '6px', fontWeight: '600' }}>DESCRIPTION</div>
                  <p style={{ fontSize: '14px', color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                    {prop.description}
                  </p>
                </div>
              )}
            </div>

            {/* ── Location map ──────────────────────────────────── */}
            <div className='card card-body' style={{ marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '15px', marginBottom: '0.75rem' }}>Location &amp; distance to campus</h3>
              <MapView
                properties={[prop]}
                singlePin
                height={300}
                onView={null}
                userCampus={userCampus}
              />
              <div style={{ display: 'flex', gap: '1rem', marginTop: '10px', flexWrap: 'wrap' }}>
                {(preferredDist != null || prop.distance_to_campus) && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: '#EDE6F8', borderRadius: '8px',
                    padding: '6px 12px', fontSize: '12px', color: '#4D2D78', fontWeight: '600',
                  }}>
                    📏 {preferredDist != null ? preferredDist : prop.distance_to_campus} km to {userCampus || 'nearest UiTM campus'}
                  </div>
                )}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: '#E8F0FB', borderRadius: '8px',
                  padding: '6px 12px', fontSize: '12px', color: '#1a3a6b',
                }}>
                  🔵 Blue pins = UiTM campuses &nbsp;·&nbsp; 🔴 Red pin = this property
                </div>
              </div>
            </div>

            {/* ── Reviews & Ratings ─────────────────────────────── */}
            <div className='card card-body'>
              {(() => {
                const avg    = reviews.length
                  ? (reviews.reduce((s, r) => s + r.satisfaction_level, 0) / reviews.length).toFixed(1)
                  : null
                const counts = [5,4,3,2,1].map(n => ({
                  star: n,
                  count: reviews.filter(r => r.satisfaction_level === n).length,
                }))

                return (
                  <>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                      <h3 style={{ fontSize: '16px', margin: 0 }}>
                        Student ratings &amp; reviews
                      </h3>
                      {reviews.length > 0 && (
                        <span style={{ fontSize: '12px', color: 'var(--text2)' }}>
                          {reviews.length} review{reviews.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {reviews.length > 0 ? (
                      <>
                        {/* Average + bar chart */}
                        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid #E8DDD0' }}>
                          <div style={{ textAlign: 'center', flexShrink: 0 }}>
                            <div style={{ fontSize: '40px', fontWeight: '700', color: '#4D2D78', lineHeight: 1 }}>{avg}</div>
                            <div style={{ display: 'flex', gap: '2px', justifyContent: 'center', margin: '4px 0' }}>
                              {[1,2,3,4,5].map(n => (
                                <span key={n} style={{ fontSize: '14px', color: n <= Math.round(avg) ? '#C9A96E' : '#E8DDD0' }}>★</span>
                              ))}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text2)' }}>out of 5</div>
                          </div>
                          <div style={{ flex: 1 }}>
                            {counts.map(({ star, count }) => (
                              <div key={star} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <span style={{ fontSize: '11px', color: 'var(--text2)', width: '10px', textAlign: 'right' }}>{star}</span>
                                <span style={{ fontSize: '11px', color: '#C9A96E' }}>★</span>
                                <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: '#F0E8DC', overflow: 'hidden' }}>
                                  <div style={{
                                    width: reviews.length ? `${(count / reviews.length) * 100}%` : '0%',
                                    height: '100%', borderRadius: '3px', background: '#C9A96E',
                                    transition: 'width 0.4s ease',
                                  }} />
                                </div>
                                <span style={{ fontSize: '11px', color: 'var(--text2)', width: '18px' }}>{count}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Individual reviews */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {reviews.map((r, i) => (
                            <div key={r.id} style={{
                              borderBottom: i < reviews.length - 1 ? '1px solid #E8DDD0' : 'none',
                              paddingBottom: i < reviews.length - 1 ? '12px' : 0,
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                <div style={{
                                  width: '32px', height: '32px', borderRadius: '50%',
                                  background: '#4D2D78', flexShrink: 0,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '12px', color: '#fff', fontWeight: '600',
                                }}>
                                  {r.reviewer?.[0]?.toUpperCase() || '?'}
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>{r.reviewer}</div>
                                  <div style={{ fontSize: '11px', color: 'var(--text2)' }}>
                                    {new Date(r.created_at).toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' })}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: '2px' }}>
                                  {[1,2,3,4,5].map(n => (
                                    <span key={n} style={{ fontSize: '13px', color: n <= r.satisfaction_level ? '#C9A96E' : '#E8DDD0' }}>★</span>
                                  ))}
                                </div>
                              </div>
                              {r.comment && (
                                <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, margin: 0, paddingLeft: '42px' }}>
                                  {r.comment}
                                </p>
                              )}
                              {r.sentiment_score != null && (() => {
                                const s = r.sentiment_score
                                const label = s > 0.05 ? 'Positive' : s < -0.05 ? 'Negative' : 'Neutral'
                                const color = s > 0.05 ? '#2e7d32' : s < -0.05 ? '#c62828' : '#6d6d6d'
                                const bg    = s > 0.05 ? '#e8f5e9' : s < -0.05 ? '#ffebee' : '#f0f0f0'
                                return (
                                  <span style={{
                                    display: 'inline-block', marginTop: '6px', marginLeft: '42px',
                                    fontSize: '11px', fontWeight: '600', padding: '2px 8px',
                                    borderRadius: '999px', background: bg, color,
                                  }}>
                                    {label}
                                  </span>
                                )
                              })()}
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--text2)' }}>
                        <div style={{ fontSize: '28px', marginBottom: '8px' }}>⭐</div>
                        <p style={{ fontSize: '14px', margin: 0 }}>No reviews yet</p>
                        <p style={{ fontSize: '12px', margin: '4px 0 0' }}>Be the first to rate this property</p>
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          </div>

          {/* Sidebar — landlord contact + feedback */}
          <div>
            <ContactCard prop={prop} />

            <div className='card card-body'>
              <h3 style={{ marginBottom: '1rem' }}>Rate this property</h3>

              {!Auth.isLoggedIn() ? (
                <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                  <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '12px' }}>
                    You need to be logged in to leave a review.
                  </p>
                  <button
                    className='btn btn-primary btn-block'
                    onClick={() => navigate('/login')}
                  >
                    Log in to review
                  </button>
                </div>
              ) : submitted ? (
                <div className='alert alert-success'>Thank you for your feedback!</div>
              ) : (
                <form onSubmit={handleFeedback}>
                  <div className='form-group'>
                    <label className='form-label'>Your rating</label>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <button
                          key={n}
                          type='button'
                          onClick={() => setRating(n)}
                          style={{
                            width: '36px', height: '36px', borderRadius: '50%',
                            border: '2px solid',
                            borderColor: rating >= n ? '#C9A96E' : '#E8DDD0',
                            background: rating >= n ? '#C9A96E' : 'transparent',
                            color: rating >= n ? '#2D2519' : '#B0A090',
                            fontWeight: '600', fontSize: '14px', cursor: 'pointer',
                          }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className='form-group'>
                    <label className='form-label'>Comment (optional)</label>
                    <textarea
                      className='form-input'
                      rows={3}
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      placeholder='Share your experience...'
                    />
                  </div>
                  {fbError && <div className='alert alert-error'>{fbError}</div>}
                  <button type='submit' disabled={rating === 0} className='btn btn-primary btn-block'>
                    Submit feedback
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Enquiry card — students only */}
          {Auth.isLoggedIn() && Auth.getUser()?.role !== 'houseowner' && (
            <div>
              <div className='card card-body' style={{ marginTop: '1rem' }}>
                <h3 style={{ marginBottom: '4px' }}>Contact landlord</h3>
                <p style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '1rem' }}>
                  Send a rental enquiry directly to the property owner.
                </p>

                {enqAlreadySent ? (
                  <div style={{
                    background: '#FFF8E6', border: '1px solid #C9A96E',
                    borderRadius: '10px', padding: '1rem 1.1rem',
                    display: 'flex', gap: '10px', alignItems: 'flex-start',
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B6914" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}>
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#8B6914', marginBottom: '2px' }}>
                        Enquiry already sent
                      </div>
                      <div style={{ fontSize: '12px', color: '#7A6B5A', lineHeight: 1.5 }}>
                        You have already submitted an enquiry for this property. You can view the landlord's reply in your profile under <strong>My Enquiries</strong>.
                      </div>
                    </div>
                  </div>
                ) : enqSubmitted ? (
                  <div className='alert alert-success'>
                    Enquiry sent! The landlord will be in touch. Check <strong>My Enquiries</strong> in your profile for any replies.
                  </div>
                ) : (
                  <form onSubmit={handleEnquiry}>
                    <div className='form-group'>
                      <label className='form-label'>Your message</label>
                      <textarea
                        className='form-input'
                        rows={4}
                        value={enqMessage}
                        onChange={e => setEnqMessage(e.target.value)}
                        placeholder={'Hi, I am interested in this room. Could you provide more details about availability and viewing schedule?'}
                      />
                    </div>
                    {enqError && <div className='alert alert-error'>{enqError}</div>}
                    <button type='submit' disabled={enqLoading} className='btn btn-primary btn-block'>
                      {enqLoading ? 'Sending...' : 'Send enquiry'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Related Properties ─────────────────────────────────── */}
      {related.length > 0 && (
        <div className="container" style={{ padding: '0 1.5rem 2rem' }}>
          <h2 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: '18px', color: '#311A50',
            marginBottom: '1rem', borderTop: '1px solid #E8DDD0', paddingTop: '1.5rem',
          }}>
            Similar Properties Nearby
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
            {related.map(r => (
              <div key={r.id}
                onClick={() => navigate(`/property/${r.id}`)}
                style={{
                  background: '#FFFCF7', border: '1px solid #E8DDD0',
                  borderRadius: '12px', overflow: 'hidden', cursor: 'pointer',
                  transition: 'box-shadow 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
              >
                <img
                  src={propertyImg(r)}
                  alt={r.title}
                  onError={e => { e.target.src = propertyImg({ image_url: null }) }}
                  style={{ width: '100%', height: '130px', objectFit: 'cover' }}
                />
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: '#4D2D78', marginBottom: '2px' }}>
                    {formatPrice(r.rental_price)}<span style={{ fontSize: '11px', fontWeight: '400', color: 'var(--text3)' }}>/mo</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text)', marginBottom: '4px', lineHeight: 1.4 }}>
                    {r.title?.length > 50 ? r.title.slice(0, 50) + '…' : r.title}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text2)' }}>
                    📍 {r.area}, {r.state}
                  </div>
                  {r.distance_to_campus && (
                    <div style={{ fontSize: '11px', color: '#2D8B6F', marginTop: '2px' }}>
                      📏 {r.distance_to_campus} km from campus
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
