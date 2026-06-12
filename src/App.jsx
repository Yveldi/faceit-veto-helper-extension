import MatchMaps from "./components/MatchMaps/MatchMaps";
import VetoHelper from "./components/VetoHelper/VetoHelper";
import AutoAccept from "./components/AutoAccept/AutoAccept";
import useSettings from "./hooks/useSettings";

export default function App() {
  const settings = useSettings();
  return (
    <>
      <MatchMaps />
      {/* Shows which maps are available in the (pre-)accept screen */}
      <AutoAccept
        enabled={settings.autoAcceptEnabled}
        delay={settings.autoAcceptDelay}
      />
      {/* Auto-accepts the match-ready popup after a countdown */}
      {settings.vetoHelperEnabled && (
        <VetoHelper regretHelperEnabled={settings.regretHelperEnabled} />
      )}
      {/* Suggests bans in matchrooms */}
    </>
  );
}
