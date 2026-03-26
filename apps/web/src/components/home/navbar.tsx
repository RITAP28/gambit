import { useAppSelector } from "@/redux/hook";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Navbar({ loading, handleLogout }: { loading: boolean; error: string | null; handleLogout: () => Promise<void> }) {
  const { user } = useAppSelector((state) => state.auth);
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="bg-neutral-900 text-white px-6 py-4 sticky top-0 z-50">
      <div className="flex items-center justify-between">
        
        {/* Logo */}
        <div className="text-xl font-bold tracking-wide cursor-pointer"><span className="">Gambit</span></div>

        {/* Desktop Menu */}
        {user && (
          <div className="hidden md:flex items-center gap-6">
            <a href="#" className="hover:text-gray-300 transition">Play</a>
            <a href="#" className="hover:text-gray-300 transition">Tournaments</a>
            <a href="#" className="hover:text-gray-300 transition">Leaderboard</a>
            <a href="#" className="hover:text-gray-300 transition">Social</a>
          </div>
        )}

        {/* Right Section */}
        <div className="hidden md:flex items-center gap-4">
          {!user && (
            <>
            <button className="px-4 py-1 border border-gray-500 rounded hover:bg-gray-800 transition">Login</button>
            <button className="px-4 py-1 bg-white text-black rounded hover:bg-gray-200 transition">Sign Up</button>
            </>
          )}
          {user && (
            <>
            <button
              type="button"
              className="px-4 py-1 border-[0.3px] border-neutral-700 rounded hover:bg-neutral-700 text-white transition text-sm hover:cursor-pointer font-medium"
              onClick={handleLogout}
              disabled={loading}
            >
              {loading ? 'logging you out...' : 'Logout'}
            </button>
            </>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden"
          onClick={() => setIsOpen(!isOpen)}
        >
          ☰
        </button>
      </div>

      {/* Mobile Dropdown */}
      {isOpen && (
        <div className="mt-4 flex flex-col gap-4 md:hidden">
          <a href={`/home/${user?.id}`} className="hover:text-gray-300">Home</a>
          <a href="#" className="hover:text-gray-300">Play</a>
          <a href="#" className="hover:text-gray-300">Puzzles</a>
          <a href="#" className="hover:text-gray-300">Leaderboard</a>

          <div className="flex flex-col gap-2 mt-2">
            <button
              type="button"
              className="border border-gray-500 rounded py-1"
              onClick={() => navigate(`/login`)}
            >
              Login
            </button>
            <button
              type="button"
              className="bg-white text-black rounded py-1"
              onClick={() => navigate('/register')}
            >
              Register
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}