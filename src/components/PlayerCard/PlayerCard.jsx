import "./PlayerCard.css";
import FaceitLevel from "../FaceitLevel/FaceitLevel";
import Flag from "../Flag/Flag";
import { TbUserSquareRounded } from "react-icons/tb";

function PlayerAvatar({ player }) {
  if (player.avatar)
    return <img className="avatar" src={player.avatar} draggable={false} />;
  return <TbUserSquareRounded className="avatar" />;
}

export default function PlayerCard({ player, elo }) {
  const level =
    player.games?.[0]?.skill_level ??
    player.games?.cs2?.skill_level ??
    player.gameSkillLevel;
  return (
    <div className="PlayerCard">
      <div className="flex a-center">
        <div>
          <PlayerAvatar player={player} />
        </div>
        <span className="flag-slot">
          <Flag code={player.country} size="s" />
        </span>
        <span>{player.nickname}</span>
      </div>
      <div className="skill">
        <span className="level">
          <FaceitLevel level={level} />
        </span>
        {elo && <span className="elo">{elo}</span>}
      </div>
    </div>
  );
}
