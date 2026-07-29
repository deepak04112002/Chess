import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:3001";
const MAX_RETRIES = 10;
const INITIAL_DELAY = 1000;

export const useSocket = () => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const retryCount = useRef(0);
  const reconnectTimeout = useRef<number | null>(null);
  const manuallyClosed = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const connect = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;

      const ws = new WebSocket(WS_URL); // no token in URL
      socketRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "auth", token })); // send as first message
        retryCount.current = 0;
        setSocket(ws);
      };

      ws.onclose = () => {
        setSocket(null);
        if (manuallyClosed.current) return;
        if (retryCount.current >= MAX_RETRIES) return;

        const delay = INITIAL_DELAY * Math.pow(2, retryCount.current);
        retryCount.current += 1;
        reconnectTimeout.current = window.setTimeout(
          () => connect(),
          Math.min(delay, 30000),
        );
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      manuallyClosed.current = true;
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      socketRef.current?.close();
    };
  }, []);

  return socket;
};
