import { useEffect, useState } from "react";
import { getSelfUserId } from "../api";

// Resolves the logged-in user's id once (instant via the local JWT). Null until
// resolved, or if no session is found.
export default function useSelfUserId() {
  const [id, setId] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getSelfUserId().then((value) => {
      if (!cancelled) setId(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return id;
}
