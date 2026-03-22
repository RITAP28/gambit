import type { ActivityDay } from "@/pages/general/home";
import { useState } from "react";

interface ActivityGraphProps {
    loading: boolean;
    error: string | null;
    data: ActivityDay[];
}

export default function ActivityGraph({ loading, error, data }: ActivityGraphProps) {
  const [hovered, setHovered] = useState<ActivityDay | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  return loading
    ? <div className="">loading...</div>
    : error 
    ? <div className="">error</div>
    : (
    <div className="relative p-4 bg-neutral-600 rounded-xl">

      {/* Grid */}
      <div className="grid grid-flow-col grid-rows-7 gap-1">
        {data.map((day, index) => {
          const intensity = Math.min(day.played, 5);

          const bgColor =
            intensity === 0
              ? "bg-neutral-800"
              : intensity < 3
              ? "bg-yellow-500"
              : "bg-green-500";

          return (
            <div
              key={index}
              className={`w-4 h-4 rounded-sm cursor-pointer ${bgColor}`}
              onMouseEnter={(e) => {
                setHovered(day);
                setPosition({
                  x: e.clientX,
                  y: e.clientY,
                });
              }}
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}
      </div>

      {/* Tooltip */}
      {hovered && (
        <div
          className="fixed bg-neutral-700 text-white text-xs rounded-md px-3 py-2 shadow-lg z-50"
          style={{
            top: position.y + 10,
            left: position.x + 10,
          }}
        >
          <p className="mb-1">{hovered.date}</p>

          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-yellow-400 inline-block"></span>
            {hovered.played} played
          </div>

          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 inline-block"></span>
            {hovered.won} wins
          </div>

          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-red-500 inline-block"></span>
            {hovered.lost} losses
          </div>

          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-neutral-500 inline-block"></span>
            {hovered.draw} draws
          </div>
        </div>
      )}
    </div>
  );
}