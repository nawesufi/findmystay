import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Auth } from '../api'
import { CAMPUSES, DEFAULT_BUDGET_MIN, DEFAULT_BUDGET_MAX } from '../constants'

const API = import.meta.env.VITE_API_URL

export default function Preferences() {
  const navigate = useNavigate()
  const token = Auth.getToken()
  const [form, setForm] = useState({
    preferred_state: '',
    uitm_campus: '',
    preferred_type: 'room',
    preferred_price_min: DEFAULT_BUDGET_MIN,
    preferred_price_max: DEFAULT_BUDGET_MAX,
    preferred_distance: 3.0,
    preferred_facilities: 'wifi',
    preferred_gender: 'any',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await axios.post(`${API}/preferences`, form, {
        headers: { Authorization: `Bearer ${token}` },
      })
      navigate('/recommend')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save preferences')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="bg-white rounded-2xl shadow-md w-full max-w-lg p-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">Your Preferences</h1>
        <p className="text-gray-500 text-sm mb-6">Tell us what you're looking for and we'll find the best match.</p>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Preferred State</label>
              <select
                value={form.preferred_state}
                onChange={e => setForm({ ...form, preferred_state: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Any state</option>
                {STATES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">UiTM Campus</label>
              <select
                value={form.uitm_campus}
                onChange={e => setForm({ ...form, uitm_campus: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select campus</option>
                {CAMPUSES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Property Type</label>
              <select
                value={form.preferred_type}
                onChange={e => setForm({ ...form, preferred_type: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="room">Room</option>
                <option value="unit">Unit</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gender Preference</label>
              <select
                value={form.preferred_gender}
                onChange={e => setForm({ ...form, preferred_gender: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="any">Any</option>
                <option value="male">Male only</option>
                <option value="female">Female only</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Price (RM)</label>
              <input
                type="number" min="0"
                value={form.preferred_price_min}
                onChange={e => setForm({ ...form, preferred_price_min: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Price (RM)</label>
              <input
                type="number" min="0"
                value={form.preferred_price_max}
                onChange={e => setForm({ ...form, preferred_price_max: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Distance from Campus (km): {form.preferred_distance} km
            </label>
            <input
              type="range" min="0.5" max="10" step="0.5"
              value={form.preferred_distance}
              onChange={e => setForm({ ...form, preferred_distance: Number(e.target.value) })}
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0.5 km</span><span>10 km</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Facilities</label>
            <input
              type="text"
              value={form.preferred_facilities}
              onChange={e => setForm({ ...form, preferred_facilities: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="wifi, aircon, parking..."
            />
          </div>

          <button
            type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg text-sm transition disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Find My Recommendations'}
          </button>
        </form>
      </div>
    </div>
  )
}
