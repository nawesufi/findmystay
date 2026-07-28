import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL

export default function Properties() {
  const navigate = useNavigate()
  const token = localStorage.getItem('token')
  const [properties, setProperties] = useState([])
  const [loading, setLoading]       = useState(true)
  const [filters, setFilters]       = useState({ state: '', type: '', max_price: '' })

  const fetchProperties = async () => {
    setLoading(true)
    try {
      const params = {}
      if (filters.state)     params.state     = filters.state
      if (filters.type)      params.type      = filters.type
      if (filters.max_price) params.max_price = filters.max_price
      const res = await axios.get(`${API}/properties`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      })
      setProperties(res.data)
    } catch {
      setProperties([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchProperties() }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
        <span className="font-bold text-blue-600 text-lg">FindMyStay@UiTM</span>
        <div className="flex gap-4 text-sm">
          <Link to="/recommend" className="text-gray-600 hover:text-blue-600">Recommendations</Link>
          <Link to="/preferences" className="text-gray-600 hover:text-blue-600">Preferences</Link>
          <button onClick={() => { localStorage.clear(); navigate('/login') }}
            className="text-red-500 hover:underline">Logout</button>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Browse All Properties</h1>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex gap-3 flex-wrap">
          <input
            type="text" placeholder="State (e.g. Johor)"
            value={filters.state}
            onChange={e => setFilters({ ...filters, state: e.target.value })}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 min-w-[140px]"
          />
          <select
            value={filters.type}
            onChange={e => setFilters({ ...filters, type: e.target.value })}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All types</option>
            <option value="single">Single Room</option>
            <option value="master">Master Room</option>
            <option value="shared">Shared Room</option>
            <option value="studio">Studio</option>
          </select>
          <input
            type="number" placeholder="Max price (RM)"
            value={filters.max_price}
            onChange={e => setFilters({ ...filters, max_price: e.target.value })}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-36"
          />
          <button
            onClick={fetchProperties}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition"
          >
            Search
          </button>
        </div>

        {loading && <div className="text-center py-20 text-gray-400">Loading...</div>}

        {!loading && properties.length === 0 && (
          <div className="text-center py-20 text-gray-400">No properties found.</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {properties.map(p => (
            <Link
              key={p.id}
              to={`/properties/${p.id}`}
              className="bg-white rounded-2xl shadow-sm hover:shadow-md transition p-5 border border-gray-100 block"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 pr-3">
                  <p className="text-xs text-gray-400 capitalize mb-1">{p.property_type} · {p.source}</p>
                  <h2 className="font-semibold text-gray-800 text-sm leading-snug mb-1 line-clamp-2">
                    {p.title}
                  </h2>
                  <p className="text-gray-500 text-xs">{p.area}, {p.state}</p>
                  {p.furnished && (
                    <span className="inline-block mt-2 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {p.furnished}
                    </span>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-blue-600">RM {p.rental_price?.toLocaleString()}</p>
                  <p className="text-xs text-gray-400">/month</p>
                  {p.distance_to_campus && (
                    <p className="text-xs text-gray-500 mt-1">{p.distance_to_campus} km</p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
