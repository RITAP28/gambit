import SearchPlayerModal from "@/components/modals/searchPlayerModal";
import { useWebSocket } from "@/hooks/useWebSocket";
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
  const { ws, sendMessage } = useWebSocket();

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [searchModalOpen, setSearchModalOpen] = useState<boolean>(false);

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
  };

  const handleSearchPlayers = () => {
    if (!user || !ws) return;
    sendMessage('join-match-making', { userId: user.id });
    setSearchModalOpen(true);
  };

  return (
    <div className="w-full h-screen flex flex-col gap-1 justify-center items-center">
        <p className="text-sm tracking-tighter font-semibold">Welcome {user?.name}, You're home!</p>
        <div className="w-full flex flex-row gap-1 justify-center items-center">
          <button
            type="button"
            className="tracking-tight text-sm px-2 py-1 bg-slate-200 hover:bg-slate-300 rounded-sm transition duration-300 ease-in-out"
            onClick={handleSearchPlayers}
          >
            Play
          </button>
          <button
            type="button"
            className="tracking-tight text-sm px-2 py-1 bg-slate-200 hover:bg-slate-300 rounded-sm transition duration-300 ease-in-out"
            onClick={() => navigate(`/game/12`)}
          >
            Invite & Play
          </button>
          <button
            type="button"
            className="tracking-tight text-sm px-2 py-1 bg-slate-200 hover:bg-slate-300 rounded-sm transition duration-300 ease-in-out"
            onClick={handleLogout}
            disabled={loading}
          >
            {loading ? "Logging out..." : "Logout"}
          </button>
        </div>
        {error && (
          <div className="">
            {error}
          </div>
        )}
    {searchModalOpen && <SearchPlayerModal setModalOpen={setSearchModalOpen} ws={ws} />}
    </div>
  )
}

export default Home