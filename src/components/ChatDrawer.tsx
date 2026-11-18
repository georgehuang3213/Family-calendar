import React, { useEffect, useRef } from 'react';
import { Sparkles, X, AlertCircle, Send } from 'lucide-react';
import { cn } from '../utils/calendar';
import type { ChatMessage } from '../types';

interface ChatDrawerProps {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  messages: ChatMessage[];
  chatInput: string;
  onChatInputChange: (value: string) => void;
  onSend: (e?: React.FormEvent) => void;
  isAILoading: boolean;
  openaiConfigured: boolean;
}

export function ChatDrawer({
  isOpen,
  onOpen,
  onClose,
  messages,
  chatInput,
  onChatInputChange,
  onSend,
  isAILoading,
  openaiConfigured,
}: ChatDrawerProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  return (
    <>
      {/* Desktop Floating Trigger Button (On mobile, AI is integrated into the bottom navigation bar so it never blocks calendar cells) */}
      {!isOpen && (
        <div className="hidden md:block fixed bottom-6 right-6 z-40">
          <button
            id="ai-assistant-toggle"
            onClick={onOpen}
            className="w-14 h-14 bg-gradient-to-tr from-orange-600 to-violet-500 text-white rounded-full flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-all relative border-2 border-white/25 hover:shadow-orange-500/20 cursor-pointer"
            title="開啟 AI 智慧小幫手"
          >
            <Sparkles size={24} className="animate-pulse" />
            <span className="absolute -top-1 -right-1 bg-rose-600 text-[11px] text-white px-1.5 py-0.5 rounded-full font-bold shadow-sm">
              AI
            </span>
          </button>
        </div>
      )}

      {isOpen && (
        <div
          className="fixed inset-0 md:inset-auto md:bottom-6 md:right-6 z-50 flex items-end justify-center md:block bg-stone-900/40 md:bg-transparent backdrop-blur-xs md:backdrop-blur-none p-2.5 pb-20 md:p-0"
          onClick={onClose}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[400px] sm:w-[380px] h-[72vh] max-h-[500px] md:h-[480px] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-600 to-violet-600 text-white px-4 py-3.5 flex items-center justify-between shadow-sm shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-orange-100" />
                <div className="flex flex-col select-none">
                  <span className="font-black text-sm tracking-tight leading-tight">AI 家庭小秘書</span>
                  <div className="flex items-center gap-1">
                    <span
                      className={cn(
                        'w-1.5 h-1.5 rounded-full',
                        openaiConfigured ? 'bg-emerald-400 animate-pulse' : 'bg-stone-400'
                      )}
                    />
                    <span className="text-[10px] text-orange-100/80 font-bold tracking-wider">
                      {openaiConfigured ? 'ChatGPT 智慧模組' : '未設定金鑰'}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center bg-white/15 hover:bg-white/25 active:bg-white/30 rounded-full transition-colors text-white cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-stone-50 dark:bg-stone-950/65 scrollbar-thin">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex flex-col max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed shadow-sm',
                    msg.role === 'user'
                      ? 'bg-orange-600 text-white ml-auto rounded-tr-none'
                      : 'bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 rounded-tl-none border border-stone-200/50 dark:border-stone-700/55 whitespace-pre-wrap'
                  )}
                >
                  {msg.content}
                </div>
              ))}
              {isAILoading && (
                <div className="bg-white dark:bg-stone-800 text-stone-500 dark:text-stone-400 border border-stone-200/50 dark:border-stone-700/55 rounded-2xl rounded-tl-none p-3 text-xs w-[120px] shadow-sm flex items-center gap-2 select-none">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="font-bold">思考中...</span>
                </div>
              )}
              {!openaiConfigured && (
                <div className="bg-amber-50 dark:bg-amber-950/45 border border-amber-200/60 dark:border-amber-900/40 rounded-2xl p-3.5 text-xs text-amber-800 dark:text-amber-300">
                  <div className="flex gap-2 items-start font-bold">
                    <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-black mb-1">⚠️ 需要設定 ChatGPT API 金鑰</p>
                      <p className="font-medium text-[12px] leading-normal opacity-90">
                        目前尚未設定 OpenAI 金鑰。請在 Vercel 專案 Settings → Environment Variables（或本機{' '}
                        <span className="bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded font-mono font-black text-amber-700 dark:text-amber-400">
                          .env
                        </span>
                        ）新增{' '}
                        <span className="bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded font-mono font-black text-amber-700 dark:text-amber-400">
                          OPENAI_API_KEY
                        </span>{' '}
                        即可啟用 AI 小秘書！
                      </p>
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Footer */}
            <form onSubmit={onSend} className="bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 p-3 flex items-center gap-2 shrink-0">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => onChatInputChange(e.target.value)}
                disabled={isAILoading || !openaiConfigured}
                placeholder={openaiConfigured ? '請輸入指令查詢或幫我排程...' : '請先完成環境變數設定'}
                className="flex-1 bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 px-3.5 py-2.5 rounded-2xl text-xs font-bold outline-none border border-transparent focus:border-orange-500 focus:bg-white dark:focus:bg-stone-800 transition-all disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || isAILoading || !openaiConfigured}
                className="w-9 h-9 rounded-2xl bg-orange-600 text-white flex items-center justify-center shadow-md hover:bg-orange-700 active:scale-95 transition-all disabled:opacity-30 disabled:scale-100 flex-shrink-0 cursor-pointer"
              >
                <Send size={15} />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
