import { Routes, Route } from 'react-router-dom'
import './App.css'
import { useAppSelector } from './redux/hook'
import AuthRoute from './middleware/authRoute';
import { Register } from './pages/auth/register';
import { Login } from './pages/auth/login';
import Landing from './pages/general/landing';

function App() {
  const user = useAppSelector((state) => state.auth);

  return (
    <>
      <Routes>
        <Route path='/' element={<Landing />} />
        <Route path='/register' element={<AuthRoute id={user.user?.id as string} isAuthenticated={user.isAuthenticated}><Register /></AuthRoute>} />
        <Route path="/login" element={<AuthRoute id={user.user?.id as string} isAuthenticated={user.isAuthenticated}><Login /></AuthRoute>} />
      </Routes>
    </>
  )
}

export default App
