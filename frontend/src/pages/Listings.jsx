/*
  Listings.jsx — Browse all listings with filters
  Public page — visible without login.
  Filter by state, price range, room type, furnished status.
*/

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import PropertyCard from '../components/PropertyCard'
import MapView from '../components/MapView'
import { getProperties, logInteraction, Auth } from '../api'

const FILTER_CHIPS = ['All states', 'Negeri Sembilan', 'Melaka', 'Johor']

export default function Listings() {
  const navigate = useNavigate()

  const [listings,   setListings]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [search,      setSearch]      = useState('')
  const [stateFilter, setStateFilter] = useState('')
  const [minPrice,   setMinPrice]   = useState(150)
  const [maxPrice,   setMaxPrice]   = useState(1500)
  const [roomType,   setRoomType]   = useState('')
  const [furnished,  setFurnished]  = useState('')
  const [sortBy,     setSortBy]     = useState('default')
  const [saved,      setSaved]      = useState({})
  const [viewMode,   setViewMode]   = useState('list')

  // Load listings when filters change
  useEffect(() => {
    load()
  }, [])

  async function load(params = {}) {
    setLoading(true)
    setError('')
    try {
      const data = await getProperties(params)
      setListings(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function applyFilters() {
    const params = {}
    if (search)      params.search    = search
    if (stateFilter) params.state     = stateFilter
    if (minPrice)    params.min_price = minPrice
    if (maxPrice)    params.max_price = maxPrice
    if (roomType)    params.type      = roomType
    if (furnished)   params.furnished = furnished
    load(params)
  }

  function clearFilters() {
    setSearch('')
    setStateFilter('')
    setMinPrice(150)
    setMaxPrice(1500)
    setRoomType('')
    setFurnished('')
    load()
  }

  function sortedListings() {
    const copy = [...listings]
    if (sortBy === 'price_asc')  return copy.sort((a, b) => a.rental_price - b.rental_price)
    if (sortBy === 'price_desc') return copy.sort((a, b) => b.rental_price - a.rental_price)
    if (sortBy === 'distance')   return copy.sort((a, b) => (a.distance_to_campus || 99) - (b.distance_to_campus || 99))
    return copy
  }

  function handleView(prop) {
    navigate(`/property/${prop.id}`)
  }

  async function handleSave(prop) {
    if (!Auth.isLoggedIn()) return navigate('/login')
    try {
      await logInteraction(prop.id, 'save')
      setSaved(prev => ({ ...prev, [prop.id]: true }))
    } catch (err) {}
  }

  return (
    <div>
      <Navbar />

      {/* Page header */}
      <div style={{
        background: '#311A50',
        padding: '1.75rem 0',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div className="container">
          <h1 style={{ color: '#fff', fontSize: '24px', marginBottom: '4px' }}>
            Rental listings
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', marginBottom: '1rem' }}>
            Browse all available rooms near UiTM campuses
          </p>
          {/* Search bar */}
          <form onSubmit={e => { e.preventDefault(); applyFilters() }}
            style={{ display: 'flex', gap: '8px', maxWidth: '520px' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by area, facilities, description..."
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '13px',
                fontFamily: "'DM Sans', sans-serif",
                background: 'rgba(255,255,255,0.12)',
                color: '#fff',
                outline: 'none',
              }}
            />
            <button type="submit" className="btn btn-gold btn-sm" style={{ flexShrink: 0 }}>
              Search
            </button>
            {search && (
              <button type="button"
                onClick={() => { setSearch(''); applyFilters() }}
                style={{
                  background: 'rgba(255,255,255,0.1)', border: 'none',
                  color: 'rgba(255,255,255,0.7)', borderRadius: '8px',
                  padding: '0 12px', cursor: 'pointer', fontSize: '13px',
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                ×
              </button>
            )}
          </form>
        </div>
      </div>

      <hr className="gold-divider" />

      <div className="container" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '1.5rem' }}>

          {/* ── Sidebar filters ──────────────────────────────── */}
          <aside>
            <div className="card" style={{ position: 'sticky', top: '76px' }}>
              <div className="card-header" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                Filters
                <button onClick={clearFilters} style={{
                  fontSize: '12px', color: 'var(--primary)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  Clear all
                </button>
              </div>
              <div className="card-body">

                {/* State */}
                <div className="form-group">
                  <label className="form-label">State</label>
                  <select className="form-select" value={stateFilter}
                    onChange={e => setStateFilter(e.target.value)}>
                    <option value="">All states</option>
                    <option>Negeri Sembilan</option>
                    <option>Melaka</option>
                    <option>Johor</option>
                  </select>
                </div>

                {/* Price */}
                <div className="form-group">
                  <label className="form-label">Price range (RM/month)</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px', color: 'var(--text2)' }}>
                    <input className="form-input" type="number"
                      value={minPrice} onChange={e => setMinPrice(e.target.value)}
                      style={{ flex: 1 }} />
                    <span>—</span>
                    <input className="form-input" type="number"
                      value={maxPrice} onChange={e => setMaxPrice(e.target.value)}
                      style={{ flex: 1 }} />
                  </div>
                </div>

                {/* Property type */}
                <div className="form-group">
                  <label className="form-label">Property type</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {['Room', 'Unit'].map(t => (
                      <button key={t} onClick={() => setRoomType(roomType === t.toLowerCase() ? '' : t.toLowerCase())}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '20px',
                          fontSize: '11px',
                          fontWeight: '500',
                          cursor: 'pointer',
                          border: '1px solid',
                          fontFamily: "'DM Sans', sans-serif",
                          background: roomType === t.toLowerCase() ? '#4D2D78' : '#FBF8F2',
                          borderColor: roomType === t.toLowerCase() ? '#4D2D78' : '#E8DDD0',
                          color: roomType === t.toLowerCase() ? '#fff' : '#7A6B5A',
                        }}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Furnished */}
                <div className="form-group">
                  <label className="form-label">Furnished</label>
                  <select className="form-select" value={furnished}
                    onChange={e => setFurnished(e.target.value)}>
                    <option value="">Any</option>
                    <option value="fully furnished">Fully furnished</option>
                    <option value="partially furnished">Partially furnished</option>
                    <option value="unfurnished">Unfurnished</option>
                  </select>
                </div>

                <button className="btn btn-primary btn-block" onClick={applyFilters}>
                  Apply filters
                </button>
              </div>
            </div>
          </aside>

          {/* ── Main listings area ───────────────────────────── */}
          <main>
            {/* AI banner */}
            {Auth.isLoggedIn() && (
              <div style={{
                background: '#EDE6F8',
                border: '1px solid #C4A8E8',
                borderRadius: '10px',
                padding: '0.875rem 1rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
              }}>
                <p style={{ fontSize: '13px', color: '#4D2D78', margin: 0 }}>
                  ✨ Get AI-powered recommendations tailored to your preferences
                </p>
                <button className="btn btn-primary btn-sm"
                  onClick={() => navigate('/recommendations')}>
                  Get recommendations
                </button>
              </div>
            )}

            {/* Results bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1rem',
              gap: '8px',
              flexWrap: 'wrap',
            }}>
              <p style={{ fontSize: '14px', color: 'var(--text2)', margin: 0 }}>
                <strong style={{ color: 'var(--text)' }}>{listings.length}</strong> listings found
              </p>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {/* List / Map toggle */}
                <div style={{ display: 'flex', border: '1px solid #E8DDD0', borderRadius: '8px', overflow: 'hidden' }}>
                  {[['list', '☰ List'], ['map', '🗺 Map']].map(([mode, label]) => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      style={{
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontFamily: "'DM Sans', sans-serif",
                        border: 'none',
                        cursor: 'pointer',
                        background: viewMode === mode ? '#4D2D78' : '#FFFCF7',
                        color: viewMode === mode ? '#fff' : 'var(--text2)',
                        fontWeight: viewMode === mode ? '600' : '400',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <select className="form-select" style={{ width: 'auto' }}
                  value={sortBy} onChange={e => setSortBy(e.target.value)}>
                  <option value="default">Sort: Relevance</option>
                  <option value="price_asc">Price: Low to high</option>
                  <option value="price_desc">Price: High to low</option>
                  <option value="distance">Nearest campus</option>
                </select>
              </div>
            </div>

            {/* Error */}
            {error && <div className="alert alert-error">{error}</div>}

            {/* Loading */}
            {loading && (
              <div style={{ textAlign: 'center', padding: '3rem' }}>
                <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 1rem' }} />
                <p style={{ color: 'var(--text2)' }}>Loading listings...</p>
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && listings.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">🔍</div>
                <h3>No listings found</h3>
                <p>Try adjusting your filters</p>
              </div>
            )}

            {/* Listings grid / Map */}
            {!loading && listings.length > 0 && (
              viewMode === 'map' ? (
                <MapView
                  properties={sortedListings()}
                  onView={p => handleView(p)}
                  height={560}
                />
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                  gap: '1rem',
                }}>
                  {sortedListings().map((p, i) => (
                    <PropertyCard
                      key={p.id}
                      property={p}
                      onView={handleView}
                      onSave={handleSave}
                      isSaved={!!saved[p.id]}
                      badge={i === 0 ? 'Top rated' : p.adjusted_rating >= 4 ? 'Highly rated' : null}
                      badgeType={i === 0 ? 'purple' : 'gold'}
                    />
                  ))}
                </div>
              )
            )}
          </main>
        </div>
      </div>
    </div>
  )
}