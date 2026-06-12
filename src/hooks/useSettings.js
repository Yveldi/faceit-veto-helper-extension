import { useEffect, useState } from "react";
import { SETTINGS_DEFAULTS, loadSettings, subscribeSettings } from "../settings";

// Reactive view of the extension settings for content-script components. Starts
// from defaults, loads the stored values, then live-updates on any change made
// in the popup (no page reload needed).
export default function useSettings() {
  const [settings, setSettings] = useState(SETTINGS_DEFAULTS);

  useEffect(() => {
    let mounted = true;
    loadSettings().then((s) => {
      if (mounted) setSettings(s);
    });
    const unsubscribe = subscribeSettings((changes) => {
      setSettings((prev) => {
        const next = { ...prev };
        for (const [key, { newValue }] of Object.entries(changes)) {
          next[key] = newValue;
        }
        return next;
      });
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return settings;
}
