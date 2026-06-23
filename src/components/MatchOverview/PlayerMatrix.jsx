import { cellStyle, mapCode, eloToLevel, levelColor } from "../../colors";
import { prettifyMapName, defaultMapThumbnail } from "../../utils";

const TEAM_COLORS = ["#5fe09a", "#7aa7ff"];

// Generic matrix skeleton for the "init" phase (roster not known yet).
function MatrixSkeleton({ cols }) {
  const range = (n) => Array.from({ length: n });
  return (
    <div className="playerMatrix">
      <div className="playerMatrix-title">MAPS PLAYED · PER PLAYER</div>
      <div className="playerMatrix-sub">Waiting for player list…</div>
      <div className="playerMatrix-teams">
        {range(2).map((_, ti) => (
          <div key={ti}>
            <span className="pmSkel-team" />
            <div className="pmHeaders">
              <span className="pmRowLabel" />
              {range(cols).map((_, i) => (
                <span key={i} className="pmHeadCell pmSkel-head" />
              ))}
            </div>
            <div className="pmRows">
              {range(5).map((_, ri) => (
                <div className="pmRow" key={ri}>
                  <span className="pmRowLabel">
                    <span className="pmSkel-name" />
                  </span>
                  {range(cols).map((_, ci) => (
                    <span key={ci} className="pmCell pmSkel-cell">
                      <span className="fvh-sweep" />
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Stage 3 right panel: per team, a row of map-thumbnail column headers then one
// row per player of colored score cells. Hovering a map column (here or via a
// win-probability card) rings that column and dims the rest. During loading the
// nicknames + headers show immediately and each player's elo + cells fill in as
// they arrive (pending rows show a shimmer; loaded cells fade in).
export default function PlayerMatrix({
  teams,
  mapPool,
  mapThumbnails,
  phase,
  hoverCol,
  onColEnter,
  onColLeave,
}) {
  if (phase === "init" || !teams) {
    return <MatrixSkeleton cols={Math.min(mapPool.length || 5, 7)} />;
  }

  let sub = "Cold cells = weak maps. Spot who's holding the team back.";
  if (phase === "maps") sub = "Players & maps ready — fetching match counts…";

  return (
    <div className="playerMatrix">
      <div className="playerMatrix-title">MAPS PLAYED · PER PLAYER</div>
      <div className="playerMatrix-sub">{sub}</div>
      <div className="playerMatrix-teams">
        {teams.map((team, ti) => (
          <div className="pmTeam" key={team.name}>
            <div className="pmTeam-head">
              <span className="dot" style={{ background: TEAM_COLORS[ti] }} />
              <span className="pmTeam-name">{team.name}</span>
            </div>
            <div className="pmHeaders">
              <span className="pmRowLabel" />
              {mapPool.map((map) => {
                const dim = hoverCol != null && hoverCol !== map;
                const thumb = mapThumbnails[map] ?? defaultMapThumbnail[map];
                return (
                  <span
                    key={map}
                    className={`pmHeadCell${hoverCol === map ? " active" : ""}${
                      dim ? " dim" : ""
                    }`}
                    style={{
                      backgroundImage: thumb ? `url('${thumb}')` : undefined,
                    }}
                    onPointerEnter={() => onColEnter(map)}
                    onPointerLeave={onColLeave}
                  >
                    <span className="shade" />
                    <span className="code">{mapCode(prettifyMapName(map))}</span>
                  </span>
                );
              })}
            </div>
            <div className="pmRows">
              {team.roster.map((p) => {
                const elo = p.profile.games?.cs2?.faceit_elo;
                return (
                  <div className="pmRow" key={p.profile.id}>
                    <span className="pmRowLabel">
                      <span className="pmName">{p.profile.nickname}</span>
                      {p.loaded && elo && (
                        <span
                          className="pmElo"
                          style={{ color: levelColor(eloToLevel(elo)) }}
                        >
                          {elo}
                        </span>
                      )}
                    </span>
                    {p.loaded
                      ? mapPool.map((map) => {
                          const v = p.winrate[map] ?? 0;
                          const s = cellStyle(v);
                          const active = hoverCol === map;
                          const dim = hoverCol != null && !active;
                          return (
                            <span
                              key={map}
                              className={`pmCell pmCell-in${
                                active ? " active" : ""
                              }${dim ? " dim" : ""}`}
                              style={{ background: s.bg, color: s.fg }}
                            >
                              {v}
                            </span>
                          );
                        })
                      : mapPool.map((map) => (
                          <span key={map} className="pmCell pmSkel-cell">
                            <span className="fvh-sweep" />
                          </span>
                        ))}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
