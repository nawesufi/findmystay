/*
  Navbar.jsx — Shared navigation bar
  Shows different links based on whether the user is logged in.
  Active link is highlighted based on current URL path.
*/

import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Auth, getNotifications, markAllNotificationsRead } from '../api'

const styles = {
  nav: {
    background: '#311A50',
    height: '60px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 2rem',
    gap: '2rem',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  logo: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '17px',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    textDecoration: 'none',
    flexShrink: 0,
  },
  logoDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: '#C9A96E',
    flexShrink: 0,
  },
  links: {
    display: 'flex',
    gap: '1.5rem',
    flex: 1,
  },
  link: {
    fontSize: '13px',
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
    textDecoration: 'none',
    transition: 'color 0.15s',
    fontFamily: "'DM Sans', sans-serif",
  },
  linkActive: {
    color: '#fff',
  },
  right: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  btnGhost: {
    padding: '6px 14px',
    borderRadius: '7px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.3)',
    color: 'rgba(255,255,255,0.85)',
    background: 'transparent',
    fontFamily: "'DM Sans', sans-serif",
    textDecoration: 'none',
  },
  btnGold: {
    padding: '6px 14px',
    borderRadius: '7px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    border: 'none',
    background: '#C9A96E',
    color: '#2D2519',
    fontFamily: "'DM Sans', sans-serif",
    textDecoration: 'none',
  },
  userChip: {
    fontSize: '12px',
    color: 'rgba(255,255,255,0.7)',
    fontFamily: "'DM Sans', sans-serif",
  }
}

