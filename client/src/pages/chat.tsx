import { useState, useEffect, useRef } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useMessages, useUsers, useSendMessage, useDeleteMessage } from "@/hooks/use-chat";
import { ChatBubble } from "@/components/chat-bubble";
import { ArrowLeft, Send, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Message } from "@shared/schema";

export default function ChatPage() {
  const params = useParams();
  const receiverId = parseInt(params.userId || "0");
  const [, setLocation] = useLocation();
  
  const { user } = useAuth();
  const { data: users } = useUsers();
  const { data: messages = [], isLoading } = useMessages(receiverId);
  const { mutateAsync: sendMessage, isPending: isSending } = useSendMessage();
  const { mutate: deleteMessage } = useDeleteMessage();

  const [input, setInput] = useState("");
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const receiver = users?.find(u => u.id === receiverId);

  useEffect(() => {
    if (!user) setLocation("/auth");
    if (!receiverId) setLocation("/");
  }, [user, receiverId, setLocation]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!user || !receiver) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSending) return;

    const content = input.trim();
    setInput("");
    
    try {
      await sendMessage({
        receiverId,
        content,
        replyToId: replyingTo?.id || null,
      });
      setReplyingTo(null);
    } catch (err) {
      console.error("Failed to send", err);
      // Put text back on failure
      setInput(content);
    }
  };

  const findRepliedMessage = (replyId: number | null) => {
    if (!replyId) return undefined;
    return messages.find(m => m.id === replyId);
  };

  return (
    <div className="h-screen bg-background flex flex-col max-w-2xl mx-auto border-x border-white/5 relative overflow-hidden">
      
      {/* Background ambient light based on user status */}
      <div className={`absolute top-0 left-0 w-full h-32 opacity-20 blur-3xl pointer-events-none transition-colors duration-1000 ${receiver.isOnline ? 'bg-green-500' : 'bg-secondary'}`} />

      {/* Header */}
      <header className="glass-panel z-50 px-4 py-3 flex items-center gap-4 rounded-none border-t-0 border-x-0">
        <Link href="/" className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        
        <div className="relative">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center font-display font-bold">
            {receiver.username.charAt(0).toUpperCase()}
          </div>
          {receiver.isOnline && (
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-card" />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-lg leading-tight truncate">{receiver.username}</h2>
          <p className="text-xs text-muted-foreground truncate">
            {receiver.isOnline ? (
              <span className="text-accent">Online</span>
            ) : receiver.lastOnline ? (
              <span>Last seen {formatDistanceToNow(new Date(receiver.lastOnline), { addSuffix: true })}</span>
            ) : (
              "Offline"
            )}
          </p>
        </div>
      </header>

      {/* Messages Area */}
      <main className="flex-1 overflow-y-auto p-4 flex flex-col">
        <div className="text-center py-6">
          <p className="text-xs text-muted-foreground/50 uppercase tracking-widest font-semibold bg-black/20 inline-block px-4 py-1 rounded-full">
            Encrypted Channel
          </p>
          <p className="text-[10px] text-muted-foreground/40 mt-2">
            Messages self-destruct after 24 hours.
          </p>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="flex-1 flex flex-col justify-end">
            {messages.map((msg) => (
              <ChatBubble
                key={msg.id}
                message={msg}
                isSentByMe={msg.senderId === user.id}
                onReply={(m) => setReplyingTo(m)}
                onDelete={(id) => deleteMessage(id)}
                repliedMessage={findRepliedMessage(msg.replyToId)}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Input Area */}
      <div className="p-4 bg-card border-t border-white/5 z-50">
        {replyingTo && (
          <div className="mb-3 px-4 py-2 bg-black/40 rounded-xl border-l-2 border-primary flex justify-between items-center text-sm">
            <div className="flex-1 min-w-0 pr-4">
              <span className="text-primary font-semibold text-xs block mb-0.5">
                Replying to {replyingTo.senderId === user.id ? "yourself" : receiver.username}
              </span>
              <p className="text-muted-foreground truncate line-clamp-1">{replyingTo.content}</p>
            </div>
            <button onClick={() => setReplyingTo(null)} className="p-1 hover:text-white text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        
        <form onSubmit={handleSend} className="flex items-end gap-2">
          <div className="flex-1 bg-black/40 border border-white/10 rounded-3xl relative focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              className="w-full bg-transparent resize-none outline-none py-3 px-5 max-h-32 min-h-[44px]"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
            />
          </div>
          
          <button
            type="submit"
            disabled={!input.trim() || isSending}
            className="w-11 h-11 rounded-full bg-primary flex items-center justify-center text-white shrink-0 shadow-lg shadow-primary/30 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100"
          >
            {isSending ? (
              <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <Send className="w-5 h-5 ml-0.5" />
            )}
          </button>
        </form>
      </div>

    </div>
  );
}
