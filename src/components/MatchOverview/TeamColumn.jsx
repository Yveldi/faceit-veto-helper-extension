import { Fragment, useState } from "react";
import { TbUserSquareRounded } from "react-icons/tb";
import PlayerCard from "../PlayerCard/PlayerCard";
import PlayerStats from "../PlayerStats/PlayerStats";
import PlayerMapFactors from "../Tooltip/PlayerMapFactors";
import { mapRatingFactors } from "../../stats";

const factorKey = (playerId, map) => `${playerId}::${map}`;

function TeamAvatar({ team }) {
  const [failed, setFailed] = useState(false);
  if (!team.avatar || failed) {
    return <TbUserSquareRounded className="team-avatar" />;
  }
  return (
    <img
      className="team-avatar"
      src={team.avatar}
      onError={() => setFailed(true)}
      alt=""
      draggable={false}
    />
  );
}

// One team's column: name + elo-weighted team summary strip + per-player
// card/stats. `hover` (from useHoverIntent) drives the Stage 3 factor tooltip.
export default function TeamColumn({ team, side, mapPool, hover }) {
  return (
    <div className={`teamColumn ${side}`}>
      <div className="teamName">
        <TeamAvatar team={team} />
        <span>{team.name}</span>
      </div>
      <PlayerStats
        stats={team.scoreByMap}
        mapPool={mapPool}
        backgroundColor="#C94300"
      />
      <div className="teamMembers">
        {team.roster.map((p) => {
          const id = p.profile.id;
          const prefix = `${id}::`;
          const activeMap = hover.activeKey?.startsWith(prefix)
            ? hover.activeKey.slice(prefix.length)
            : null;
          return (
            <Fragment key={id}>
              <PlayerCard
                player={p.profile}
                elo={p.profile.games?.cs2?.faceit_elo}
              />
              <PlayerStats
                stats={p.winrate}
                mapPool={mapPool}
                onMapEnter={(map) => hover.onEnter(factorKey(id, map))}
                onMapLeave={hover.onLeave}
                activeMap={activeMap}
                renderTooltip={(map) => (
                  <PlayerMapFactors factors={mapRatingFactors(p.stats, map)} />
                )}
              />
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
