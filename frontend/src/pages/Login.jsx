/*
  Login.jsx — Login and registration page
  Two tabs: Sign In and Create Account.
  On success, saves JWT token to localStorage and redirects.
*/

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { login, register, Auth } from '../api'
import { CAMPUSES } from '../constants'

export default function Login() {
  const navigate  = useNavigate()

  // Redirect if already logged in
  if (Auth.isLoggedIn()) {
    navigate(Auth.getUser()?.role === 'houseowner' ? '/landlord' : '/')
    return null
  }

  const [tab,      setTab]      = useState('login')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

  // Login form state
  const [loginEmail,    setLoginEmail]    = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // Register form state
  const [regRole,        setRegRole]        = useState('')
  const [regName,        setRegName]        = useState('')
  const [regEmail,       setRegEmail]       = useState('')
  const [regPassword,    setRegPassword]    = useState('')
  const [regConfirm,     setRegConfirm]     = useState('')
  const [regCampus,      setRegCampus]      = useState('')
  const [regPhone,       setRegPhone]       = useState('')
  const [regCompany,     setRegCompany]     = useState('')
  const [regTouched,     setRegTouched]     = useState({})
  const [submitTried,    setSubmitTried]    = useState(false)

  // ── Validation helpers ────────────────────────────────────────
  const vName = v => {
    if (!v.trim()) return 'Full name is required.'
    if (/\d/.test(v)) return 'Name cannot contain numbers.'
    if (v.trim().length < 2) return 'Name must be at least 2 characters.'
    if (!/^[\p{L}\s'\-.]+$/u.test(v)) return 'Name can only contain letters, spaces, hyphens, or apostrophes.'
    return ''
  }
  const vEmail = v => {
    if (!v.trim()) return 'Email is required.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address.'
    return ''
  }
  const vPassword = v => {
    if (!v) return 'Password is required.'
    if (v.length < 8) return 'At least 8 characters required.'
    if (!/[A-Z]/.test(v)) return 'Include at least one uppercase letter (A–Z).'
    if (!/[a-z]/.test(v)) return 'Include at least one lowercase letter (a–z).'
    if (!/\d/.test(v)) return 'Include at least one number (0–9).'
    return ''
  }
  const vPhone = v => {
    const d = v.replace(/\D/g, '')
    if (!v.trim()) return 'Phone number is required.'
    if (!/^01/.test(d)) return 'Malaysian number must start with 01.'
    if (d.length < 10 || d.length > 11) return 'Enter a valid Malaysian number (10–11 digits).'
    return ''
  }
  const pwStrength = v => {
    if (!v) return 0
    let s = 0
    if (v.length >= 8) s++
    if (/[A-Z]/.test(v)) s++
    if (/[a-z]/.test(v)) s++
    if (/\d/.test(v)) s++
    if (/[^a-zA-Z\d]/.test(v)) s++
    return s
  }
  const showErr = (field, msg) => (submitTried || regTouched[field]) && msg
  const touch   = field => setRegTouched(p => ({ ...p, [field]: true }))

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!loginEmail || !loginPassword) return setError('Please fill in all fields.')
    setLoading(true)
    try {
      const data = await login(loginEmail, loginPassword)
      Auth.setToken(data.token)
      Auth.setUser(data.user)
      navigate(data.user?.role === 'houseowner' ? '/landlord' : '/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister(e) {
    e.preventDefault()
    setError('')
    setSubmitTried(true)
    if (!regRole) return setError('Please select whether you are a student or landlord.')
    if (vName(regName) || vEmail(regEmail) || vPassword(regPassword)) return setError('Please fix the errors above.')
    if (regPassword !== regConfirm) return setError('Passwords do not match.')
    if (regRole === 'student' && !regCampus) return setError('Please select your UiTM campus.')
    if (regRole === 'houseowner' && vPhone(regPhone)) return setError(vPhone(regPhone))
    setLoading(true)
    try {
      const payload = {
        full_name:    regName,
        email:        regEmail,
        password:     regPassword,
        role:         regRole,
        uitm_campus:  regCampus,
        phone_number: regPhone,
        company_name: regCompany,
      }
      await register(payload)
      setLoginEmail(regEmail)
      setTab('login')
      setSuccess('Account created! Please sign in to continue.')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FBF8F2', display: 'flex', flexDirection: 'column' }}>

      {/* Mini nav */}
      <nav style={{
        height: '56px', background: '#311A50',
        display: 'flex', alignItems: 'center',
        padding: '0 2rem', justifyContent: 'space-between',
      }}>
        <Link to="/" style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: '16px', color: '#fff', textDecoration: 'none',
          display: 'flex', alignItems: 'center', gap: '7px',
        }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#C9A96E', display: 'inline-block' }}></span>
          FindMyStay@UiTM
        </Link>
        <Link to="/" className="btn btn-outline-white btn-sm">← Back to home</Link>
      </nav>

      {/* Form area */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
      }}>
        <div style={{ width: '100%', maxWidth: '440px' }}>

          {/* Header */}
          <div className="text-center mb-3">
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '26px', marginBottom: '6px' }}>
              {tab === 'login' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p style={{ color: 'var(--text2)', fontSize: '14px' }}>
              {tab === 'login'
                ? 'Sign in to get your personalised recommendations'
                : 'Find a room or list your property'}
            </p>
          </div>

          <div className="card">
            <div className="card-body">

              {/* Tab switcher */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                background: '#F4EDE0',
                borderRadius: '8px',
                padding: '3px',
                marginBottom: '1.25rem',
                gap: '3px',
              }}>
                {['login', 'register'].map(t => (
                  <button key={t} onClick={() => { setTab(t); setError(''); setSuccess('') }} style={{
                    padding: '8px',
                    borderRadius: '6px',
                    border: 'none',
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    background: tab === t ? '#FFFCF7' : 'transparent',
                    color: tab === t ? '#4D2D78' : '#7A6B5A',
                    boxShadow: tab === t ? '0 1px 3px rgba(45,37,25,0.08)' : 'none',
                    transition: 'all 0.15s',
                  }}>
                    {t === 'login' ? 'Sign in' : 'Create account'}
                  </button>
                ))}
              </div>

              {/* Alerts */}
              {success && <div className="alert alert-success mb-2">{success}</div>}
              {error && <div className="alert alert-error mb-2">{error}</div>}

              {/* Login form */}
              {tab === 'login' && (
                <form onSubmit={handleLogin}>
                  <div className="form-group">
                    <label className="form-label">Email address</label>
                    <input className="form-input" type="email" value={loginEmail}
                      onChange={e => setLoginEmail(e.target.value)}
                      placeholder="name@student.uitm.edu.my" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Password</label>
                    <input className="form-input" type="password" value={loginPassword}
                      onChange={e => setLoginPassword(e.target.value)}
                      placeholder="Your password" />
                  </div>
                  <button type="submit" className="btn btn-primary btn-block"
                    style={{ marginTop: '4px' }} disabled={loading}>
                    {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Signing in...</> : 'Sign in'}
                  </button>
                </form>
              )}

              {/* Register form */}
              {tab === 'register' && (
                <form onSubmit={handleRegister}>

                  {/* Role selection */}
                  <div className="form-group">
                    <label className="form-label" style={{ marginBottom: '8px' }}>I am a...</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      {[
                        { value: 'student',    icon: '🎓', label: 'Student',  desc: 'Looking for a room' },
                        { value: 'houseowner', icon: '🏠', label: 'Landlord', desc: 'Listing my property' },
                      ].map(r => (
                        <button key={r.value} type="button"
                          onClick={() => setRegRole(r.value)}
                          style={{
                            padding: '12px 10px',
                            borderRadius: '10px',
                            border: '2px solid',
                            borderColor: regRole === r.value ? '#4D2D78' : '#E8DDD0',
                            background: regRole === r.value ? '#EDE6F8' : '#FFFCF7',
                            cursor: 'pointer',
                            textAlign: 'center',
                            transition: 'all 0.15s',
                          }}>
                          <div style={{ fontSize: '22px', marginBottom: '4px' }}>{r.icon}</div>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: regRole === r.value ? '#4D2D78' : '#2D2519' }}>
                            {r.label}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '2px' }}>
                            {r.desc}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Common fields */}
                  {regRole && (<>
                    {/* Full name */}
                    <div className="form-group">
                      <label className="form-label">Full name</label>
                      <input className="form-input" type="text" value={regName}
                        onChange={e => setRegName(e.target.value)}
                        onBlur={() => touch('name')}
                        placeholder="Your full name"
                        style={{ borderColor: showErr('name', vName(regName)) ? '#A02D2D' : undefined }} />
                      {showErr('name', vName(regName)) && <p style={{ fontSize: '11px', color: '#A02D2D', marginTop: '4px' }}>{vName(regName)}</p>}
                    </div>

                    {/* Email */}
                    <div className="form-group">
                      <label className="form-label">Email address</label>
                      <input className="form-input" type="email" value={regEmail}
                        onChange={e => setRegEmail(e.target.value)}
                        onBlur={() => touch('email')}
                        placeholder={regRole === 'student' ? 'name@student.uitm.edu.my' : 'your@email.com'}
                        style={{ borderColor: showErr('email', vEmail(regEmail)) ? '#A02D2D' : undefined }} />
                      {showErr('email', vEmail(regEmail)) && <p style={{ fontSize: '11px', color: '#A02D2D', marginTop: '4px' }}>{vEmail(regEmail)}</p>}
                    </div>

                    {/* Student-only fields */}
                    {regRole === 'student' && (
                      <div className="form-group">
                        <label className="form-label">UiTM campus</label>
                        <select className="form-select" value={regCampus}
                          onChange={e => setRegCampus(e.target.value)}>
                          <option value="">Select your campus</option>
                          {CAMPUSES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    )}

                    {/* Landlord-only fields */}
                    {regRole === 'houseowner' && (<>
                      <div className="form-group">
                        <label className="form-label">Phone number</label>
                        <input className="form-input" type="tel" value={regPhone}
                          onChange={e => setRegPhone(e.target.value)}
                          onBlur={() => touch('phone')}
                          placeholder="e.g. 011-23456789"
                          style={{ borderColor: showErr('phone', vPhone(regPhone)) ? '#A02D2D' : undefined }} />
                        {showErr('phone', vPhone(regPhone)) && <p style={{ fontSize: '11px', color: '#A02D2D', marginTop: '4px' }}>{vPhone(regPhone)}</p>}
                      </div>
                      <div className="form-group">
                        <label className="form-label">Company / agency name <span style={{ color: 'var(--text2)', fontWeight: 400 }}>(optional)</span></label>
                        <input className="form-input" type="text" value={regCompany}
                          onChange={e => setRegCompany(e.target.value)}
                          placeholder="e.g. Seremban Properties Sdn Bhd" />
                      </div>
                    </>)}

                    {/* Password */}
                    <div className="form-group">
                      <label className="form-label">Password</label>
                      <input className="form-input" type="password" value={regPassword}
                        onChange={e => setRegPassword(e.target.value)}
                        onBlur={() => touch('password')}
                        placeholder="Create a password"
                        style={{ borderColor: showErr('password', vPassword(regPassword)) ? '#A02D2D' : undefined }} />
                      {/* Strength bar */}
                      {regPassword && (() => {
                        const s = pwStrength(regPassword)
                        const bars = [
                          { min: 1, color: '#A02D2D' },
                          { min: 2, color: '#C9601A' },
                          { min: 3, color: '#C9A96E' },
                          { min: 4, color: '#2e7d32' },
                          { min: 5, color: '#1A5E4A' },
                        ]
                        const active = bars.find(b => s >= b.min) || bars[0]
                        const labels = ['', 'Very weak', 'Weak', 'Fair', 'Strong', 'Very strong']
                        return (
                          <div style={{ marginTop: '6px' }}>
                            <div style={{ display: 'flex', gap: '3px', marginBottom: '3px' }}>
                              {[1,2,3,4,5].map(n => (
                                <div key={n} style={{ flex: 1, height: '3px', borderRadius: '2px', background: s >= n ? active.color : '#E8DDD0', transition: 'background 0.2s' }} />
                              ))}
                            </div>
                            <p style={{ fontSize: '11px', color: active.color, margin: 0 }}>{labels[s]}</p>
                          </div>
                        )
                      })()}
                      {showErr('password', vPassword(regPassword)) && <p style={{ fontSize: '11px', color: '#A02D2D', marginTop: '4px' }}>{vPassword(regPassword)}</p>}
                      {/* Requirements checklist */}
                      {(regTouched.password || submitTried) && (
                        <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          {[
                            { ok: regPassword.length >= 8,    text: 'At least 8 characters' },
                            { ok: /[A-Z]/.test(regPassword),  text: 'One uppercase letter' },
                            { ok: /[a-z]/.test(regPassword),  text: 'One lowercase letter' },
                            { ok: /\d/.test(regPassword),     text: 'One number' },
                          ].map(r => (
                            <p key={r.text} style={{ fontSize: '11px', margin: 0, color: r.ok ? '#1A5E4A' : 'var(--text3)' }}>
                              {r.ok ? '✓' : '○'} {r.text}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Confirm password */}
                    <div className="form-group">
                      <label className="form-label">Confirm password</label>
                      <input className="form-input" type="password" value={regConfirm}
                        onChange={e => setRegConfirm(e.target.value)}
                        onBlur={() => touch('confirm')}
                        placeholder="Re-enter your password"
                        style={{ borderColor: regConfirm && regPassword !== regConfirm ? '#A02D2D' : undefined }} />
                      {regConfirm && regPassword !== regConfirm && (
                        <p style={{ fontSize: '11px', color: '#A02D2D', marginTop: '4px' }}>Passwords do not match</p>
                      )}
                    </div>

                    <button type="submit" className="btn btn-primary btn-block"
                      style={{ marginTop: '4px' }} disabled={loading}>
                      {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Creating account...</> : 'Create account'}
                    </button>
                  </>)}
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}