function LoginPromptModal({ label, onClose, onLogin }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#FFFCF7',
          borderRadius: '16px',
          padding: '2rem',
          width: '100%',
          maxWidth: '360px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '36px', marginBottom: '12px' }}>🔒</div>
        <h2 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: '20px', color: '#311A50',
          marginBottom: '8px',
        }}>
          Login required
        </h2>
        <p style={{ fontSize: '13px', color: '#6B6B6B', marginBottom: '1.5rem', lineHeight: 1.6 }}>
          You need to be logged in to access <strong>{label}</strong>.
          Create a free account or sign in to continue.
        </p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '10px', borderRadius: '8px',
              border: '1px solid #E8DDD0', background: '#FFFCF7',
              color: '#6B6B6B', fontSize: '13px', fontWeight: '500',
              cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onLogin}
            style={{
              flex: 2, padding: '10px', borderRadius: '8px',
              border: 'none', background: '#4D2D78',
              color: '#fff', fontSize: '13px', fontWeight: '600',
              cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Log in / Register
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Navbar() {
  const location = useLocation()
  const navigate  = useNavigate()
  const user      = Auth.getUser()
  const path      = location.pathname
  const [modal,        setModal]        = useState(null)
  const [notifs,       setNotifs]       = useState([])
  const [bellOpen,     setBellOpen]     = useState(false)

  const isLandlord = user?.role === 'houseowner'
  const unread     = notifs.filter(n => !n.is_read).length

  useEffect(() => {
    if (!user) return
    const load = () => getNotifications().then(setNotifs).catch(() => {})
    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [!!user])

  async function handleMarkAll() {
    await markAllNotificationsRead().catch(() => {})
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  const linkStyle = (href) => ({
    ...styles.link,
    ...(path === href ? styles.linkActive : {})
  })

  function guardedNav(href, label) {
    if (Auth.isLoggedIn()) {
      navigate(href)
    } else {
      setModal(label)
    }
  }

  return (
    <>
    <nav style={styles.nav}>
      {/* Logo */}
      <Link to="/" style={styles.logo}>
        <span style={styles.logoDot}></span>
        FindMyStay@UiTM
      </Link>

      {/* Navigation links */}
      <div style={styles.links}>
        <Link to="/listings" style={linkStyle('/listings')}>Listings</Link>
        {user?.role !== 'houseowner' && (
          <span
            onClick={() => guardedNav('/recommendations', 'Recommendations')}
            style={{ ...linkStyle('/recommendations'), cursor: 'pointer' }}
          >
            Recommendations
          </span>
        )}
        {user?.role === 'houseowner' && (
          <Link to="/landlord" style={linkStyle('/landlord')}>My listings</Link>
        )}
      </div>

      {/* Right side — auth buttons or user info */}
      <div style={styles.right}>
        {user ? (
          <>
            {/* Name + bell grouped together */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={styles.userChip}>{user.full_name?.split(' ')[0]}</span>

              {/* Bell — shown for ALL logged-in users */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setBellOpen(o => !o)}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'rgba(255,255,255,0.75)', fontSize: '16px', padding: '2px 4px',
                    position: 'relative', lineHeight: 1,
                  }}
                  title="Notifications"
                >
                  🔔
                  {unread > 0 && (
                    <span style={{
                      position: 'absolute', top: 0, right: 0,
                      background: '#E53935', color: '#fff',
                      fontSize: '9px', fontWeight: '700',
                      borderRadius: '50%', width: '14px', height: '14px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </button>

                {bellOpen && (
                  <div style={{
                    position: 'absolute', right: 0, top: '110%',
                    width: '320px', background: '#fff',
                    border: '1px solid #E8DDD0', borderRadius: '12px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    zIndex: 200, overflow: 'hidden',
                  }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '12px 16px', borderBottom: '1px solid #E8DDD0',
                    }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#311A50' }}>
                        Notifications {unread > 0 && `(${unread} new)`}
                      </span>
                      {unread > 0 && (
                        <button onClick={handleMarkAll} style={{
                          fontSize: '11px', color: '#4D2D78', background: 'none',
                          border: 'none', cursor: 'pointer', fontWeight: '600',
                        }}>
                          Mark all read
                        </button>
                      )}
                    </div>

                    <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                      {notifs.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#999', fontSize: '13px' }}>
                          No notifications yet
                        </div>
                      ) : notifs.map(n => (
                        <div key={n.id} style={{
                          padding: '10px 16px',
                          background: n.is_read ? '#fff' : '#F3EEF9',
                          borderBottom: '1px solid #F0EBE3',
                          display: 'flex', gap: '10px', alignItems: 'flex-start',
                        }}>
                          <span style={{ fontSize: '16px', flexShrink: 0 }}>
                            {n.type === 'enquiry' ? '✉️' : n.type === 'save' ? '🔖' : n.type === 'reply' ? '💬' : '⭐'}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '12px', color: '#311A50', lineHeight: 1.4 }}>
                              {n.message}
                            </div>
                            <div style={{ fontSize: '10px', color: '#999', marginTop: '3px' }}>
                              {new Date(n.created_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                          {!n.is_read && (
                            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#4D2D78', flexShrink: 0, marginTop: '4px' }} />
                          )}
                        </div>
                      ))}
                    </div>

                    <div style={{ padding: '10px 16px', borderTop: '1px solid #E8DDD0', textAlign: 'center' }}>
                      <button
                        onClick={() => { setBellOpen(false); navigate(isLandlord ? '/landlord' : '/profile') }}
                        style={{ fontSize: '12px', color: '#4D2D78', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}
                      >
                        {isLandlord ? 'View all in dashboard →' : 'View all in profile →'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {user.role !== 'houseowner' && (
              <Link to="/profile" style={styles.btnGhost}>Profile</Link>
            )}
            {user.role === 'houseowner' && (
              <Link to="/landlord" style={styles.btnGhost}>Dashboard</Link>
            )}
            <button style={styles.btnGhost} onClick={() => { Auth.logout(); window.location.href = '/' }}>Logout</button>
          </>
        ) : (
          <>
            <Link to="/login" style={styles.btnGhost}>Log in</Link>
            <Link to="/login" style={styles.btnGold}>Get started</Link>
          </>
        )}
      </div>
    </nav>

    {modal && (
      <LoginPromptModal
        label={modal}
        onClose={() => setModal(null)}
        onLogin={() => { setModal(null); navigate('/login') }}
      />
    )}
  </>
  )
}