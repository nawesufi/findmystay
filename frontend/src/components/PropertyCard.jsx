/*
  PropertyCard.jsx — Reusable property listing card
  Used in both Listings page and Recommendations page.

  Props:
    property  — property data object from the API
    onView    — callback when View Details is clicked
    onSave    — callback when Save is clicked
    badge     — optional badge text (e.g. "Top rated", "New")
    badgeType — 'purple' | 'green' | 'gold'
*/

import { formatPrice, getSentimentClass, getSentimentWidth, propertyImg } from '../api'

const s = {
  card: {
    background: '#FFFCF7',
    border: '1px solid #E8DDD0',
    borderRadius: '12px',
    overflow: 'hidden',
    transition: 'transform 0.2s, box-shadow 0.2s',
    cursor: 'pointer',
  },
  img: {
    height: '150px',
    background: '#F5EDD8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    fontSize: '40px',
  },
  badgePurple: {
    position: 'absolute', top: '10px', right: '10px',
    background: '#4D2D78', color: '#fff',
    fontSize: '10px', fontWeight: '600',
    padding: '3px 9px', borderRadius: '20px',
    fontFamily: "'DM Sans', sans-serif",
  },
  badgeGreen: {
    position: 'absolute', top: '10px', right: '10px',
    background: '#2D8B6F', color: '#fff',
    fontSize: '10px', fontWeight: '600',
    padding: '3px 9px', borderRadius: '20px',
    fontFamily: "'DM Sans', sans-serif",
  },
  badgeGold: {
    position: 'absolute', top: '10px', right: '10px',
    background: '#C9A96E', color: '#2D2519',
    fontSize: '10px', fontWeight: '600',
    padding: '3px 9px', borderRadius: '20px',
    fontFamily: "'DM Sans', sans-serif",
  },
  body: { padding: '1rem' },
  price: {
    fontFamily: "'Playfair Display', serif",
    fontSize: '20px',
    fontWeight: '600',
    color: '#4D2D78',
    marginBottom: '4px',
  },
  priceSub: {
    fontSize: '12px',
    fontWeight: '400',
    color: '#B0A090',
    fontFamily: "'DM Sans', sans-serif",
  },
  title: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#2D2519',
    marginBottom: '8px',
    lineHeight: 1.45,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  pills: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '5px',
    marginBottom: '7px',
  },
  pill: {
    fontSize: '10px',
    padding: '2px 8px',
    borderRadius: '20px',
    border: '1px solid #E8DDD0',
    color: '#7A6B5A',
    background: '#FBF8F2',
    fontFamily: "'DM Sans', sans-serif",
  },
  pillGreen: {
    fontSize: '10px',
    padding: '2px 8px',
    borderRadius: '20px',
    border: '1px solid #8CD4BE',
    color: '#1A5E4A',
    background: '#D4EDE6',
    fontFamily: "'DM Sans', sans-serif",
  },
  dist: {
    fontSize: '11px',
    color: '#2D8B6F',
    fontWeight: '500',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontFamily: "'DM Sans', sans-serif",
  },
  sbarWrap: {
    height: '3px',
    borderRadius: '2px',
    background: '#E8DDD0',
    marginBottom: '10px',
    overflow: 'hidden',
  },
  btns: { display: 'flex', gap: '7px' },
}

function rentalUnit(type) {
  if (!type) return 'per unit'
  const t = type.toLowerCase()
  if (t === 'single' || t === 'master' || t === 'shared') return 'per room'
  return 'per unit'
}

export default function PropertyCard({ property: p, onView, onSave, isSaved, badge, badgeType }) {
  const sentClass = getSentimentClass(p.sentiment_score || 0)
  const sentWidth = getSentimentWidth(p.sentiment_score || 0)

  const badgeStyle = badgeType === 'green' ? s.badgeGreen
    : badgeType === 'gold' ? s.badgeGold
    : s.badgePurple

  return (
    <div
      style={s.card}
      onMouseEnter={e => {
        e.currentTarget.style.transform    = 'translateY(-2px)'
        e.currentTarget.style.boxShadow    = '0 8px 24px rgba(45,37,25,0.12)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform    = ''
        e.currentTarget.style.boxShadow    = ''
      }}
    >
      {/* Image */}
      <div style={{ ...s.img, padding: 0 }}>
        <img
          src={propertyImg(p)}
          alt={p.area || p.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={e => { e.target.src = propertyImg({ ...p, image_url: null }) }}
        />
        {badge && <span style={badgeStyle}>{badge}</span>}
      </div>

      <div style={s.body}>
        {/* Price */}
        <div style={s.price}>
          {formatPrice(p.rental_price)}
          <span style={s.priceSub}> / month</span>
        </div>
        <div style={{ fontSize: '11px', color: '#7A6B5A', marginBottom: '6px', marginTop: '-4px' }}>
          {rentalUnit(p.property_type)}
        </div>

        {/* Title */}
        <div style={s.title}>{p.area || p.title}</div>

        {/* Pills */}
        <div style={s.pills}>
          {p.state     && <span style={s.pill}>📍 {p.state}</span>}
          {p.property_type && p.property_type !== 'Not specified' &&
            <span style={s.pill}>🏠 {p.property_type}</span>}
          {p.furnished && p.furnished !== 'Not specified' &&
            <span style={s.pillGreen}>{p.furnished}</span>}
        </div>

        {/* Distance */}
        {p.distance_to_campus && (
          <div style={s.dist}>
            📏 {p.distance_to_campus} km from {p.nearest_campus || 'campus'}
          </div>
        )}

        {/* Sentiment bar */}
        <div style={s.sbarWrap}>
          <div
            className={`sentiment-fill ${sentClass}`}
            style={{ width: `${sentWidth}%` }}
          />
        </div>

        {/* Action buttons */}
        <div style={s.btns}>
          <button
            className="btn btn-primary btn-sm"
            style={{ flex: 1 }}
            onClick={() => onView?.(p)}
          >
            View details
          </button>
          <button
            className={`btn btn-sm ${isSaved ? 'btn-gold' : 'btn-ghost'}`}
            onClick={() => onSave?.(p)}
          >
            {isSaved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}