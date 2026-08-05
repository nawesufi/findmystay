import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { Auth, getRecommendations, getInteractions, getStats, formatPrice, propertyImg, logInteraction } from '../api'

// ── Shared mini property card ─────────────────────────────────────────────────
function MiniCard({ prop, rank, badge, badgeColor, badgeBg, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#FFFCF7',
        border: '1px solid #E8DDD0',
        borderRadius: '12px',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s, transform 0.15s',
        boxShadow: hovered ? '0 6px 24px rgba(77,45,120,0.14)' : 'none',
        transform: hovered ? 'translateY(-3px)' : 'none',
      }}
    >
      <div style={{ position: 'relative' }}>
        <img
          src={propertyImg(prop)}
          alt={prop.area || prop.title}
          onError={e => { e.target.src = propertyImg({ ...prop, image_url: null }) }}
          style={{ width: '100%', height: '130px', objectFit: 'cover', display: 'block' }}
        />
        {rank != null && (
          <div style={{
            position: 'absolute', top: '8px', left: '8px',
            background: '#4D2D78', color: '#fff',
            borderRadius: '50%', width: '22px', height: '22px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', fontWeight: '700',
          }}>{rank}</div>
        )}
        {badge && (
          <div style={{
            position: 'absolute', top: '8px', right: '8px',
            background: badgeBg || '#D4EDE6', color: badgeColor || '#1A5E4A',
            fontSize: '9px', fontWeight: '700', padding: '2px 7px',
            borderRadius: '10px', letterSpacing: '0.04em',
          }}>{badge}</div>
        )}
      </div>
      <div style={{ padding: '11px 12px 13px' }}>
        <div style={{ fontSize: '15px', fontWeight: '700', color: '#4D2D78', marginBottom: '1px' }}>
          {formatPrice(prop.rental_price)}
          <span style={{ fontSize: '11px', fontWeight: '400', color: 'var(--text3)' }}>/mo</span>
        </div>
        <div style={{
          fontSize: '12px', color: 'var(--text)', marginBottom: '6px',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {prop.area || prop.title}
        </div>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: prop.reason ? '7px' : 0 }}>
          {prop.property_type && (
            <span style={{
              fontSize: '10px', padding: '2px 7px', borderRadius: '10px',
              background: '#EDE6F8', color: '#4D2D78', fontWeight: '500', textTransform: 'capitalize',
            }}>{prop.property_type}</span>
          )}
          {(prop.distance_to_preferred_campus ?? prop.distance_to_campus) != null && (
            <span style={{ fontSize: '10px', color: 'var(--text3)' }}>
              📏 {(prop.distance_to_preferred_campus ?? prop.distance_to_campus)} km
            </span>
          )}
        </div>
        {prop.reason && (
          <div style={{
            fontSize: '10px', color: '#1A5E4A', background: '#D4EDE6',
            borderRadius: '5px', padding: '3px 7px',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            ✓ {prop.reason.split(' · ')[0]}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Skeleton placeholder ──────────────────────────────────────────────────────
function SkeletonCards() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
      {[1,2,3,4].map(n => (
        <div key={n} style={{
          borderRadius: '12px', overflow: 'hidden',
          border: '1px solid #E8DDD0', background: '#FFFCF7',
        }}>
          <div style={{ height: '130px', background: '#F0EBF8' }} />
          <div style={{ padding: '11px 12px' }}>
            <div style={{ height: '14px', background: '#EDE6F8', borderRadius: '4px', marginBottom: '6px', width: '60%' }} />
            <div style={{ height: '11px', background: '#F5F0FC', borderRadius: '4px', width: '80%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ eyebrow, title, sub, linkTo, linkLabel }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.25rem' }}>
      <div>
        <p style={{ color: '#C9A96E', fontSize: '10px', fontWeight: '700', letterSpacing: '0.08em', marginBottom: '4px' }}>
          {eyebrow}
        </p>
        <h2 style={{ fontSize: '18px', marginBottom: '3px', color: 'var(--text)' }}>{title}</h2>
        {sub && <p style={{ color: 'var(--text2)', fontSize: '12px' }}>{sub}</p>}
      </div>
      {linkTo && (
        <Link to={linkTo} style={{
          fontSize: '13px', fontWeight: '600', color: '#4D2D78',
          textDecoration: 'none', flexShrink: 0,
        }}>
          {linkLabel || 'See all →'}
        </Link>
      )}
    </div>
  )
}

// ── Returning user homepage ───────────────────────────────────────────────────
function ReturningHome({ user, firstName }) {
  const navigate = useNavigate()

  const [recs,        setRecs]        = useState([])
  const [recsLoading, setRecsLoading] = useState(true)
  const [history,     setHistory]     = useState([])
  const [histLoading, setHistLoading] = useState(true)

  useEffect(() => {
    getRecommendations(4)
      .then(d => setRecs(d?.recommendations || []))
      .catch(() => {})
      .finally(() => setRecsLoading(false))

    getInteractions()
      .then(d => {
        // Deduplicate by property_id, keep most recent, show last 4
        const seen = new Set()
        const unique = (d || []).filter(i => {
          if (seen.has(i.property_id)) return false
          seen.add(i.property_id)
          return true
        })
        setHistory(unique.slice(0, 4))
      })
      .catch(() => {})
      .finally(() => setHistLoading(false))
  }, [])

  const isHybrid = recs.length > 0 && (recs[0]?.method || '').includes('hybrid')

  function handleView(id) {
    logInteraction(id, 'view').catch(() => {})
    navigate(`/property/${id}`)
  }

  return (
    <div style={{ background: '#FBF8F2', minHeight: '100vh' }}>
      <Navbar />

      {/* ── Welcome banner ─────────────────────────────────────── */}
      <div style={{ background: '#311A50', padding: '2rem 0 1.75rem' }}>
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', marginBottom: '4px', letterSpacing: '0.05em' }}>
                WELCOME BACK
              </p>
              <h1 style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: '26px', color: '#fff', marginBottom: '4px',
              }}>
                {firstName}
              </h1>
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '13px' }}>
                {user?.uitm_campus || 'UiTM Student'} · Here are your personalised picks
              </p>
            </div>
            {/* Quick actions */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Link to="/listings"        className="btn btn-ghost" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)', border: '1px solid rgba(255,255,255,0.25)' }}>Browse all</Link>
              <Link to="/recommendations" className="btn btn-ghost" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)', border: '1px solid rgba(255,255,255,0.25)' }}>All recommendations</Link>
              <Link to="/profile"         style={{ fontSize: '12px', fontWeight: '600', padding: '6px 14px', borderRadius: '7px', background: '#C9A96E', color: '#2D2519', textDecoration: 'none', fontFamily: "'DM Sans', sans-serif" }}>My profile</Link>
            </div>
          </div>
        </div>
      </div>
      <hr className="gold-divider" />

      <div className="container" style={{ padding: '2rem 1.5rem 3rem' }}>

        {/* ── Section 1: Based on what other students liked ─────── */}
        <section style={{ marginBottom: '2.5rem' }}>
          <SectionHeader
            eyebrow={isHybrid ? 'BASED ON WHAT OTHER STUDENTS LIKED' : 'BASED ON YOUR PREFERENCES'}
            title={isHybrid ? 'Students like you also saved these' : 'Picked for you'}
            sub={isHybrid
              ? 'Our AI found students with similar preferences and ranked what they saved and viewed'
              : 'Matched to your campus, budget and room type using content-based filtering'}
            linkTo="/recommendations"
            linkLabel="See all recommendations →"
          />

          {recsLoading && <SkeletonCards />}

          {!recsLoading && recs.length === 0 && (
            <div style={{
              background: '#EDE6F8', borderLeft: '3px solid #4D2D78',
              borderRadius: '8px', padding: '1rem 1.25rem',
              display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: '24px', flexShrink: 0 }}>⚙️</span>
              <div style={{ flex: 1, minWidth: '220px' }}>
                <p style={{ fontWeight: '600', color: '#4D2D78', marginBottom: '2px', fontSize: '14px' }}>
                  Set your preferences to unlock personalised picks
                </p>
                <p style={{ color: 'var(--text2)', fontSize: '12px' }}>
                  Tell us your campus, budget and room type — we'll find your best matches.
                </p>
              </div>
              <Link to="/profile?setup=1" className="btn btn-primary btn-sm" style={{ flexShrink: 0 }}>
                Set preferences
              </Link>
            </div>
          )}

          {!recsLoading && recs.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
              {recs.map((r, i) => (
                <MiniCard
                  key={r.id}
                  prop={r}
                  rank={i + 1}
                  badge={isHybrid ? 'AI PICK' : 'FOR YOU'}
                  badgeBg={isHybrid ? '#EDE6F8' : '#D4EDE6'}
                  badgeColor={isHybrid ? '#4D2D78' : '#1A5E4A'}
                  onClick={() => handleView(r.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Divider ─────────────────────────────────────────────── */}
        <div style={{ borderTop: '1px solid #E8DDD0', marginBottom: '2.5rem' }} />

        {/* ── Section 2: Based on what you viewed / saved ─────────── */}
        <section>
          <SectionHeader
            eyebrow="BASED ON WHAT YOU VIEWED OR SAVED"
            title="Recently viewed by you"
            sub="Properties you have viewed or saved — these also train your AI recommendations"
            linkTo="/profile"
            linkLabel="View full history →"
          />

          {histLoading && <SkeletonCards />}

          {!histLoading && history.length === 0 && (
            <div style={{
              background: '#FBF8F2', borderLeft: '3px solid #C9A96E',
              borderRadius: '8px', padding: '1rem 1.25rem',
              display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: '24px', flexShrink: 0 }}>👀</span>
              <div style={{ flex: 1, minWidth: '220px' }}>
                <p style={{ fontWeight: '600', color: 'var(--text)', marginBottom: '2px', fontSize: '14px' }}>
                  No viewing history yet
                </p>
                <p style={{ color: 'var(--text2)', fontSize: '12px' }}>
                  Browse listings and save the ones you like — they'll appear here and improve your recommendations.
                </p>
              </div>
              <Link to="/listings" className="btn btn-primary btn-sm" style={{ flexShrink: 0 }}>Browse listings</Link>
            </div>
          )}

          {!histLoading && history.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
              {history.map(i => {
                const prop = i.property || {}
                const isSaved = i.interaction_type === 'save'
                return (
                  <MiniCard
                    key={i.id}
                    prop={{ ...prop, reason: null }}
                    badge={isSaved ? 'SAVED' : 'VIEWED'}
                    badgeBg={isSaved ? '#D4EDE6' : '#EDE6F8'}
                    badgeColor={isSaved ? '#1A5E4A' : '#4D2D78'}
                    onClick={() => handleView(prop.id || i.property_id)}
                  />
                )
              })}
            </div>
          )}
        </section>
      </div>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer style={{
        background: '#1E1228', color: 'rgba(255,255,255,0.4)',
        padding: '1.5rem', textAlign: 'center',
        fontSize: '12px', fontFamily: "'DM Sans', sans-serif",
      }}>
        FindMyStay@UiTM — FYP Project · Faculty of Computer and Mathematical Sciences · UiTM
      </footer>
    </div>
  )
}

// ── Guest landing page ────────────────────────────────────────────────────────
function GuestHome() {
  const [listingsLabel, setListingsLabel] = useState('6,000+')

  useEffect(() => {
    getStats()
      .then(data => {
        const total = data?.total_properties
        if (total) setListingsLabel(`${(Math.floor(total / 100) * 100).toLocaleString()}+`)
      })
      .catch(() => {})
  }, [])

  return (
    <div>
      <Navbar />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section style={{
        background: `
          radial-gradient(ellipse 75% 65% at 15% 25%, rgba(110,40,200,0.5) 0%, transparent 60%),
          radial-gradient(ellipse 60% 55% at 85% 75%, rgba(25,70,155,0.45) 0%, transparent 55%),
          radial-gradient(ellipse 50% 40% at 65% 8%,  rgba(201,169,110,0.22) 0%, transparent 50%),
          radial-gradient(ellipse 55% 50% at 35% 90%, rgba(20,110,80,0.22) 0%, transparent 55%),
          linear-gradient(145deg, #080416 0%, #160830 40%, #0B1A32 100%)
        `,
        padding: '6rem 0 5rem',
        textAlign: 'center', position: 'relative', overflow: 'hidden',
      }}>
        {/* Subtle grid overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.018) 0, rgba(255,255,255,0.018) 1px, transparent 1px, transparent 28px)',
          pointerEvents: 'none',
        }} />
        {/* Gold glow top-right */}
        <div style={{
          position: 'absolute', top: '-60px', right: '-60px',
          width: '420px', height: '420px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(201,169,110,0.22) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />
        {/* Teal glow bottom-left */}
        <div style={{
          position: 'absolute', bottom: '-50px', left: '-50px',
          width: '340px', height: '340px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(26,94,74,0.3) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />

        {/* ── Decorative SVG elements ─────────────────────────── */}

        {/* Large house — bottom right */}
        <svg style={{ position: 'absolute', bottom: '-6px', right: '3%', opacity: 0.1, pointerEvents: 'none' }}
             width="280" height="210" viewBox="0 0 140 105" fill="none">
          <rect x="8" y="44" width="124" height="61" stroke="white" strokeWidth="1.3"/>
          <path d="M2 45 L70 7 L138 45" stroke="white" strokeWidth="1.7" strokeLinejoin="round"/>
          <rect x="92" y="16" width="12" height="24" stroke="white" strokeWidth="1.1"/>
          <line x1="90" y1="16" x2="106" y2="16" stroke="white" strokeWidth="1"/>
          <path d="M57 105 L57 76 Q57 67 70 67 Q83 67 83 76 L83 105" stroke="white" strokeWidth="1.2"/>
          <circle cx="80" cy="86" r="1.8" fill="white"/>
          <rect x="14" y="53" width="22" height="17" rx="1.5" stroke="white" strokeWidth="1"/>
          <line x1="25" y1="53" x2="25" y2="70" stroke="white" strokeWidth="0.6"/>
          <line x1="14" y1="61" x2="36" y2="61" stroke="white" strokeWidth="0.6"/>
          <rect x="104" y="53" width="22" height="17" rx="1.5" stroke="white" strokeWidth="1"/>
          <line x1="115" y1="53" x2="115" y2="70" stroke="white" strokeWidth="0.6"/>
          <line x1="104" y1="61" x2="126" y2="61" stroke="white" strokeWidth="0.6"/>
          <line x1="-8" y1="105" x2="165" y2="105" stroke="white" strokeWidth="0.7"/>
          <path d="M53 105 v5 h34 v-5" stroke="white" strokeWidth="0.8"/>
          <line x1="5" y1="105" x2="5" y2="78" stroke="white" strokeWidth="1.1"/>
          <ellipse cx="5" cy="72" rx="7" ry="9" stroke="white" strokeWidth="0.9"/>
          <line x1="135" y1="105" x2="135" y2="80" stroke="white" strokeWidth="1.1"/>
          <ellipse cx="135" cy="74" rx="6" ry="8" stroke="white" strokeWidth="0.9"/>
        </svg>

        {/* Apartment building — bottom left */}
        <svg style={{ position: 'absolute', bottom: '-4px', left: '2%', opacity: 0.08, pointerEvents: 'none' }}
             width="130" height="170" viewBox="0 0 65 85" fill="none">
          <rect x="5" y="14" width="55" height="71" stroke="white" strokeWidth="1.2"/>
          <rect x="2" y="9" width="61" height="8" stroke="white" strokeWidth="1"/>
          <rect x="24" y="2" width="17" height="9" stroke="white" strokeWidth="0.9"/>
          {[0,1,2,3,4].map(row => [0,1,2].map(col => (
            <rect key={`${row}-${col}`}
              x={11 + col * 16} y={20 + row * 13}
              width="10" height="8" rx="1"
              stroke="white" strokeWidth="0.75"
            />
          )))}
          <rect x="24" y="68" width="17" height="17" stroke="white" strokeWidth="1"/>
          <line x1="-5" y1="85" x2="80" y2="85" stroke="white" strokeWidth="0.7"/>
        </svg>

        {/* Small house — top left */}
        <svg style={{ position: 'absolute', top: '10%', left: '5%', opacity: 0.07, pointerEvents: 'none' }}
             width="90" height="75" viewBox="0 0 90 75" fill="none">
          <rect x="8" y="34" width="74" height="41" stroke="white" strokeWidth="1.3"/>
          <path d="M2 35 L45 5 L88 35" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
          <rect x="36" y="50" width="18" height="25" stroke="white" strokeWidth="1"/>
          <rect x="13" y="42" width="16" height="13" rx="1" stroke="white" strokeWidth="0.9"/>
          <rect x="61" y="42" width="16" height="13" rx="1" stroke="white" strokeWidth="0.9"/>
        </svg>

        {/* Graduation cap — top right, floating, gold */}
        <svg className="anim-float" style={{ position: 'absolute', top: '12%', right: '9%', opacity: 0.2, pointerEvents: 'none' }}
             width="80" height="64" viewBox="0 0 80 64" fill="none">
          <polygon points="40,7 76,25 40,43 4,25" stroke="rgba(201,169,110,1)" strokeWidth="1.8" strokeLinejoin="round" fill="rgba(201,169,110,0.07)"/>
          <line x1="4" y1="25" x2="4" y2="50" stroke="rgba(201,169,110,1)" strokeWidth="1.8"/>
          <circle cx="4" cy="55" r="4" stroke="rgba(201,169,110,1)" strokeWidth="1.5" fill="none"/>
          <path d="M20 37 v12 c0 8 12 13 20 13 s20-5 20-13 v-12" stroke="rgba(201,169,110,1)" strokeWidth="1.5" fill="none"/>
        </svg>

        {/* Location pin — left side, floating, gold */}
        <svg className="anim-float" style={{ position: 'absolute', top: '35%', left: '12%', opacity: 0.16, pointerEvents: 'none', animationDelay: '1.2s' }}
             width="32" height="44" viewBox="0 0 32 44" fill="none">
          <path d="M16 2 C7 2 1 9 1 17 C1 29 16 43 16 43 C16 43 31 29 31 17 C31 9 25 2 16 2Z" stroke="rgba(201,169,110,0.9)" strokeWidth="1.8"/>
          <circle cx="16" cy="17" r="5.5" stroke="rgba(201,169,110,0.9)" strokeWidth="1.5"/>
        </svg>

        {/* Key — mid right, floating */}
        <svg className="anim-float" style={{ position: 'absolute', top: '55%', right: '5%', opacity: 0.11, pointerEvents: 'none', transform: 'rotate(-32deg)', animationDelay: '0.7s' }}
             width="62" height="28" viewBox="0 0 62 28" fill="none">
          <circle cx="14" cy="14" r="12" stroke="white" strokeWidth="1.8"/>
          <circle cx="14" cy="14" r="5" stroke="white" strokeWidth="1.3"/>
          <line x1="26" y1="14" x2="61" y2="14" stroke="white" strokeWidth="1.8"/>
          <line x1="48" y1="14" x2="48" y2="22" stroke="white" strokeWidth="1.8"/>
          <line x1="55" y1="14" x2="55" y2="21" stroke="white" strokeWidth="1.8"/>
        </svg>

        <div className="container" style={{ position: 'relative' }}>
          <div className="anim-fade-up d0" style={{
            display: 'inline-block',
            background: 'rgba(201,169,110,0.15)', border: '1px solid rgba(201,169,110,0.4)',
            color: '#C9A96E', fontSize: '11px', fontWeight: '600',
            padding: '5px 16px', borderRadius: '20px',
            marginBottom: '1.5rem', letterSpacing: '0.08em',
          }}>
            AI-POWERED · STUDENTS & LANDLORDS
          </div>
          <h1 className="anim-fade-up d1" style={{
            fontFamily: "'Fraunces', serif",
            fontSize: 'clamp(38px, 5.5vw, 62px)', color: '#fff',
            marginBottom: '1.25rem', lineHeight: 1.1,
            fontWeight: '900',
            textShadow: '0 2px 20px rgba(0,0,0,0.3)',
          }}>
            Find your room.<br />List your space.
          </h1>
          <p className="anim-fade-up d2" style={{
            fontSize: '17px', color: 'rgba(255,255,255,0.7)',
            maxWidth: '560px', margin: '0 auto 2.25rem', lineHeight: 1.75,
          }}>
            Students get AI-powered room recommendations near their UiTM campus.
            Landlords list their properties and manage enquiries — all in one place.
          </p>
          <div className="anim-fade-up d3" style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/listings" className="btn btn-gold btn-lg">Browse listings</Link>
            <Link to="/login"    className="btn btn-outline-white btn-lg">Create free account</Link>
          </div>

          {/* Stats strip */}
          <div className="anim-fade-in d5" style={{
            display: 'flex', justifyContent: 'center', gap: '2.5rem',
            marginTop: '3.5rem', paddingTop: '2rem',
            borderTop: '1px solid rgba(255,255,255,0.12)', flexWrap: 'wrap',
          }}>
            {[
              { n: listingsLabel, l: 'Active listings' },
              { n: '3',      l: 'States covered' },
              { n: 'AI',     l: 'Hybrid algorithm' },
              { n: 'Free',   l: 'For everyone' },
            ].map((s, i) => (
              <div key={s.l} className={`anim-count d${i + 5}`} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: '28px', fontWeight: '700', color: '#fff' }}>{s.n}</div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', marginTop: '3px', letterSpacing: '0.07em' }}>{s.l.toUpperCase()}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <hr className="gold-divider" />

      {/* ── Feature cards ──────────────────────────────────────── */}
      <section style={{ padding: '4.5rem 0', background: '#FBF8F2' }}>
        <div className="container">
          <div className="text-center mb-4 anim-fade-up">
            <h2>Why FindMyStay@UiTM?</h2>
            <p className="text-muted mt-1">Built specifically for UiTM students — not a generic rental platform</p>
          </div>
          <div className="grid-3">
            {[
              { icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4D2D78" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l1.9 5.8a2 2 0 001.3 1.3L21 12l-5.8 1.9a2 2 0 00-1.3 1.3L12 21l-1.9-5.8a2 2 0 00-1.3-1.3L3 12l5.8-1.9a2 2 0 001.3-1.3z"/>
                  </svg>
                ), bg: '#EDE6F8', title: 'Personalised AI matching', desc: 'TF-IDF content-based filtering selects top candidates. SVD collaborative filtering re-ranks to your top 10.', d: 'd1' },
              { icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8B6914" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0116 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                ), bg: '#F5EDD8', title: 'Campus distance & map', desc: 'Every listing shows distance to your preferred UiTM campus. View all on an interactive map with campus markers.', d: 'd2' },
              { icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2D8B6F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="6" height="6" rx="1"/>
                    <path d="M6 9h3M6 12h3M6 15h3M15 9h3M15 12h3M15 15h3M9 6v3M12 6v3M15 6v3M9 15v3M12 15v3M15 15v3"/>
                  </svg>
                ), bg: '#D4EDE6', title: 'NLP sentiment analysis', desc: 'VADER analyses reviews to enrich ratings before SVD training — input-level hybrid combination.', d: 'd3' },
              { icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4D2D78" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="m21 21-4.3-4.3"/>
                  </svg>
                ), bg: '#EDE6F8', title: 'Natural language search', desc: 'Search with plain language — "cheap single room near UiTM with WiFi" — and get matched listings instantly.', d: 'd4' },
            ].map(f => (
              <div key={f.title} className={`card card-body hover-lift anim-fade-up ${f.d}`} style={{ background: '#FFFCF7' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: f.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                  {f.icon}
                </div>
                <h3 style={{ marginBottom: '0.5rem', fontSize: '15px' }}>{f.title}</h3>
                <p style={{ color: 'var(--text2)', fontSize: '13px', lineHeight: 1.65 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Who is it for ──────────────────────────────────────── */}
      <section style={{ background: '#FBF8F2', padding: '4rem 0', borderTop: '1px solid #E8DDD0' }}>
        <div className="container">
          <div className="text-center mb-4 anim-fade-up">
            <h2>Who is it for?</h2>
            <p className="text-muted mt-1">FindMyStay@UiTM serves both sides of the rental market</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {/* Student card */}
            <div className="anim-slide-left d1 hover-lift" style={{ background: '#FFFCF7', border: '1px solid #C4A8E8', borderRadius: '16px', padding: '2rem' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: '#EDE6F8', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.1rem' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4D2D78" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                  <path d="M6 12v5c3.286 2 8.714 2 12 0v-5"/>
                </svg>
              </div>
              <h3 style={{ fontSize: '18px', color: '#4D2D78', marginBottom: '0.5rem' }}>For Students</h3>
              <p style={{ color: 'var(--text2)', fontSize: '13px', lineHeight: 1.7, marginBottom: '1.25rem' }}>
                UiTM students in Negeri Sembilan, Melaka, and Johor get personalised room recommendations based on their campus, budget, room type, and preferred facilities.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  'AI-powered recommendations (CBF + SVD)',
                  'Filter by campus distance, price, room type',
                  'View and compare listings on a map',
                  'Send enquiries to landlords directly',
                  'Save listings and leave reviews',
                ].map(t => (
                  <li key={t} style={{ fontSize: '13px', color: 'var(--text)', display: 'flex', gap: '8px' }}>
                    <span style={{ color: '#4D2D78', fontWeight: '700', flexShrink: 0 }}>✓</span> {t}
                  </li>
                ))}
              </ul>
              <Link to="/login" className="btn btn-primary" style={{ display: 'block', textAlign: 'center' }}>
                Find a room →
              </Link>
            </div>

            {/* Landlord card */}
            <div className="anim-slide-right d1 hover-lift" style={{ background: '#FFFCF7', border: '1px solid #C9A96E', borderRadius: '16px', padding: '2rem' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: '#F5EDD8', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.1rem' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8B6914" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                  <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
              </div>
              <h3 style={{ fontSize: '18px', color: '#8B6914', marginBottom: '0.5rem' }}>For Landlords</h3>
              <p style={{ color: 'var(--text2)', fontSize: '13px', lineHeight: 1.7, marginBottom: '1.25rem' }}>
                Property owners can list their rooms and units, manage enquiries from students, and receive real-time notifications whenever a student interacts with their listing.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  'List and manage properties easily',
                  'Auto-detect nearest UiTM campus via GPS',
                  'Receive enquiries from interested students',
                  'Reply to enquiries from the dashboard',
                  'Get notified on saves, ratings & enquiries',
                ].map(t => (
                  <li key={t} style={{ fontSize: '13px', color: 'var(--text)', display: 'flex', gap: '8px' }}>
                    <span style={{ color: '#C9A96E', fontWeight: '700', flexShrink: 0 }}>✓</span> {t}
                  </li>
                ))}
              </ul>
              <Link to="/login" className="btn btn-gold" style={{ display: 'block', textAlign: 'center' }}>
                List your property →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────── */}
      <section style={{ background: '#FFFCF7', padding: '4rem 0', borderTop: '1px solid #E8DDD0' }}>
        <div className="container">
          <div className="text-center anim-fade-up" style={{ marginBottom: '2.5rem' }}>
            <h2>How it works</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: '0 2.5rem', alignItems: 'start' }}>
            {/* Student steps */}
            <div className="anim-slide-left d1">
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '1.5rem' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4D2D78" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                  <path d="M6 12v5c3.286 2 8.714 2 12 0v-5"/>
                </svg>
                <span style={{ color: '#4D2D78', fontSize: '11px', fontWeight: '700', letterSpacing: '0.08em' }}>FOR STUDENTS</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {[
                  { n: '1', title: 'Create account',   desc: 'Register with your UiTM email as a student' },
                  { n: '2', title: 'Set preferences',  desc: 'Tell us your campus, budget, room type and facilities' },
                  { n: '3', title: 'Get matched',      desc: `Our AI analyses ${listingsLabel} listings and returns your top 10` },
                  { n: '4', title: 'Contact landlord', desc: 'Send an enquiry directly through FindMyStay@UiTM' },
                ].map(step => (
                  <div key={step.n} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                    <div style={{
                      width: '34px', height: '34px', borderRadius: '50%', background: '#EDE6F8', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: "'Playfair Display', serif", fontSize: '14px', color: '#4D2D78', fontWeight: '700',
                    }}>{step.n}</div>
                    <div style={{ paddingTop: '5px' }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)', marginBottom: '3px' }}>{step.title}</div>
                      <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>{step.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Vertical divider */}
            <div style={{ background: '#E8DDD0', height: '100%', minHeight: '220px' }} />

            {/* Landlord steps */}
            <div className="anim-slide-right d1">
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '1.5rem' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8B6914" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                  <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
                <span style={{ color: '#8B6914', fontSize: '11px', fontWeight: '700', letterSpacing: '0.08em' }}>FOR LANDLORDS</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {[
                  { n: '1', title: 'Create account',    desc: 'Register as a landlord with your contact details' },
                  { n: '2', title: 'Add your listing',  desc: 'Fill in property details — GPS auto-finds your nearest campus' },
                  { n: '3', title: 'Receive enquiries', desc: 'Students contact you directly through the platform' },
                  { n: '4', title: 'Manage & reply',    desc: 'Reply to enquiries and get notified on saves and ratings' },
                ].map(step => (
                  <div key={step.n} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                    <div style={{
                      width: '34px', height: '34px', borderRadius: '50%', background: '#F5EDD8', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: "'Playfair Display', serif", fontSize: '14px', color: '#8B6914', fontWeight: '700',
                    }}>{step.n}</div>
                    <div style={{ paddingTop: '5px' }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)', marginBottom: '3px' }}>{step.title}</div>
                      <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>{step.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <section style={{ background: '#4D2D78', padding: '4.5rem 0', textAlign: 'center' }}>
        <div className="container">
          <h2 className="anim-fade-up d1" style={{ color: '#fff', marginBottom: '0.75rem' }}>Ready to get started?</h2>
          <p className="anim-fade-up d2" style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '2rem' }}>
            Join students and landlords already using FindMyStay@UiTM
          </p>
          <div className="anim-fade-up d3" style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/login" className="btn btn-gold btn-lg hover-lift">Find a room</Link>
            <Link to="/login" className="btn btn-outline-white btn-lg hover-lift">List your property</Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer style={{
        background: '#1E1228', color: 'rgba(255,255,255,0.4)',
        padding: '1.5rem', textAlign: 'center',
        fontSize: '12px', fontFamily: "'DM Sans', sans-serif",
      }}>
        FindMyStay@UiTM — FYP Project · Faculty of Computer and Mathematical Sciences · UiTM
      </footer>
    </div>
  )
}

// ── Root export ───────────────────────────────────────────────────────────────
export default function Home() {
  const user      = Auth.getUser()
  const firstName = user?.full_name?.split(' ')[0] || 'there'

  if (Auth.isLoggedIn() && user) {
    return <ReturningHome user={user} firstName={firstName} />
  }
  return <GuestHome />
}
