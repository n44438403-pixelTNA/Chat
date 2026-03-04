import { format } from "date-fns";
import { Check, CheckCheck, Reply, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import type { Message } from "@shared/schema";
import { useEffect } from "react";
import { useMarkAsRead } from "@/hooks/use-chat";

interface ChatBubbleProps {
  message: Message;
  isSentByMe: boolean;
  onReply: (message: Message) => void;
  onDelete: (id: number) => void;
  repliedMessage?: Message;
}

export function ChatBubble({ message, isSentByMe, onReply, onDelete, repliedMessage }: ChatBubbleProps) {
  const { mutate: markAsRead } = useMarkAsRead();

  useEffect(() => {
    // If it's a received message and unread, mark it as read when it renders
    if (!isSentByMe && !message.isRead && !message.isDeleted) {
      markAsRead(message.id);
    }
  }, [message.id, message.isRead, isSentByMe, markAsRead, message.isDeleted]);

  if (message.isDeleted) {
    return (
      <div className={`flex w-full ${isSentByMe ? "justify-end" : "justify-start"} mb-4`}>
        <div className="px-4 py-2 rounded-2xl bg-muted/30 border border-white/5 text-muted-foreground italic text-sm">
          🚫 This message was deleted
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex w-full ${isSentByMe ? "justify-end" : "justify-start"} mb-4 group`}
    >
      <div className={`max-w-[75%] flex flex-col ${isSentByMe ? "items-end" : "items-start"}`}>
        
        {/* Actions (appear on hover) */}
        <div className={`flex items-center gap-2 mb-1 opacity-0 group-hover:opacity-100 transition-opacity ${isSentByMe ? "flex-row-reverse" : "flex-row"}`}>
          <button 
            onClick={() => onReply(message)}
            className="p-1.5 rounded-full bg-muted text-muted-foreground hover:text-white hover:bg-card transition-colors"
            title="Reply"
          >
            <Reply className="w-3.5 h-3.5" />
          </button>
          {isSentByMe && (
            <button 
              onClick={() => onDelete(message.id)}
              className="p-1.5 rounded-full bg-muted text-muted-foreground hover:text-destructive hover:bg-card transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Bubble */}
        <div className={`
          px-4 py-3 relative
          ${isSentByMe ? "chat-bubble-sent" : "chat-bubble-received"}
        `}>
          
          {/* Replied Message Context */}
          {repliedMessage && (
            <div className={`
              mb-2 p-2 rounded-lg text-xs border-l-2
              ${isSentByMe ? "bg-black/20 border-white/40" : "bg-background border-primary/50"}
            `}>
              <p className="line-clamp-1 opacity-80">
                {repliedMessage.isDeleted ? "Deleted message" : repliedMessage.content}
              </p>
            </div>
          )}

          <p className="text-[15px] leading-relaxed break-words">{message.content}</p>
          
          {/* Meta Footer */}
          <div className={`flex items-center gap-1 mt-1 text-[10px] ${isSentByMe ? "text-white/70 justify-end" : "text-muted-foreground justify-start"}`}>
            <span>{format(new Date(message.createdAt), "HH:mm")}</span>
            {isSentByMe && (
              <span className="ml-1">
                {message.isRead ? (
                  <CheckCheck className="w-3 h-3 text-accent" />
                ) : (
                  <Check className="w-3 h-3" />
                )}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
