import { useEffect } from "react";
import VetoHelper from "./components/VetoHelper/VetoHelper";
import AutoAccept from "./components/AutoAccept/AutoAccept";
import AutoVeto from "./components/AutoVeto/AutoVeto";
import useSettings from "./hooks/useSettings";
import useMatchIdFromUrl from "./hooks/useMatchIdFromUrl";
import useSelfUserId from "./hooks/useSelfUserId";
import useMatchData from "./hooks/useMatchData";
import { saveSelfMapStats } from "./settings";

export default function App() {
  const settings = useSettings();
  const matchId = useMatchIdFromUrl();
  const selfUserId = useSelfUserId();

  // "always" only applies when the Regret Helper is on (kept in sync by the
  // popup; enforced here too so stale storage can't break it).
  const regretAlways =
    settings.regretHelperEnabled && settings.regretHelperAlways;
  const needData = settings.vetoHelperEnabled || settings.autoVetoEnabled;
  const data = useMatchData(
    needData ? matchId : null,
    selfUserId,
    settings.regretHelperEnabled,
    regretAlways,
  );

  // Cache the user's own per-map stats whenever match data finishes loading —
  // auto-veto's win-value fallback (see AUTOVETO_SPEC.md). Runs regardless of
  // which feature triggered the load.
  useEffect(() => {
    // Only cache once fully loaded — mid-stream the self player's stats may be
    // empty or partial.
    if (!data.ready || !data.teams || !selfUserId) return;
    const self = data.teams
      .flatMap((team) => team.roster)
      .find((p) => p.profile.id === selfUserId);
    if (self) saveSelfMapStats(self.stats);
  }, [data.ready, data.teams, selfUserId]);

  return (
    <>
      {/* Auto-accepts the match-ready popup after a countdown */}
      <AutoAccept
        enabled={settings.autoAcceptEnabled}
        delay={settings.autoAcceptDelay}
      />
      {/* Win probabilities & player stats overlay in matchrooms */}
      {settings.vetoHelperEnabled && (
        <VetoHelper
          matchId={matchId}
          data={data}
          locked={settings.vetoHelperLocked}
        />
      )}
      {/* Auto-bans servers & maps when you're captain */}
      {settings.autoVetoEnabled && (
        <AutoVeto matchId={matchId} data={data} settings={settings} />
      )}
    </>
  );
}
