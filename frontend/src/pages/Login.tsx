import { useState } from "react";
import { supabase } from "../lib/supabase";
import Button from "../components/Button";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    const { error } = isSignup
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (error) setError(error.message);
    setLoading(false);
  };

  return (
    <div className="flex justify-center items-center h-screen">
      <div className="bg-slate-800 p-10 rounded-xl flex flex-col gap-4 w-96">
        <h1 className="text-3xl font-bold text-white text-center">
          {isSignup ? "Sign Up" : "Login"}
        </h1>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bg-slate-700 text-white p-3 rounded-lg outline-none"
          onKeyDown={handleKeyDown}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="bg-slate-700 text-white p-3 rounded-lg outline-none"
          onKeyDown={handleKeyDown}
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <Button onClick={handleSubmit}>
          {loading ? "Loading..." : isSignup ? "Sign Up" : "Login"}
        </Button>
        <p
          className="text-slate-400 text-sm text-center cursor-pointer hover:text-white"
          onClick={() => setIsSignup(!isSignup)}
        >
          {isSignup
            ? "Already have an account? Login"
            : "Don't have an account? Sign Up"}
        </p>
      </div>
    </div>
  );
};

export default Login;
