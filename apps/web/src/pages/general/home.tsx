import Navbar from "@/components/home/navbar";
import SearchPlayerModal from "@/components/modals/searchPlayerModal";
import { useWebSocket } from "@/hooks/useWebSocket";
import config from "@/infra/activeconfig";
import { useAppSelector } from "@/redux/hook"
import { logout } from "@/redux/slices/auth.slice";
import axios from "axios";
import { Plus } from "lucide-react";
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
    <div className="w-full h-screen flex flex-col bg-neutral-900">
      <Navbar />
    
      {!user && (
        <div className="w-full h-screen flex flex-col justify-center items-center">
          <div className="text-white font-medium">It's a simple clone of chess.com, nothing else hehehehe :p</div>
          <div className="w-full flex flex-row justify-center items-center gap-2 pt-2">
            <button type="button" className="text-neutral-300 rounded-md border-[0.2px] border-neutral-600 px-2 py-1 hover:cursor-pointer hover:bg-neutral-600 transition duration-300 ease-in-out">Instant Play</button>
            {!user && <button type="button" className="text-neutral-300 rounded-md border-[0.2px] border-neutral-600 px-2 py-1 hover:cursor-pointer hover:bg-neutral-600 transition duration-300 ease-in-out">Make an account</button>}
          </div>
        </div>
      )}

      {user && (
        <div className="flex h-[calc(100vh-72px)]">
          {/* Sidebar */}
          <aside className="w-[15%] bg-neutral-900 p-6 flex flex-col justify-between border-r border-neutral-800">
            <div className="flex flex-col gap-2">
              <button type="button" className="text-left text-neutral-300 hover:cursor-pointer bg-amber-700 hover:bg-amber-600 px-3 py-2 rounded-lg transition flex flex-row gap-2 items-center">
                <span className=""><Plus className="w-4" /></span>
                <span className="">New Match</span>
              </button>
              <button type="button" className="text-left text-neutral-500 hover:cursor-pointer hover:bg-neutral-800 px-3 py-2 rounded transition">Dashboard</button>
              <button type="button" className="text-left text-neutral-500 hover:cursor-pointer hover:bg-neutral-800 px-3 py-2 rounded transition">Live Games</button>
              <button type="button" className="text-left text-neutral-500 hover:cursor-pointer hover:bg-neutral-800 px-3 py-2 rounded transition">Tournament Hub</button>
              <button type="button" className="text-left text-neutral-500 hover:cursor-pointer hover:bg-neutral-800 px-3 py-2 rounded transition">Social Hub</button>
            </div>

            {/* Bottom Section (Email) */}
            <div className="text-sm text-gray-400 border-t border-neutral-800 pt-4">ritap@example.com</div>
          </aside>

          {/* Main Content */}
          <main className="w-[65%] p-6">
            <h1 className="text-3xl font-space font-bold mb-4 text-neutral-400">Welcome Back, <span className="text-amber-600">{user.name}</span></h1>
            <p className="text-gray-400">Start a new game or continue where you left off.</p>
            <div className="w-full flex flex-row gap-2 pt-4">
              <button type="button" className="px-4 py-2 hover:cursor-pointer hover:bg-neutral-800 border-[0.3px] border-neutral-600 rounded-md text-amber-600 transition duration-300 ease-in-out" onClick={() => setSearchModalOpen(true)}>Play Solo</button>
              <button type="button" className="px-4 py-2 hover:cursor-pointer hover:bg-neutral-800 border-[0.3px] border-neutral-600 rounded-md text-amber-600 transition duration-300 ease-in-out">Participate</button>
              <button type="button" className="px-4 py-2 hover:cursor-pointer hover:bg-neutral-800 border-[0.3px] border-neutral-600 rounded-md text-amber-600 transition duration-300 ease-in-out">Make your own tournament</button>
            </div>

            {/* activity graph */}
            <div className="w-full flex flex-col gap-2 pt-8">
              <p className="font-medium text-neutral-400">Your activity graph:</p>
            </div>
          </main>

          <aside className="w-[20%] text-white border-l border-neutral-800">
            User Profile
          </aside>
        </div>
      )}
      {searchModalOpen && <SearchPlayerModal setModalOpen={setSearchModalOpen} ws={ws} />}
    </div>
  )
}

export default Home