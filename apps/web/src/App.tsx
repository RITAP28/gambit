import { Routes, Route } from 'react-router-dom'
import './App.css'
import { useAppSelector } from './redux/hook'
import AuthRoute from './middleware/authRoute';
import { Register } from './pages/auth/register';
import { Login } from './pages/auth/login';
import Landing from './pages/general/landing';
import ProtectedRoute from './middleware/protectedRoute';
import Home from './pages/general/home';
import Game from './pages/general/game';

function App() {
  const user = useAppSelector((state) => state.auth);

  return (
    <>
      <Routes>
        {/* Unprotected Routes */}
        <Route path='/' element={<Landing />} />
        <Route path='/register' element={<AuthRoute id={user.user?.id as string} isAuthenticated={user.isAuthenticated}><Register /></AuthRoute>} />
        <Route path="/login" element={<AuthRoute id={user.user?.id as string} isAuthenticated={user.isAuthenticated}><Login /></AuthRoute>} />

        {/* Protected Routes */}
        <Route path='/home/:userId' element={<ProtectedRoute isAuthenticated={user.isAuthenticated}><Home /></ProtectedRoute>} />
        <Route path='/game/:gameId' element={<ProtectedRoute isAuthenticated={user.isAuthenticated}><Game /></ProtectedRoute>} />
      </Routes>
    </>
  )
}

export default App
