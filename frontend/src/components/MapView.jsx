/*
  MapView.jsx — Google Maps component with property pins and UiTM campus markers.

  Props:
    properties  — array of property objects (need latitude/longitude)
    onView      — callback(property) when "View details" clicked in popup
    height      — map height in px (default 480)
    singlePin   — if true: one property + campus markers + road routes (detail page)
    userCampus  — user's preferred campus name string (for preferred campus route)
*/

import { useState, useEffect } from 'react'
import {
  GoogleMap, Marker, InfoWindow, DirectionsRenderer, useJsApiLoader,
} from '@react-google-maps/api'
import { formatPrice } from '../api'
import { CAMPUSES, findNearestCampus } from '../campuses'

const MALAYSIA_CENTER = { lat: 3.8, lng: 109.0 }

export default function MapView({
  properties = [],
  onView,
  height = 480,
  singlePin = false,
  userCampus = '',
}) {
  const [activeProp,     setActiveProp]     = useState(null)
  const [activeCampus,   setActiveCampus]   = useState(null)
  const [nearestRoute,   setNearestRoute]   = useState(null)
  const [preferredRoute, setPreferredRoute] = useState(null)
  const [nearestDist,    setNearestDist]    = useState(null)   // e.g. "8.2 km"
  const [preferredDist,  setPreferredDist]  = useState(null)   // e.g. "12.4 km"

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
  })

  const withCoords = properties.filter(p => p.latitude && p.longitude)
  const prop = withCoords[0] || null

  const center = prop
    ? { lat: Number(prop.latitude), lng: Number(prop.longitude) }
    : MALAYSIA_CENTER
  const zoom = prop ? (singlePin ? 13 : 11) : 6

  // Campus icon (built after Maps API loads)
  const campusIcon = isLoaded && window.google ? {
    url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
    scaledSize: new window.google.maps.Size(32, 32),
  } : 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png'

  // Preferred campus (from userCampus prop)
  const preferredEntry = userCampus
    ? Object.entries(CAMPUSES).find(([name]) =>
        name.toLowerCase() === userCampus.toLowerCase() ||
        name.toLowerCase().includes(userCampus.toLowerCase())
      )
    : null
  const preferredName = preferredEntry?.[0] || ''
  const preferredPos  = preferredEntry?.[1] || null

  // Nearest campus to the property
  const nearest = singlePin && prop
    ? findNearestCampus(Number(prop.latitude), Number(prop.longitude))
    : null

  const sameAsNearest = nearest && preferredName &&
    nearest.name.toLowerCase() === preferredName.toLowerCase()

  // Fetch road routes once the Maps API is loaded
  useEffect(() => {
    if (!isLoaded || !singlePin || !prop) return

    const svc    = new window.google.maps.DirectionsService()
    const origin = { lat: Number(prop.latitude), lng: Number(prop.longitude) }

    setNearestRoute(null)
    setPreferredRoute(null)
    setNearestDist(null)
    setPreferredDist(null)

    if (nearest) {
      svc.route(
        { origin, destination: nearest.pos, travelMode: window.google.maps.TravelMode.DRIVING },
        (result, status) => {
          if (status === 'OK') {
            setNearestRoute(result)
            const d = result.routes?.[0]?.legs?.[0]?.distance?.text
            setNearestDist(d || null)
            // If preferred === nearest, reuse this distance for the preferred label too
            if (sameAsNearest) setPreferredDist(d || null)
          }
        },
      )
    }

    // Only fetch a second route if preferred campus differs from nearest
    if (preferredPos && !sameAsNearest) {
      svc.route(
        { origin, destination: preferredPos, travelMode: window.google.maps.TravelMode.DRIVING },
        (result, status) => {
          if (status === 'OK') {
            setPreferredRoute(result)
            const d = result.routes?.[0]?.legs?.[0]?.distance?.text
            setPreferredDist(d || null)
          }
        },
      )
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, singlePin, prop?.latitude, prop?.longitude, preferredName])

  const containerStyle = {
    width: '100%',
    height,
    borderRadius: '12px',
    overflow: 'hidden',
    border: '1px solid #E8DDD0',
  }

  if (loadError) return (
    <div style={{ ...containerStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5EDD8' }}>
      <p style={{ color: 'var(--text2)', fontSize: '13px' }}>
        Map failed to load. Check your API key in frontend/.env.
      </p>
    </div>
  )

  if (!isLoaded) return (
    <div style={{ ...containerStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5EDD8' }}>
      <div className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  )

  if (withCoords.length === 0) return (
    <div style={{ ...containerStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F5EDD8', gap: '8px' }}>
      <span style={{ fontSize: '32px' }}>📍</span>
      <p style={{ fontSize: '13px', color: 'var(--text2)', margin: 0 }}>
        Location coordinates not available yet.
      </p>
      <p style={{ fontSize: '11px', color: 'var(--text3)', margin: 0 }}>
        Re-run data_cleaning.py with GOOGLE_MAPS_API_KEY set.
      </p>
    </div>
  )

  return (
    <GoogleMap mapContainerStyle={containerStyle} center={center} zoom={zoom}>

      {/* ── Road route: property → nearest campus (purple) ────── */}
      {nearestRoute && (
        <DirectionsRenderer
          directions={nearestRoute}
          options={{
            suppressMarkers: true,
            polylineOptions: {
              strokeColor: '#4D2D78',
              strokeWeight: 4,
              strokeOpacity: 0.85,
            },
          }}
        />
      )}

      {/* ── Road route: property → preferred campus (green) ────── */}
      {preferredRoute && (
        <DirectionsRenderer
          directions={preferredRoute}
          options={{
            suppressMarkers: true,
            polylineOptions: {
              strokeColor: '#1A7A4A',
              strokeWeight: 4,
              strokeOpacity: 0.85,
            },
          }}
        />
      )}

      {/* ── Property markers ──────────────────────────────────── */}
      {withCoords.map((p, i) => (
        <Marker
          key={p.id}
          position={{ lat: Number(p.latitude), lng: Number(p.longitude) }}
          label={singlePin ? undefined : {
            text: String(i + 1),
            color: '#ffffff',
            fontWeight: 'bold',
            fontSize: '11px',
          }}
          onClick={() => { setActiveProp(p); setActiveCampus(null) }}
        />
      ))}

      {/* ── Property info popup ───────────────────────────────── */}
      {activeProp && (
        <InfoWindow
          position={{ lat: Number(activeProp.latitude), lng: Number(activeProp.longitude) }}
          onCloseClick={() => setActiveProp(null)}
        >
          <div style={{ maxWidth: '200px', fontFamily: "'DM Sans', sans-serif", padding: '2px' }}>
            <p style={{ fontWeight: '600', marginBottom: '4px', fontSize: '14px', color: '#4D2D78' }}>
              {formatPrice(activeProp.rental_price)}
              <span style={{ fontWeight: 400, fontSize: '11px', color: '#888' }}>/mo</span>
            </p>
            <p style={{ fontSize: '12px', color: '#333', marginBottom: '4px', lineHeight: 1.4 }}>
              {activeProp.title?.length > 55
                ? activeProp.title.slice(0, 55) + '…'
                : activeProp.title}
            </p>
            <p style={{ fontSize: '11px', color: '#666', marginBottom: '6px' }}>
              📍 {activeProp.area}{activeProp.state ? `, ${activeProp.state}` : ''}
            </p>
            {activeProp.distance_to_campus && (
              <p style={{ fontSize: '11px', color: '#2D5FA0', marginBottom: '8px', fontWeight: '600' }}>
                🏫 {activeProp.distance_to_campus} km to nearest UiTM
              </p>
            )}
            {onView && (
              <button
                onClick={() => { onView(activeProp); setActiveProp(null) }}
                style={{
                  width: '100%', padding: '6px 0',
                  background: '#4D2D78', color: '#fff',
                  border: 'none', borderRadius: '6px',
                  cursor: 'pointer', fontSize: '12px',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                View details
              </button>
            )}
          </div>
        </InfoWindow>
      )}

      {/* ── UiTM campus markers ───────────────────────────────── */}
      {Object.entries(CAMPUSES).map(([name, pos]) => {
        const isPreferred = preferredName && name.toLowerCase() === preferredName.toLowerCase()
        const isNearest   = nearest && name.toLowerCase() === nearest.name.toLowerCase()
        const icon = isLoaded && window.google ? {
          url: isPreferred
            ? 'https://maps.google.com/mapfiles/ms/icons/green-dot.png'
            : 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
          scaledSize: new window.google.maps.Size(isPreferred || isNearest ? 40 : 28, isPreferred || isNearest ? 40 : 28),
        } : campusIcon

        return (
          <Marker
            key={name}
            position={pos}
            icon={icon}
            label={{
              text: isPreferred ? 'My UiTM' : 'UiTM',
              color: isPreferred ? '#0f5132' : '#1a3a6b',
              fontSize: isPreferred ? '10px' : '9px',
              fontWeight: 'bold',
            }}
            onClick={() => { setActiveCampus({ name, pos }); setActiveProp(null) }}
            zIndex={isPreferred ? 10 : 1}
          />
        )
      })}

      {/* ── Campus info popup ─────────────────────────────────── */}
      {activeCampus && (
        <InfoWindow
          position={activeCampus.pos}
          onCloseClick={() => setActiveCampus(null)}
        >
          <div style={{ fontFamily: "'DM Sans', sans-serif", padding: '2px' }}>
            <p style={{ fontWeight: '700', fontSize: '13px', color: '#1a3a6b', marginBottom: '2px' }}>
              🎓 {activeCampus.name}
            </p>
            {preferredName && activeCampus.name.toLowerCase() === preferredName.toLowerCase() && (
              <p style={{ fontSize: '11px', color: '#1A7A4A', fontWeight: '600', marginBottom: '2px' }}>
                Your preferred campus
              </p>
            )}
            {nearest && activeCampus.name.toLowerCase() === nearest.name.toLowerCase() && (
              <p style={{ fontSize: '11px', color: '#4D2D78', fontWeight: '600', marginBottom: '2px' }}>
                Nearest campus
              </p>
            )}
            <p style={{ fontSize: '11px', color: '#555', margin: 0 }}>UiTM Campus</p>
          </div>
        </InfoWindow>
      )}

      {/* ── Map legend (single-pin mode only) ────────────────── */}
      {singlePin && (nearestRoute || preferredRoute || (sameAsNearest && preferredDist)) && (
        <div style={{
          position: 'absolute', bottom: '32px', left: '10px',
          background: 'rgba(255,255,255,0.97)',
          border: '1px solid #ddd', borderRadius: '10px',
          padding: '10px 14px', fontSize: '12px',
          fontFamily: "'DM Sans', sans-serif",
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          display: 'flex', flexDirection: 'column', gap: '7px',
          pointerEvents: 'none',
          minWidth: '200px',
        }}>
          {sameAsNearest ? (
            /* Preferred IS the nearest — single row */
            nearestRoute && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '24px', height: '3px', background: '#4D2D78', borderRadius: '2px', flexShrink: 0 }} />
                <div>
                  <div style={{ color: '#4D2D78', fontWeight: '600' }}>Your campus (nearest)</div>
                  <div style={{ color: '#555', fontSize: '11px' }}>{preferredName}</div>
                  {nearestDist && (
                    <div style={{ color: '#4D2D78', fontWeight: '700', fontSize: '13px' }}>
                      🚗 {nearestDist} by road
                    </div>
                  )}
                </div>
              </div>
            )
          ) : (
            /* Preferred and nearest are different — two rows */
            <>
              {preferredRoute && preferredName && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '24px', height: '3px', background: '#1A7A4A', borderRadius: '2px', flexShrink: 0 }} />
                  <div>
                    <div style={{ color: '#1A7A4A', fontWeight: '600' }}>Your campus</div>
                    <div style={{ color: '#555', fontSize: '11px' }}>{preferredName}</div>
                    {preferredDist && (
                      <div style={{ color: '#1A7A4A', fontWeight: '700', fontSize: '13px' }}>
                        🚗 {preferredDist} by road
                      </div>
                    )}
                  </div>
                </div>
              )}
              {nearestRoute && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '24px', height: '3px', background: '#4D2D78', borderRadius: '2px', flexShrink: 0 }} />
                  <div>
                    <div style={{ color: '#4D2D78', fontWeight: '600' }}>Nearest campus</div>
                    <div style={{ color: '#555', fontSize: '11px' }}>{nearest?.name}</div>
                    {nearestDist && (
                      <div style={{ color: '#4D2D78', fontWeight: '700', fontSize: '13px' }}>
                        🚗 {nearestDist} by road
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

    </GoogleMap>
  )
}
