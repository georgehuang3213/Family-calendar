import React from 'react';
import { Calendar as CalendarIcon, Clock } from 'lucide-react';

interface AuthGateProps {
  authChecking: boolean;
  keyInput: string;
  keyError: string | null;
  authSubmitting: boolean;
  onKeyInputChange: (val: string) => void;
  onSubmitKey: (e: React.FormEvent) => void;
}

export function AuthGate({
  authChecking,
  keyInput,
  keyError,
  authSubmitting,
  onKeyInputChange,
  onSubmitKey,
}: AuthGateProps) {
  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-orange-50 dark:bg-stone-950">
        <div className="flex items-center gap-3 text-stone-500 dark:text-stone-400">
          <Clock size={20} className="animate-spin text-orange-600" />
          <span className="text-sm font-bold">載入中…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-orange-50 dark:bg-stone-950 p-4">
      <div className="w-full max-w-sm bg-white dark:bg-stone-900 rounded-2xl shadow-xl border border-stone-200 dark:border-stone-800 p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 bg-orange-600 rounded-2xl flex items-center justify-center text-white shadow-lg mb-3">
            <CalendarIcon size={28} />
          </div>
          <h1 className="text-xl font-black text-stone-900 dark:text-stone-100">家庭行事曆</h1>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 font-medium">請輸入家庭通行碼以繼續</p>
        </div>
        <form onSubmit={onSubmitKey} className="space-y-3">
          <input
            type="password"
            value={keyInput}
            onChange={(e) => onKeyInputChange(e.target.value)}
            autoFocus
            placeholder="家庭通行碼"
            className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl px-4 py-3 text-sm font-medium text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-orange-500"
          />
          {keyError && <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{keyError}</p>}
          <button
            type="submit"
            disabled={!keyInput.trim() || authSubmitting}
            className="w-full bg-orange-600 text-white rounded-xl py-3 text-sm font-black disabled:opacity-40 hover:bg-orange-700 transition-colors"
          >
            {authSubmitting ? '驗證中…' : '進入'}
          </button>
        </form>
      </div>
    </div>
  );
}
