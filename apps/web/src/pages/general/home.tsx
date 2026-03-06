import config from "@/infra/activeconfig";
import { useAppSelector } from "@/redux/hook"
import { logout } from "@/redux/slices/auth.slice";
import axios from "axios";
import { useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";

const Home = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useAppSelector((state) => state.auth);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogout = async () => {
    setLoading(true);
    setError(null);

    try {
      const logoutResponse = await axios.post(
        `${config.DEV_BASE_URL}`,
        {
          action: 'logout-user',
          data: {
            userId: user?.id
          }
        },
        { headers: { "Authorization": `Bearer ${user?.accessToken}` } }
      );

      if (logoutResponse.status === 200) {
        dispatch(logout());
        navigate(`/`);
      }
    } catch (error) {
      console.error('error while logging out: ', error);
      setError('error while logging out');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full h-screen flex flex-col gap-1 justify-center items-center">
        <p className="text-sm tracking-tighter font-semibold">Welcome {user?.name}, You're home!</p>
        <button
            type="button"
            className="tracking-tight text-sm px-2 py-1 bg-slate-200 hover:bg-slate-300 rounded-sm transition duration-300 ease-in-out"
            onClick={handleLogout}
            disabled={loading}
        >
            {loading ? "Logging out..." : "Logout"}
        </button>
        {error && (
          <div className="">
            {error}
          </div>
        )}
    </div>
  )
}

export default Home