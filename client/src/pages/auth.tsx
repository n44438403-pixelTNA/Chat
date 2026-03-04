import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight } from "lucide-react";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  
  const { login, register, isLoggingIn, isRegistering } = useAuth();
  const [, setLocation] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (!username || !password) {
      setError("Please fill in all fields");
      return;
    }

    try {
      if (isLogin) {
        await login({ username, password });
      } else {
        await register({ username, password });
      }
      setLocation("/");
    } catch (err: any) {
      setError(err.message || "An error occurred");
    }
  };

  const isPending = isLoggingIn || isRegistering;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-primary/20 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-accent/20 rounded-full blur-[100px] pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel w-full max-w-md p-8 rounded-[2rem] z-10"
      >
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-secondary mb-6 shadow-lg shadow-primary/30 rotate-3">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-display font-bold mb-2">Vibe<span className="text-primary">Chat</span></h1>
          <p className="text-muted-foreground">Ephemeral messaging for the bold.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-5 py-4 rounded-xl bg-black/40 border border-white/5 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground"
              placeholder="NeonRider99"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-5 py-4 rounded-xl bg-black/40 border border-white/5 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-4 mt-4 rounded-xl font-bold bg-white text-black hover:bg-primary hover:text-white transition-all duration-300 flex items-center justify-center gap-2 group disabled:opacity-50"
          >
            {isPending ? "Processing..." : (isLogin ? "Enter the Grid" : "Create Identity")}
            {!isPending && <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground">
            {isLogin ? "New here? " : "Already established? "}
            <button 
              onClick={() => { setIsLogin(!isLogin); setError(""); }}
              className="font-bold text-accent hover:text-primary transition-colors"
            >
              {isLogin ? "Join the network" : "Authenticate"}
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
