import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Lock, Unlock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const { user, login } = useAuth();
  const [isLocked, setIsLocked] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);

  useEffect(() => {
    if (!user) {
      setIsLocked(false);
      return;
    }

    let inactivityTimer: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      if (!isLocked) {
        inactivityTimer = setTimeout(() => setIsLocked(true), INACTIVITY_TIMEOUT);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsLocked(true);
      } else {
        resetTimer();
      }
    };

    // Listeners for inactivity
    window.addEventListener("mousemove", resetTimer);
    window.addEventListener("keypress", resetTimer);
    window.addEventListener("touchstart", resetTimer);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    resetTimer();

    return () => {
      clearTimeout(inactivityTimer);
      window.removeEventListener("mousemove", resetTimer);
      window.removeEventListener("keypress", resetTimer);
      window.removeEventListener("touchstart", resetTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user, isLocked]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setIsUnlocking(true);
    setError("");
    
    try {
      // Re-authenticate to verify password
      await login({ username: user.username, password });
      setIsLocked(false);
      setPassword("");
    } catch (err: any) {
      setError("Incorrect password");
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <>
      {children}

      <AnimatePresence>
        {isLocked && user && (
          <motion.div
            initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
            animate={{ opacity: 1, backdropFilter: "blur(20px)" }}
            exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background/80"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="glass-panel p-8 rounded-3xl w-[90%] max-w-sm flex flex-col items-center relative overflow-hidden"
            >
              {/* Decorative accent */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-secondary to-accent" />
              
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(255,0,127,0.3)]">
                <Lock className="w-8 h-8 text-primary" />
              </div>
              
              <h2 className="text-2xl font-bold mb-2 neon-text-primary">App Locked</h2>
              <p className="text-muted-foreground text-center mb-8 text-sm">
                Enter password for <span className="text-white font-medium">@{user.username}</span> to unlock.
              </p>

              <form onSubmit={handleUnlock} className="w-full space-y-4">
                <div>
                  <input
                    type="password"
                    placeholder="Enter Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-center tracking-widest"
                    autoFocus
                  />
                  {error && <p className="text-destructive text-sm mt-2 text-center">{error}</p>}
                </div>
                
                <button
                  type="submit"
                  disabled={isUnlocking || !password}
                  className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-primary to-secondary text-white shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isUnlocking ? "Unlocking..." : (
                    <>
                      <Unlock className="w-5 h-5" />
                      Unlock App
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
