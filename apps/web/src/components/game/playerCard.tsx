import type { IPlayerCardProps } from "@repo/types"
import Clock from "./clock"

const PlayerCard = ({ id, username, rating, color, isActive, time }: IPlayerCardProps) => {
  return (
    <div className={`player-card ${isActive ? "player-card--active" : ""} border-[0.3px] border-neutral-700`}>
        <div className="player-card__avatar" data-color={color}>
            {username}
        </div>
        <div className="player-card__info">
            <span className="player-card__name">{username}</span>
            <span className="player-card__rating">{rating}</span>
        </div>
        <Clock userId={id} time={time} isActive={isActive} color={color} />
    </div>
  )
}

export default PlayerCard