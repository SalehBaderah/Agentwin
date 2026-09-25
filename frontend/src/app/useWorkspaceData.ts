import { useCallback, useEffect, useState } from "react";
import type { State } from "@/types";
import { api } from "@/types";
import type { ServiceHealth } from "./types";

export function useWorkspaceData() {
  const [states, setStates] = useState<State[]>([]);
  const [connected, setConnected] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [health, setHealth] = useState<ServiceHealth | null>(null);
  useEffect(() => {
    let stopped = false;
    const check = () => api<ServiceHealth>("/health").then((value) => { if (!stopped) setHealth(value); }).catch(() => { if (!stopped) setHealth(null); });
    check();
    const timer = window.setInterval(check, 10000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, []);
  const refresh = useCallback(() => {
    api<State[]>("/projects")
      .then((s) => { setStates(s); setLoaded(true); setError(""); })
      .catch((e) => { setError(e.message); setLoaded(true); });
  }, []);
  useEffect(() => {
    refresh();
    let socket: WebSocket;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const connect = () => {
      socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`);
      socket.onopen = () => { setConnected(true); refresh(); };
      socket.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.type === "snapshot") { setStates(m.projects); setLoaded(true); setError(""); }
      };
      socket.onclose = () => { setConnected(false); if (!stopped) timer = setTimeout(connect, 2000); };
      socket.onerror = () => socket.close();
    };
    connect();
    return () => { stopped = true; clearTimeout(timer); socket?.close(); };
  }, [refresh]);
  return { states, connected, loaded, error, health, refresh };
}
