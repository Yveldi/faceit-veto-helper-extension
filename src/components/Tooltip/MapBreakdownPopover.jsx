import { cellStyle } from "../../colors";

// Stage 2 hover body: both teams' players and their score on the hovered map,
// each value tinted weak->strong. Header shows the map and the main team's win %.
export default function MapBreakdownPopover({
  mainTeam,
  otherTeam,
  map,
  pct,
  pctColor,
}) {
  const teams = [
    { team: mainTeam, main: true },
    { team: otherTeam, main: false },
  ];
  return (
    <div className="mapBreakdown">
      <div className="mapBreakdown-head">
        <span className="label">MATCHES PLAYED ON</span>
        <div className="row">
          <span className="map">{map.replace(/^[a-z]+_/, "")}</span>
          {pct != null && (
            <span className="pct" style={{ color: pctColor }}>
              {pct}%
            </span>
          )}
        </div>
      </div>
      {teams.map(({ team, main }) => (
        <div className="mapBreakdown-team" key={team.name}>
          <div className={`name${main ? " main" : ""}`}>{team.name}</div>
          {team.roster.map((p) => {
            // Players still streaming in show a shimmer instead of a value, so
            // the breakdown is usable before everyone has loaded.
            if (!p.loaded) {
              return (
                <div className="prow" key={p.profile.id}>
                  <span className="pname">{p.profile.nickname}</span>
                  <span className="pval pending">
                    <span className="fvh-sweep" />
                  </span>
                </div>
              );
            }
            const v = p.winrate[map] ?? 0;
            const s = cellStyle(v);
            return (
              <div
                className="prow"
                key={p.profile.id}
                style={{ background: s.rowBg }}
              >
                <span className="pname">{p.profile.nickname}</span>
                <span
                  className={`pval${p.ratingEstimated ? " fvh-est" : ""}`}
                  style={{ background: s.bg, color: s.fg }}
                >
                  {v}
                </span>
              </div>
            );
          })}
        </div>
      ))}
      <div className="mapBreakdown-legend">
        <span>
          <span className="sw weak" />
          weak
        </span>
        <span>
          <span className="sw strong" />
          strong
        </span>
      </div>
    </div>
  );
}
