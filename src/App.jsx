import { useEffect } from "react";
import VetoHelper from "./components/VetoHelper/VetoHelper";
import AutoAccept from "./components/AutoAccept/AutoAccept";
import AutoVeto from "./components/AutoVeto/AutoVeto";
import PlayerCards from "./components/PlayerCards/PlayerCards";
import useSettings from "./hooks/useSettings";
import useMatchIdFromUrl from "./hooks/useMatchIdFromUrl";
import useSelfUserId from "./hooks/useSelfUserId";
import useMatchData from "./hooks/useMatchData";
import { saveSelfMapStats } from "./settings";
import { startHarvester, stopHarvester } from "./playerTracking/harvester";

export default function App() {
  const settings = useSettings();
  const matchId = useMatchIdFromUrl();
  const selfUserId = useSelfUserId();

  // "always" only applies when the Regret Helper is on (kept in sync by the
  // popup; enforced here too so stale storage can't break it).
  const regretAlways =
    settings.regretHelperEnabled && settings.regretHelperAlways;
  // Any feature needing the match payload (roster/pool). Player cards need it
  // too, so extend the gate — but it's still ONE shared fetch (the cards reuse
  // whatever the Veto Helper already loaded; no double fetch).
  const needData =
    settings.vetoHelperEnabled ||
    settings.autoVetoEnabled ||
    settings.replacePlayerCards;
  // Whether the per-player stats stream is needed at all. Cards render instantly
  // from the inline roster; their stats band only needs the stream when it's on.
  // When the Veto Helper is disabled and cards want stats, THIS is what makes
  // "the fetches the Veto Helper would have made" — never a second fetch when
  // the Veto Helper is already loading them.
  const loadStats =
    settings.vetoHelperEnabled ||
    settings.autoVetoEnabled ||
    (settings.replacePlayerCards && settings.showPlayerCardStats);
  const data = useMatchData(
    needData ? matchId : null,
    selfUserId,
    settings.regretHelperEnabled,
    regretAlways,
    loadStats,
  );

  // Player-tracking harvester: a background controller (out of render). Started
  // only when enabled and we know who "you" are; stopped otherwise.
  useEffect(() => {
    if (settings.playerTrackingEnabled && selfUserId) {
      startHarvester(selfUserId);
    } else {
      stopHarvester();
    }
    return () => stopHarvester();
  }, [settings.playerTrackingEnabled, selfUserId]);

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
      {/* Replaces FACEIT's native roster with our own player cards */}
      {settings.replacePlayerCards && (
        <PlayerCards
          matchId={matchId}
          data={data}
          selfUserId={selfUserId}
          statsEnabled={settings.showPlayerCardStats}
        />
      )}
    </>
  );
}
