import { useNavigate } from 'react-router-dom'

const Landing = () => {
  const navigate = useNavigate();
  return (
    <div className='w-full h-screen flex justify-center items-center'>
        <div className="">landing page</div>
        <div className="w-full flex justify-center items-center">
            <button type="button" className="" onClick={() => navigate('/register')}>Register</button>
            <button type="button" className="" onClick={() => navigate('/login')}>Login</button>
        </div>
    </div>
  )
}

export default Landing