import { useEffect } from "react";
import VetoHelper from "./components/VetoHelper/VetoHelper";
import AutoAccept from "./components/AutoAccept/AutoAccept";
import AutoVeto from "./components/AutoVeto/AutoVeto";
import PlayerCards from "./components/PlayerCards/PlayerCards";
import PositionCaller from "./positionCaller/PositionCaller";
import useSettings from "./hooks/useSettings";
import useMatchIdFromUrl from "./hooks/useMatchIdFromUrl";
import useSelfUserId from "./hooks/useSelfUserId";
import useMatchData from "./hooks/useMatchData";
import useMatchDetector from "./hooks/useMatchDetector";
import { saveSelfMapStats, updateSettings } from "./settings";
import {
  startHarvester,
  stopHarvester,
  triggerHarvest,
} from "./playerTracking/harvester";

export default function App() {
  const settings = useSettings();
  const matchId = useMatchIdFromUrl();
  const selfUserId = useSelfUserId();
  const matchDialog = useMatchDetector();

  // Global master switch — when off, every feature pauses at once. Fold it into
  // each feature's effective-enabled flag so nothing runs (and no data loads).
  const g = settings.globalEnabled;
  // "always" only applies when the Regret Helper is on (kept in sync by the
  // popup; enforced here too so stale storage can't break it).
  const regretAlways =
    settings.regretHelperEnabled && settings.regretHelperAlways;

  // Effective per-feature enabled flags (master switch ANDed in).
  const vetoHelperOn = g && settings.vetoHelperEnabled;
  const autoVetoOn = g && settings.autoVetoEnabled;
  const cardsOn = g && settings.replacePlayerCards;
  const spotOn = g && settings.spotEnabled;
  // Auto accept runs for the permanent toggle OR a one-time arm; the permanent
  // one wins, so the one-time arm is only "live" while permanent is off.
  const acceptEnabled =
    g && (settings.autoAcceptEnabled || settings.oneTimeAcceptEnabled);
  const oneShotArmed =
    g && !settings.autoAcceptEnabled && settings.oneTimeAcceptEnabled;

  // Any feature needing the match payload (roster/pool). Player cards need it
  // too, so extend the gate — but it's still ONE shared fetch (the cards reuse
  // whatever the Veto Helper already loaded; no double fetch).
  const needData =
    vetoHelperOn ||
    autoVetoOn ||
    cardsOn ||
    // The Position Caller needs the match payload (entity type, state, played
    // map, roster party ids) — but NOT the per-player stats stream (see
    // `loadStats`), so enabling it alone is still just the one cheap match/v2.
    spotOn;
  // Whether the per-player stats stream is needed at all. Cards render instantly
  // from the inline roster; their stats band only needs the stream when it's on.
  // When the Veto Helper is disabled and cards want stats, THIS is what makes
  // "the fetches the Veto Helper would have made" — never a second fetch when
  // the Veto Helper is already loading them.
  const loadStats =
    vetoHelperOn || autoVetoOn || (cardsOn && settings.showPlayerCardStats);
  const data = useMatchData(
    needData ? matchId : null,
    selfUserId,
    settings.regretHelperEnabled,
    regretAlways,
    loadStats,
  );

  // Player-tracking harvester: a background controller (out of render). Started
  // only when enabled and we know who "you" are; stopped otherwise.
  const trackingOn = g && settings.playerTrackingEnabled;
  useEffect(() => {
    if (trackingOn && selfUserId) {
      startHarvester(selfUserId);
    } else {
      stopHarvester();
    }
    return () => stopHarvester();
  }, [trackingOn, selfUserId]);

  // Harvest the moment a match is found (same detection as auto-accept). The
  // recently-encountered set only changes when you play, so this replaces
  // periodic polling: newly-played matches are recorded near-instantly, and the
  // 15-minute cooldown inside harvestOnce skips redundant runs (e.g. a cancelled
  // match right after the accept prompt).
  useEffect(() => {
    if (matchDialog && trackingOn && selfUserId) {
      triggerHarvest();
    }
  }, [matchDialog, trackingOn, selfUserId]);

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
        enabled={acceptEnabled}
        delay={settings.autoAcceptDelay}
        onAccepted={() => {
          // Disarm a one-time arm the moment its accept fires. Harmless if the
          // permanent toggle was the one that accepted (it stays untouched).
          if (oneShotArmed) updateSettings({ oneTimeAcceptEnabled: false });
        }}
      />
      {/* Win probabilities & player stats overlay in matchrooms */}
      {vetoHelperOn && (
        <VetoHelper
          matchId={matchId}
          data={data}
          selfUserId={selfUserId}
          locked={settings.vetoHelperLocked}
        />
      )}
      {/* Auto-bans servers & maps when you're captain */}
      {autoVetoOn && (
        <AutoVeto matchId={matchId} data={data} settings={settings} />
      )}
      {/* Replaces FACEIT's native roster with our own player cards */}
      {cardsOn && (
        <PlayerCards
          matchId={matchId}
          data={data}
          selfUserId={selfUserId}
          statsEnabled={settings.showPlayerCardStats}
        />
      )}
      {/* Auto-sends your per-map call to team chat when the map locks in. Always
          mounted (the cog + editor configure it even while the master is off);
          the controller inside no-ops unless enabled. `spotEnabled` is folded
          through the master switch so sending pauses when the master is off,
          while the cog/editor stay usable. */}
      <PositionCaller
        matchId={matchId}
        data={data}
        selfUserId={selfUserId}
        settings={g ? settings : { ...settings, spotEnabled: false }}
      />
    </>
  );
}
