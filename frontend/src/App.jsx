/*
  App.jsx — Root component
  Sets up React Router with all 5 pages.
  ProtectedRoute blocks access to pages that require login.
*/

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Home              from './pages/Home'
import Login             from './pages/Login'
import Listings          from './pages/Listings'
import Recommendations   from './pages/Recommendations'
import Profile           from './pages/Profile'
import PropertyDetail    from './pages/PropertyDetail'
import LandlordDashboard from './pages/LandlordDashboard'

function isLoggedIn() {
  return !!localStorage.getItem('findmystay_token')
}

function isLandlord() {
  try { return JSON.parse(localStorage.getItem('findmystay_user'))?.role === 'houseowner' } catch { return false }
}

function ProtectedRoute({ children }) {
  return isLoggedIn() ? children : <Navigate to="/login" replace />
}

function LandlordRoute({ children }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />
  if (!isLandlord()) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public pages */}
        <Route path="/"         element={<Home />} />
        <Route path="/login"    element={<Login />} />
        <Route path="/listings" element={<Listings />} />

        {/* Protected pages — require login */}
        <Route path="/recommendations" element={
          <ProtectedRoute><Recommendations /></ProtectedRoute>
        } />
        <Route path="/profile" element={
          <ProtectedRoute><Profile /></ProtectedRoute>
        } />

        {/* Property detail */}
        <Route path="/property/:id" element={<PropertyDetail />} />

        {/* Landlord dashboard */}
        <Route path="/landlord" element={
          <LandlordRoute><LandlordDashboard /></LandlordRoute>
        } />

        {/* Catch-all — redirect unknown URLs to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}