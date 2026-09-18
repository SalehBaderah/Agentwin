import { useEffect, useMemo, useState } from "react";
import type { State } from "../../../types";
import { buildTwinState } from "../adapter/buildTwinState";

export function useTwinState(state: State) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [state.session.id]);
  return useMemo(() => buildTwinState(state, nowMs), [state, nowMs]);
}
