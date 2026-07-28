import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

// ── Auth helpers ──────────────────────────────────────────────
export const Auth = {
  getToken:   () => localStorage.getItem('findmystay_token'),
  setToken:   (t) => localStorage.setItem('findmystay_token', t),
  getUser:    () => { try { return JSON.parse(localStorage.getItem('findmystay_user')) } catch { return null } },
  setUser:    (u) => localStorage.setItem('findmystay_user', JSON.stringify(u)),
  isLoggedIn: () => !!localStorage.getItem('findmystay_token'),
  logout:     () => { localStorage.removeItem('findmystay_token'); localStorage.removeItem('findmystay_user') },
}

function authHeaders() {
  return { Authorization: `Bearer ${Auth.getToken()}` }
}

async function request(method, path, data = null, params = null) {
  try {
    const res = await axios({ method, url: `${BASE}${path}`, data, params, headers: authHeaders() })
    return res.data
  } catch (err) {
    if (err.response?.status === 401 && window.location.pathname !== '/login') {
      Auth.logout()
      window.location.href = '/login'
    }
    const msg = err.response?.data?.error || err.message || 'Request failed'
    throw new Error(msg)
  }
}

// ── Auth endpoints ────────────────────────────────────────────
export const login    = (email, password) =>
  request('post', '/auth/login', { email, password })

export const register = (userData) =>
  request('post', '/auth/register', userData)

export const getMe = () =>
  request('get', '/auth/me')

export const updateProfile = (data) =>
  request('put', '/auth/me', data)

// ── Properties ────────────────────────────────────────────────
export const getProperties = (filters = {}) =>
  request('get', '/properties', null, filters)

export const getProperty = (id) =>
  request('get', `/properties/${id}`)

export const getMyProperties = () =>
  request('get', '/properties/mine')

export const addProperty = (data) =>
  request('post', '/properties', data)

export const updateProperty = (id, data) =>
  request('put', `/properties/${id}`, data)

export const deleteProperty = (id) =>
  request('delete', `/properties/${id}`)

// ── Preferences ───────────────────────────────────────────────
export const savePreferences = (prefs) =>
  request('post', '/preferences', prefs)

export const getPreferences = () =>
  request('get', '/preferences')

// ── Recommendations ───────────────────────────────────────────
export const getRecommendations = (top_n = 10) =>
  request('get', '/recommend', null, { top_n })

export const getStats = () =>
  request('get', '/stats')

// ── Interactions ──────────────────────────────────────────────
export const logInteraction = (property_id, interaction_type, rating = null) =>
  request('post', '/interactions', { property_id, interaction_type, rating })

// ── Interactions ──────────────────────────────────────────────
export const getInteractions = () =>
  request('get', '/interactions')

// ── Feedback ──────────────────────────────────────────────────
export const submitFeedback = (property_id, satisfaction_level, comment = '') =>
  request('post', '/feedback', { property_id, satisfaction_level, comment })

export const getMyFeedback = () =>
  request('get', '/feedback/mine')

export const getPropertyFeedback = (property_id) =>
  request('get', `/feedback/${property_id}`)

// ── Enquiries ─────────────────────────────────────────────────
export const submitEnquiry = (property_id, message) =>
  request('post', '/enquiries', { property_id, message })

export const getLandlordEnquiries = () =>
  request('get', '/enquiries/mine')

export const markEnquiryRead = (id) =>
  request('patch', `/enquiries/${id}/read`)

export const replyToEnquiry = (id, reply) =>
  request('post', `/enquiries/${id}/reply`, { reply })

export const getStudentEnquiries = () =>
  request('get', '/enquiries/my-enquiries')

export const getNotifications = () =>
  request('get', '/notifications')

export const markNotificationRead = (id) =>
  request('patch', `/notifications/${id}/read`)

export const markAllNotificationsRead = () =>
  request('patch', '/notifications/read-all')

// ── Display helpers ───────────────────────────────────────────
export const formatPrice = (price) =>
  price ? `RM ${Number(price).toLocaleString()}` : 'N/A'

export const getSentimentClass = (score) => {
  if (score > 0.2)  return 'positive'
  if (score < -0.2) return 'negative'
  return 'neutral'
}

export const getSentimentWidth = (score) =>
  `${Math.round(((score + 1) / 2) * 100)}%`

// ── Property image helpers ────────────────────────────────────
// Rooms — interior bedroom/room shots mixed with terrace house exteriors
const _ROOM_IMGS = [
  'https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?w=400&h=250&fit=crop',
  'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?w=400&h=250&fit=crop',
  'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=400&h=250&fit=crop',
  'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=400&h=250&fit=crop',
  'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=400&h=250&fit=crop',
  'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&h=250&fit=crop',
  // house exteriors
  'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400&h=250&fit=crop',
  'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=400&h=250&fit=crop',
  'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=400&h=250&fit=crop',
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&h=250&fit=crop',
]
// Units/apartments — interior living spaces mixed with apartment building exteriors
const _UNIT_IMGS = [
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400&h=250&fit=crop',
  'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400&h=250&fit=crop',
  'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=400&h=250&fit=crop',
  'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=400&h=250&fit=crop',
  'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=400&h=250&fit=crop',
  'https://images.unsplash.com/photo-1507089947368-19c1da9775ae?w=400&h=250&fit=crop',
  // apartment/condo exteriors
  'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=400&h=250&fit=crop',
  'https://images.unsplash.com/photo-1460317442991-0ec209397118?w=400&h=250&fit=crop',
  'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=400&h=250&fit=crop',
  'https://images.unsplash.com/photo-1574362848149-11496d93a7c7?w=400&h=250&fit=crop',
]

export const propertyImg = (prop) => {
  if (prop?.image_url) return prop.image_url
  const pool = prop?.property_type === 'unit' ? _UNIT_IMGS : _ROOM_IMGS
  return pool[((prop?.id || 0)) % pool.length]
}
