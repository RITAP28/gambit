import ActivityGraph from "@/components/home/activityGraph";
import Navbar from "@/components/home/navbar";
import Profile from "@/components/home/profile";
import SearchPlayerModal from "@/components/modals/searchPlayerModal";
import { useWebSocket } from "@/hooks/useWebSocket";
import config from "@/infra/activeconfig";
import { useAppSelector } from "@/redux/hook"
import { logout } from "@/redux/slices/auth.slice";
import axios from "axios";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";

export type ActivityDay = {
  date: string;
  played: number;
  won: number;
  lost: number;
  draw: number;
};

const Home = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useAppSelector((state) => state.auth);
  const { ws, sendMessage } = useWebSocket();

  const hasFetched = useRef<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activityLoading, setActivityLoading] = useState<boolean>(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [data, setData] = useState<ActivityDay[]>([]);

  const [searchModalOpen, setSearchModalOpen] = useState<boolean>(false);

  const handleLogout = async () => {
    setLoading(true);
    setError(null);

    try {
      const logoutResponse = await axios.post(
        `${config.DEV_BASE_URL}`,
        {
          action: 'logout-user',
          data: { userId: user?.id }
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

  useEffect(() => {
    if (!user && hasFetched.current) return;

    hasFetched.current = true;

    const fetchUserActivity = async () => {
      setActivityLoading(true);
      setActivityError(null);
      setData([]);

      try {
        const response = await axios.post(
          `${config.DEV_BASE_URL}`,
          {
            action: 'get-user-activity',
            data: { userId: user?.id }
          },
          {
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${user?.accessToken}`
            }
          }
        );

        if (response.status === 200) {
          setData(response.data.activity);
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          if (status === 404) setActivityError("user not found");
          else if (status === 400) setActivityError("validation failed");
        } else {
          setActivityError("unexpected error, please try again");
        }
      }

      setActivityLoading(false);
    };

    fetchUserActivity();
  }, [user]);

  return (
    <div className="w-full min-h-screen flex flex-col bg-neutral-900">
      <Navbar loading={loading} error={error} handleLogout={handleLogout} />

      {/* Unauthenticated */}
      {!user && (
        <div className="flex-1 flex flex-col justify-center items-center px-4 text-center">
          <div className="text-white font-medium">It's a simple clone of chess.com, nothing else hehehehe :p</div>
          <div className="w-full flex flex-row justify-center items-center gap-2 pt-2">
            <button type="button" className="text-neutral-300 rounded-md border-[0.2px] border-neutral-600 px-2 py-1 hover:cursor-pointer hover:bg-neutral-600 transition duration-300 ease-in-out">Instant Play</button>
            <button type="button" className="text-neutral-300 rounded-md border-[0.2px] border-neutral-600 px-2 py-1 hover:cursor-pointer hover:bg-neutral-600 transition duration-300 ease-in-out">Make an account</button>
          </div>
        </div>
      )}

      {/* Authenticated */}
      {user && (
        /*
          Mobile  : stack vertically — main content then profile below
          Desktop : three-column layout with fixed sidebar
        */
        <div className="flex-1 flex flex-col md:flex-row md:overflow-hidden">

          {/* ── Left sidebar (desktop only) ── */}
          <aside className="hidden md:flex w-[15%] bg-neutral-900 p-6 flex-col justify-between border-r border-neutral-800 shrink-0">
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="text-left text-neutral-300 hover:cursor-pointer bg-amber-700 hover:bg-amber-600 px-3 py-2 rounded-lg transition flex flex-row gap-2 items-center"
                onClick={handleSearchPlayers}
              >
                <Plus className="w-4 shrink-0" />
                <span>New Match</span>
              </button>
              <button
                type="button"
                className="text-left text-neutral-500 hover:cursor-pointer hover:bg-neutral-800 px-3 py-2 rounded transition"
              >
                Live Games {`[soon]`}
              </button>
            </div>
          </aside>

          {/* ── Main content ── */}
          <main className="flex-1 min-w-0 p-4 md:p-6 tracking-tighter md:overflow-y-auto">
            <h1 className="text-2xl md:text-3xl font-space font-bold mb-4 text-neutral-400">
              Welcome Back,{" "}
              <span className="text-amber-600">{user.name}</span>
            </h1>

            {/* Action buttons */}
            <div className="w-full flex flex-wrap gap-2 pt-2 md:pt-4">
              {/* New Match shown inline on mobile (sidebar hidden) */}
              <button
                type="button"
                className="flex md:hidden items-center gap-1 px-4 py-2 hover:cursor-pointer bg-amber-700 hover:bg-amber-600 rounded-md text-neutral-100 transition duration-300 ease-in-out"
                onClick={handleSearchPlayers}
              >
                <Plus className="w-4" /> New Match
              </button>
              <button
                type="button"
                className="px-4 py-2 hover:cursor-pointer hover:bg-neutral-800 border-[0.3px] border-neutral-600 rounded-md text-amber-600 transition duration-300 ease-in-out"
                onClick={handleSearchPlayers}
              >
                Play Solo
              </button>
              <button
                type="button"
                className="px-4 py-2 hover:cursor-pointer hover:bg-neutral-800 border-[0.3px] border-neutral-600 rounded-md text-amber-600 transition duration-300 ease-in-out"
              >
                Participate
              </button>
              <button
                type="button"
                className="px-4 py-2 hover:cursor-pointer hover:bg-neutral-800 border-[0.3px] border-neutral-600 rounded-md text-amber-600 transition duration-300 ease-in-out"
              >
                Make your own tournament
              </button>
            </div>

            {/* Activity graph — full width of main */}
            <div className="w-full flex flex-col gap-2 pt-6 md:pt-8">
              <p className="font-medium text-neutral-400">Your activity graph:</p>
              <ActivityGraph loading={activityLoading} error={activityError} data={data} />
            </div>
          </main>

          {/* ── Profile sidebar ── */}
          {/*
            Mobile  : full-width block below main content, top border
            Desktop : fixed-width right column, left border
          */}
          <aside className="md:w-[20%] text-white border-t border-neutral-800 md:border-t-0 md:border-l shrink-0">
            <Profile loading={activityLoading} error={activityError} data={data} />
          </aside>
        </div>
      )}

      {searchModalOpen && <SearchPlayerModal setModalOpen={setSearchModalOpen} ws={ws} />}
    </div>
  );
};

export default Home;
