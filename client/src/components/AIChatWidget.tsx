/* ==========================================================================
   BUILD LEVEL — AI Customer Service Chat Widget
   Public-facing chat bubble in the bottom-right corner
   ========================================================================== */

import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { MessageSquare, X, Send, Loader2 } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };

function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export default function AIChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId] = useState(() => {
    const stored = sessionStorage.getItem("bl_chat_session");
    if (stored) return stored;
    const id = generateSessionId();
    sessionStorage.setItem("bl_chat_session", id);
    return id;
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: widgetConfig } = trpc.publicChat.getWidgetConfig.useQuery();
  const sendMessage = trpc.publicChat.sendMessage.useMutation();

  useEffect(() => {
    if (open && messages.length === 0 && widgetConfig?.greeting) {
      setMessages([{ role: "assistant", content: widgetConfig.greeting }]);
    }
  }, [open, widgetConfig]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!widgetConfig?.enabled) return null;

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: Message = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const result = await sendMessage.mutateAsync({
        sessionId,
        message: text,
        history: messages.slice(-6),
      });
      setMessages(prev => [...prev, { role: "assistant", content: result.reply }]);
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Sorry, I'm having trouble right now. Please email info@buildlevel.com for help.",
      }]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Chat Window */}
      {open && (
        <div className="w-80 sm:w-96 bg-[#111] border border-white/10 shadow-2xl flex flex-col"
          style={{ height: "480px" }}>
          {/* Header */}
          <div className="bg-[#1A1A1A] border-b border-white/10 px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[#FF6B00] flex items-center justify-center">
                <MessageSquare size={14} className="text-white" />
              </div>
              <div>
                <p className="font-display text-white text-xs font-bold tracking-widest">BUILD LEVEL</p>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  <p className="font-body text-[#555] text-[10px]">Support</p>
                </div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-[#555] hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] px-3 py-2 text-sm font-body leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[#FF6B00] text-white"
                    : "bg-[#1A1A1A] text-white border border-white/10"
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-[#1A1A1A] border border-white/10 px-3 py-2">
                  <div className="flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#555] animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#555] animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#555] animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-white/10 p-3 flex-shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                disabled={sending}
                className="flex-1 bg-[#1A1A1A] border border-white/10 text-white font-body text-xs px-3 py-2 outline-none focus:border-[#FF6B00] placeholder:text-[#444] disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="bg-[#FF6B00] hover:bg-[#E55A00] disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-2 transition-colors"
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
            <p className="font-body text-[#333] text-[10px] mt-2 text-center">
              Powered by BUILD LEVEL AI
            </p>
          </div>
        </div>
      )}

      {/* Toggle Button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-14 h-14 flex items-center justify-center shadow-lg transition-all duration-200 ${
          open
            ? "bg-[#1A1A1A] border border-white/20 text-white"
            : "bg-[#FF6B00] hover:bg-[#E55A00] text-white"
        }`}
        aria-label="Open customer support chat"
      >
        {open ? <X size={20} /> : <MessageSquare size={20} />}
      </button>
    </div>
  );
}
