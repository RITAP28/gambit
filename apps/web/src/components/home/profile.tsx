import type { ActivityDay } from "@/pages/general/home";
import { useAppSelector } from "@/redux/hook"
import { User } from "lucide-react"

interface ProfileProps {
    loading: boolean;
    error: string | null;
    data: ActivityDay[];
}

const Profile = ({ loading, error, data }: ProfileProps) => {
  const { user } = useAppSelector((state) => state.auth);
  let played: number = 0;
  let won: number = 0;
  let lost: number = 0;
  let draw: number = 0;

  if (data.length > 0) {
    data.map((dta) => {
        played += dta.played;
        won += dta.won;
        lost += dta.lost;
        draw += dta.draw;
    })
  };

  return (
    <div className="w-full flex flex-col gap-2 px-1">
        <div className="w-full flex flex-col bg-neutral-800 pb-4 rounded-md">
            {/* profile picture */}
            <div className="w-full flex justify-center items-center py-4">
                <div className="border-[0.3px] border-neutral-500 p-4 rounded-md"><User className="w-24 h-24" /></div>
            </div>
            <div className="w-full flex justify-center items-center py-1">
                <p className="font-semibold text-lg text-amber-600">{user?.name}</p>
            </div>
            <div className="w-full flex justify-center items-center pb-2">
                <p className="font-semibold text-sm text-amber-500">{user?.email}</p>
            </div>

            {/* statistics about the player */}
            {loading ? (
                <div className="">loading...</div>
            ) : error ? (
                <div className="">{error}</div>
            ) : (
                <div className="w-full flex flex-col gap-1 text-sm px-2">
                    <p className="text-lg">Player Statistics:</p>
                    <p className="w-full">
                        <span className="">Games Played:</span>
                        <span className="pl-2">{played}</span>
                    </p>
                    <p className="w-full">
                        <span className="">Games Won:</span>
                        <span className="pl-2">{won}</span>
                    </p>
                    <p className="w-full">
                        <span className="">Games Lost:</span>
                        <span className="pl-2">{lost}</span>
                    </p>
                    <p className="w-full">
                        <span className="">Games Drawn:</span>
                        <span className="pl-2">{draw}</span>
                    </p>
                    <p className="w-full">
                        <span className="">Win Percentage:</span>
                        <span className="pl-2">{(won / (played || 1)) * 100}%</span>
                    </p>
                </div>
            )}
        </div>
    </div>
  )
}

export default Profile