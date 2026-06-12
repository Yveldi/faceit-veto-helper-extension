// Stage 3 tooltip body: the individual factors behind one player's rating on a
// map (no formula — just the inputs). `factors` is null when the player has no
// recent data on that map.
export default function PlayerMapFactors({ factors }) {
  if (!factors) {
    return <div className="playerMapFactors empty">No recent data</div>;
  }
  return (
    <div className="playerMapFactors">
      <div className="factor">
        <span>Matches played</span>
        <b>{factors.matches}</b>
      </div>
      <div className="factor">
        <span>Win rate</span>
        <b>{factors.winRate}%</b>
      </div>
      <div className="factor">
        <span>Avg FACEIT rating</span>
        <b>{factors.avgRating}</b>
      </div>
    </div>
  );
}
