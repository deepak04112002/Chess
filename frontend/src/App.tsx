import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import "./App.css";
import Landing from "./screens/Landing";
import Game from "./screens/Game";
import Login from "./pages/Login";
import { supabase } from "./lib/supabase";
import { Session } from "@supabase/supabase-js";
import Profile from "./screens/Profile";

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading)
    return (
      <div className="h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-white">Loading...</p>
      </div>
    );

  return (
    <div className="h-screen bg-slate-900">
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={!session ? <Login /> : <Navigate to="/" />}
          />
          <Route
            path="/"
            element={session ? <Landing /> : <Navigate to="/login" />}
          />
          <Route
            path="/game"
            element={session ? <Game /> : <Navigate to="/login" />}
          />
          <Route
            path="/profile"
            element={session ? <Profile /> : <Navigate to="/login" />}
          />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
