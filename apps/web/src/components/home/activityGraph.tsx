import type { ActivityDay } from "@/pages/general/home";
import { Spinner } from "@/components/ui/spinner";
import { useMemo, useState } from "react";

interface ActivityGraphProps {
  loading: boolean;
  error: string | null;
  data: ActivityDay[];
}

interface Cell {
  date: string;
  inRange: boolean;
  played: number;
  won: number;
  lost: number;
  draw: number;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildYearGrid(data: ActivityDay[]): {
  cells: Cell[];
  monthLabels: { label: string; col: number }[];
  totalCols: number;
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yearStart = new Date(today);
  yearStart.setDate(yearStart.getDate() - 364);

  // start from the Sunday of the week containing yearStart
  const gridStart = new Date(yearStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());

  const activityMap = new Map(data.map((d) => [d.date, d]));
  const todayStr = toDateStr(today);
  const yearStartStr = toDateStr(yearStart);

  const cells: Cell[] = [];
  const cur = new Date(gridStart);

  while (toDateStr(cur) <= todayStr) {
    const dateStr = toDateStr(cur);
    const inRange = dateStr >= yearStartStr;
    const activity = activityMap.get(dateStr);
    cells.push({
      date: dateStr,
      inRange,
      played: activity?.played ?? 0,
      won: activity?.won ?? 0,
      lost: activity?.lost ?? 0,
      draw: activity?.draw ?? 0,
    });
    cur.setDate(cur.getDate() + 1);
  }

  const totalCols = Math.ceil(cells.length / 7);

  const monthLabels: { label: string; col: number }[] = [];
  cells.forEach((cell, idx) => {
    if (!cell.inRange) return;
    const [y, m, d] = cell.date.split("-").map(Number);
    if (d === 1) {
      const col = Math.floor(idx / 7);
      const label = new Date(y, m - 1, 1).toLocaleString("default", { month: "short" });
      if (!monthLabels.length || monthLabels[monthLabels.length - 1].col !== col) {
        monthLabels.push({ label, col });
      }
    }
  });

  return { cells, monthLabels, totalCols };
}

function getCellColor(cell: Cell): string {
  if (!cell.inRange) return "bg-transparent";
  const n = cell.played;
  if (n === 0) return "bg-neutral-700";
  if (n === 1) return "bg-green-900";
  if (n <= 3) return "bg-green-700";
  if (n <= 6) return "bg-green-500";
  return "bg-green-400";
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("default", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Show Mon / Wed / Fri only — matches GitHub style
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const GAP = 3; // px between cells
const MIN_CELL = 10; // px minimum cell size

export default function ActivityGraph({ loading, error, data }: ActivityGraphProps) {
  const [hovered, setHovered] = useState<Cell | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const { cells, monthLabels, totalCols } = useMemo(() => buildYearGrid(data), [data]);

  // Minimum pixel width of the whole cell grid (at MIN_CELL per cell)
  const minGridW = totalCols * MIN_CELL + (totalCols - 1) * GAP;

  if (loading) {
    return (
      <div className="w-full bg-neutral-800 rounded-xl flex justify-center items-center" style={{ minHeight: 108 }}>
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  if (error) {
    return <div className="text-red-400 text-sm py-2">{error}</div>;
  }

  return (
    <div className="relative w-full bg-neutral-800 rounded-xl p-4 overflow-x-auto">
      {/*
        Outer flex row: [day labels] [month labels + cell grid]
        minWidth ensures the container can scroll on narrow screens.
      */}
      <div className="flex gap-2" style={{ minWidth: minGridW + 30 }}>

        {/* Day-of-week labels — Mon / Wed / Fri visible, rest invisible */}
        <div
          className="flex flex-col justify-around shrink-0 select-none"
          style={{ width: 24, paddingTop: MIN_CELL + GAP + 2 /* clear month-label row */ }}
        >
          {DAY_LABELS.map((label, i) => (
            <span
              key={label}
              style={{ fontSize: 9, lineHeight: 1 }}
              className={`text-neutral-500 ${i % 2 === 0 ? "invisible" : ""}`}
            >
              {label}
            </span>
          ))}
        </div>

        {/* Right column: month labels on top, cell grid below */}
        <div className="flex flex-col flex-1 min-w-0" style={{ gap: GAP + 1 }}>

          {/* Month labels — one slot per week column */}
          <div
            className="grid select-none"
            style={{
              gridTemplateColumns: `repeat(${totalCols}, minmax(${MIN_CELL}px, 1fr))`,
              gap: GAP,
              width: "100%",
              minWidth: minGridW,
            }}
          >
            {Array.from({ length: totalCols }, (_, col) => {
              const label = monthLabels.find((m) => m.col === col)?.label;
              return (
                <div
                  key={col}
                  style={{ fontSize: 10, height: MIN_CELL, overflow: "hidden" }}
                  className="text-neutral-500"
                >
                  {label ?? ""}
                </div>
              );
            })}
          </div>

          {/* Cell grid — flows column by column (week by week) */}
          <div
            className="grid"
            style={{
              gridAutoFlow: "column",
              gridTemplateRows: "repeat(7, auto)",
              gridAutoColumns: `minmax(${MIN_CELL}px, 1fr)`,
              gap: GAP,
              width: "100%",
              minWidth: minGridW,
            }}
          >
            {cells.map((cell, idx) => (
              <div
                key={idx}
                className={`rounded-[2px] aspect-square ${getCellColor(cell)} ${
                  cell.inRange ? "cursor-pointer" : "pointer-events-none cursor-default"
                }`}
                onMouseEnter={(e) => {
                  setHovered(cell);
                  setPos({ x: e.clientX, y: e.clientY });
                }}
                onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHovered(null)}
              />
            ))}
          </div>

        </div>
      </div>

      {/* Tooltip */}
      {hovered && (
        <div
          className="fixed z-50 pointer-events-none bg-neutral-700 text-white text-xs rounded-md px-3 py-2 shadow-lg"
          style={{ top: pos.y + 14, left: pos.x + 14 }}
        >
          <p className="mb-1 font-semibold">{formatDate(hovered.date)}</p>
          {hovered.played === 0 ? (
            <p className="text-neutral-400">No games played</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-sm bg-green-500 inline-block" />
                {hovered.played} played
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-sm bg-green-400 inline-block" />
                {hovered.won} won
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-sm bg-red-500 inline-block" />
                {hovered.lost} lost
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-sm bg-neutral-500 inline-block" />
                {hovered.draw} draw
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
