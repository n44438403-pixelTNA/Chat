import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useUsers } from "@/hooks/use-chat";
import { Link, useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { LogOut, Search, MessageSquarePlus } from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  const { user, logout, updateStatus } = useAuth();
  const { data: users, isLoading } = useUsers();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!user) {
      setLocation("/auth");
    } else {
      // Mark as online when active
      updateStatus(true);
      
      // Cleanup: mark offline on unmount
      return () => { updateStatus(false); };
    }
  }, [user, setLocation]);

  if (!user) return null;

  const handleLogout = async () => {
    await updateStatus(false);
    await logout();
    setLocation("/auth");
  };

  const otherUsers = users?.filter(u => u.id !== user.id) || [];

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-2xl mx-auto border-x border-white/5 relative">
      
      {/* Header */}
      <header className="glass-panel sticky top-0 z-50 px-6 py-4 flex items-center justify-between border-b-0 border-x-0 rounded-none shadow-none">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center font-display font-bold text-lg">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
          </div>
          <div>
            <h2 className="font-bold leading-tight">{user.username}</h2>
            <p className="text-xs text-accent">Online</p>
          </div>
        </div>
        
        <button 
          onClick={handleLogout}
          className="p-2 rounded-full hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
          title="Disconnect"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4">
        <div className="mb-6 relative">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <Search className="w-4 h-4 text-muted-foreground" />
          </div>
          <input 
            type="text" 
            placeholder="Search network..."
            className="w-full bg-black/40 border border-white/10 rounded-2xl py-3 pl-11 pr-4 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground/50"
          />
        </div>

        <div className="flex items-center justify-between mb-4 px-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Connections</h3>
          <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded-full">{otherUsers.length}</span>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-10">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : otherUsers.length === 0 ? (
          <div className="text-center py-16 px-4 bg-card/30 rounded-3xl border border-white/5">
            <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center mb-4">
              <MessageSquarePlus className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-bold mb-1">Network Empty</h3>
            <p className="text-muted-foreground text-sm">No other users exist on this node yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {otherUsers.map((u, i) => (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                key={u.id}
              >
                <Link href={`/chat/${u.id}`} className="block">
                  <div className="flex items-center gap-4 p-4 rounded-2xl hover:bg-card/80 border border-transparent hover:border-white/5 transition-all cursor-pointer group">
                    
                    <div className="relative">
                      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center font-display text-xl text-white/50 group-hover:text-white group-hover:bg-primary/20 transition-all">
                        {u.username.charAt(0).toUpperCase()}
                      </div>
                      {u.isOnline && (
                        <div className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-background" />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-lg truncate group-hover:text-primary transition-colors">{u.username}</h4>
                      <p className="text-sm truncate text-muted-foreground">
                        {u.isOnline ? (
                          <span className="text-accent">Active now</span>
                        ) : u.lastOnline ? (
                          <span>Last seen {formatDistanceToNow(new Date(u.lastOnline), { addSuffix: true })}</span>
                        ) : (
                          <span>Offline</span>
                        )}
                      </p>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </main>

    </div>
  );
}
