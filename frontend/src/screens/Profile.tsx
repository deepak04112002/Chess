import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";

interface Stats {
  username: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
}

const Profile = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchStats = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;

      const res = await fetch(
        `${import.meta.env.VITE_API_URL ?? "http://localhost:3001"}/me`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      setStats(data);
      setLoading(false);
    };
    fetchStats();
  }, []);

  if (loading)
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-white">Loading...</p>
      </div>
    );

  return (
    <div className="flex justify-center items-center h-screen">
      <div className="bg-slate-800 p-10 rounded-xl flex flex-col items-center gap-6 w-80">
        <h1 className="text-3xl font-bold text-white">{stats?.username}</h1>
        <p className="text-yellow-400 text-xl font-mono">ELO: {stats?.elo}</p>
        <div className="grid grid-cols-3 gap-4 w-full text-center">
          <div>
            <p className="text-green-400 text-2xl font-bold">{stats?.wins}</p>
            <p className="text-slate-400 text-sm">Wins</p>
          </div>
          <div>
            <p className="text-slate-300 text-2xl font-bold">{stats?.draws}</p>
            <p className="text-slate-400 text-sm">Draws</p>
          </div>
          <div>
            <p className="text-red-400 text-2xl font-bold">{stats?.losses}</p>
            <p className="text-slate-400 text-sm">Losses</p>
          </div>
        </div>
        <button
          onClick={() => navigate("/")}
          className="text-slate-400 hover:text-white text-sm"
        >
          ← Back
        </button>
      </div>
    </div>
  );
};

export default Profile;
