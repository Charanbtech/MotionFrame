import { Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import Topnavbar from './Topnavbar';
import Hero from './Hero';
import Resources from './Resources';
import Dashboard from './Dashboard';
import BulkUpload from './BulkUpload';
import AssignedDocument from './AssignedDocument';
import Login from './Login';
import Registration from './Registration';
import ResetPassword from './ResetPassword';
import ProtectedRoute from './ProtectedRoute';
// import AIAnnotation from './AIAnnotation/AIannotation'; // Fixed import path
import AIAnnotationFast from './AIAnnotation/AIAnnotationFast'; // New fast batch annotation page
import './App.css';

function App() {
  const location = useLocation();
  const hideNavbar = location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/reset-password';

  return (
    <AuthProvider>
      {!hideNavbar && <Topnavbar />}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Registration />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              <Hero />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/resources" 
          element={
            <ProtectedRoute>
              <Resources />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/bulk-upload/upload" 
          element={
            <ProtectedRoute>
              <BulkUpload />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/assigned-document" 
          element={
            <ProtectedRoute>
              <AssignedDocument />
            </ProtectedRoute>
          } 
        />
        {/* <Route
          path='/AIAnnotation'
          element={
            <ProtectedRoute>
              <AIAnnotation />
            </ProtectedRoute>
          } 
        /> */}
        <Route
          path='/AIAnnotationFast'
          element={
            <ProtectedRoute>
              <AIAnnotationFast />
            </ProtectedRoute>
          } 
        />
      </Routes>
    </AuthProvider>
  )
}

export default App