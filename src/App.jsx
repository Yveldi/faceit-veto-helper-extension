import MatchMaps from "./components/MatchMaps/MatchMaps";
import VetoHelper from "./components/VetoHelper/VetoHelper";
import AutoAccept from "./components/AutoAccept/AutoAccept";
import useSettings from "./hooks/useSettings";
import useMatchFoundMaps from "./hooks/useMatchFoundMaps";

export default function App() {
  const settings = useSettings();
  // One shared detection of the found match, used by both the map preview and
  // the auto-accept map check (so the pool is resolved only once).
  const matchFound = useMatchFoundMaps();

  return (
    <>
      <MatchMaps
        dialog={matchFound.dialog}
        roomMatchId={matchFound.roomMatchId}
        matchId={matchFound.matchId}
        maps={matchFound.maps}
      />
      {/* Shows which maps are available in the (pre-)accept screen */}
      <AutoAccept
        dialog={matchFound.dialog}
        maps={matchFound.maps}
        enabled={settings.autoAcceptEnabled}
        delay={settings.autoAcceptDelay}
        blockedMaps={settings.autoAcceptBlockedMaps}
      />
      {/* Auto-accepts the match-ready popup after a countdown */}
      {settings.vetoHelperEnabled && (
        <VetoHelper regretHelperEnabled={settings.regretHelperEnabled} />
      )}
      {/* Suggests bans in matchrooms */}
    </>
  );
}
