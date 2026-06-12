// Stage 2 tooltip body: a team's name header (main team highlighted) followed
// by each player (bold) with their rating for the hovered map underneath.
export default function MapPlayerRatings({ team, map, highlight }) {
  return (
    <div className="mapPlayerRatings">
      <div className={`team-head${highlight ? " main" : ""}`}>{team.name}</div>
      {team.roster.map((p) => (
        <div className="row" key={p.profile.id}>
          <span className="name">{p.profile.nickname}</span>
          <span className="value">{p.winrate[map] ?? 0}</span>
        </div>
      ))}
    </div>
  );
}
