import type { IClockProps } from '@repo/types'

const Clock = ({ time, isActive, color }: IClockProps) => {
  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className={`clock ${isActive ? "clock--active" : ""} ${time < 30 ? "clock--danger" : ""}`}>
        <span className="clock__label">{color === "w" ? "White" : "Black"}</span>
        <span className="clock__time">{formatTime(time)}</span>
    </div>
  )
}

export default Clock