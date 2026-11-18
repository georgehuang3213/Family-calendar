import React from 'react';
import { Zap, X } from 'lucide-react';
import type { CalendarEvent } from '../types';

interface DebugPanelProps {
  events: CalendarEvent[];
  filteredEvents: CalendarEvent[];
  storageSource: string;
  warning: string | null;
  configStatus: any;
  webhookLogs: string;
  isLoadingLogs: boolean;
  onRefreshEvents: () => void;
  onRefreshLogs: () => void;
  onClearLogs: () => void;
  onClose: () => void;
}

export function DebugPanel({
  events,
  filteredEvents,
  storageSource,
  warning,
  configStatus,
  webhookLogs,
  isLoadingLogs,
  onRefreshEvents,
  onRefreshLogs,
  onClearLogs,
  onClose,
}: DebugPanelProps) {
  return (
    <div className="bg-stone-900 text-stone-100 p-6 rounded-2xl mb-6 overflow-hidden animate-in fade-in zoom-in duration-300">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="font-black text-xs uppercase tracking-widest text-stone-400">偵錯資訊 (Raw Data)</h3>
          <button
            onClick={onRefreshEvents}
            className="p-1 text-stone-500 hover:text-orange-400 transition-colors"
            title="重新整理"
          >
            <Zap size={14} />
          </button>
        </div>
        <button onClick={onClose} className="text-stone-500 hover:text-white">
          <X size={18} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-stone-800 p-4 rounded-xl">
          <p className="text-[11px] font-black text-stone-500 uppercase mb-2">統計資料</p>
          <div className="space-y-1 text-sm">
            <p>
              總活動數: <span className="text-orange-400 font-bold">{events.length}</span>
            </p>
            <p>
              篩選後數量: <span className="text-orange-400 font-bold">{filteredEvents.length}</span>
            </p>
            <p>
              儲存來源: <span className="text-emerald-400 font-bold">{storageSource}</span>
            </p>
            {warning && <p className="text-amber-400 text-xs mt-2">警告: {warning}</p>}
          </div>
        </div>

        <div className="bg-stone-800 p-4 rounded-xl">
          <p className="text-[11px] font-black text-stone-500 uppercase mb-2">最近 5 筆活動</p>
          <div className="space-y-2">
            {events.slice(0, 5).map((e) => (
              <div key={e.id} className="text-[11px] border-b border-stone-700 pb-1 last:border-0">
                <p className="font-bold text-stone-200">
                  {e.title} ({e.member_name})
                </p>
                <p className="text-stone-500">
                  {e.start_date} ~ {e.end_date || e.start_date}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* LINE Webhook Real-time Diagnostic Logs */}
        <div className="col-span-1 md:col-span-2 bg-stone-800 p-4 rounded-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
            <p className="text-[11px] font-black text-stone-400 uppercase tracking-wider">
              🛰️ LINE Webhook 連結與語音診斷實時日誌
            </p>
            <div className="flex gap-2 self-start sm:self-auto">
              <button
                onClick={onRefreshLogs}
                disabled={isLoadingLogs}
                className="px-2 py-1 text-[11px] bg-orange-600 hover:bg-orange-700 disabled:bg-stone-700 text-white rounded transition-colors font-medium"
              >
                {isLoadingLogs ? '搜尋中...' : '重新整理日誌'}
              </button>
              <button
                onClick={onClearLogs}
                className="px-2 py-1 text-[11px] bg-stone-700 hover:bg-red-600 text-white rounded transition-colors font-medium"
              >
                清空日誌
              </button>
            </div>
          </div>

          {configStatus && (
            <div className="mb-4 mt-2 p-3 bg-stone-900 border border-stone-700/50 rounded-lg text-xs space-y-2">
              <p className="font-bold text-stone-200">🛰️ Vercel 與伺服器環境變數載入狀態：</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-stone-950 p-2 rounded border border-stone-800">
                  <span className="text-stone-400 block mb-0.5 text-[11px] uppercase font-bold">LINE Channel Secret</span>
                  <div className="flex items-center gap-1.5">
                    {configStatus.lineChannelSecret ? (
                      <>
                        <span className="text-emerald-400 font-semibold text-[12px]">✅ 已設定</span>
                        <span className="text-stone-500 font-mono text-[10px]">
                          ({configStatus.lineChannelSecretLength} 字元)
                        </span>
                      </>
                    ) : (
                      <span className="text-red-400 font-semibold text-[12px]">❌ 未設定</span>
                    )}
                  </div>
                </div>

                <div className="bg-stone-950 p-2 rounded border border-stone-800">
                  <span className="text-stone-400 block mb-0.5 text-[11px] uppercase font-bold">LINE Access Token</span>
                  <div className="flex items-center gap-1.5">
                    {configStatus.lineAccessToken ? (
                      <>
                        <span className="text-emerald-400 font-semibold text-[12px]">✅ 已設定</span>
                        <span className="text-stone-400 font-mono text-[10px]">
                          ({configStatus.lineAccessTokenLength} 字元)
                        </span>
                      </>
                    ) : (
                      <span className="text-red-400 font-semibold text-[12px]">❌ 未設定</span>
                    )}
                  </div>
                </div>

                <div className="bg-stone-950 p-2 rounded border border-stone-800">
                  <span className="text-stone-400 block mb-0.5 text-[11px] uppercase font-bold">
                    LINE Group ID (群組ID)
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {configStatus.lineGroupId ? (
                      <>
                        <span className="text-emerald-400 font-semibold text-[12px]">✅ 已設定</span>
                        <span className="text-orange-400 font-mono text-[10px] break-all">
                          {configStatus.lineGroupIdValue}
                        </span>
                      </>
                    ) : (
                      <span className="text-red-400 font-semibold text-[12px]">❌ 未設定</span>
                    )}
                  </div>
                </div>

                <div className="bg-stone-950 p-2 rounded border border-stone-800">
                  <span className="text-stone-400 block mb-0.5 text-[11px] uppercase font-bold">
                    OpenAI API Key (ChatGPT)
                  </span>
                  <div className="flex items-center gap-1.5">
                    {configStatus.openai ? (
                      <>
                        <span className="text-emerald-400 font-semibold text-[12px]">✅ 已設定</span>
                        <span className="text-stone-500 font-mono text-[10px]">({configStatus.openaiKeyLength} 字元)</span>
                      </>
                    ) : (
                      <span className="text-red-400 font-semibold text-[12px]">❌ 未設定</span>
                    )}
                  </div>
                </div>

                <div className="bg-stone-950 p-2 rounded border border-stone-800">
                  <span className="text-stone-400 block mb-0.5 text-[11px] uppercase font-bold">Firebase DB 連線</span>
                  <div className="flex items-center gap-1.5">
                    {configStatus.firebase ? (
                      <>
                        <span className="text-emerald-400 font-semibold text-[12px]">✅ 已設定</span>
                        <span className="text-stone-500 font-mono text-[10px]">
                          ({configStatus.firebaseKeyLength} 字元)
                        </span>
                      </>
                    ) : (
                      <span className="text-red-400 font-semibold text-[12px]">❌ 未設定</span>
                    )}
                  </div>
                </div>

                <div className="bg-stone-950 p-2 rounded border border-stone-800">
                  <span className="text-stone-400 block mb-0.5 text-[11px] uppercase font-bold">目前執行端點</span>
                  <span className="text-orange-400 font-semibold font-mono text-[11px]">
                    {configStatus.env?.VERCEL ? '⚡ Vercel Serverless' : '💻 Local/Dev'} ({configStatus.env?.NODE_ENV})
                  </span>
                </div>
              </div>

              {configStatus.lineSecretWarning && (
                <div className="mt-2 bg-red-950/60 text-red-200 border border-red-900/50 p-2.5 rounded text-[12px] leading-relaxed">
                  {configStatus.lineSecretWarning}
                </div>
              )}
            </div>
          )}

          <div className="mt-2 bg-stone-950 p-3 rounded-lg overflow-x-auto border border-stone-800">
            <pre className="text-[12px] font-mono leading-relaxed whitespace-pre-wrap text-stone-300 max-h-60 overflow-y-auto scrollbar-thin select-text">
              {webhookLogs}
            </pre>
          </div>

          <div className="mt-4 border-t border-stone-700/50 pt-3 text-[12px] text-stone-400 space-y-2">
            <p className="font-semibold text-stone-300">💡 怎麼排除「語音/訊息沒有反應」的問題？</p>
            <ol className="list-decimal list-inside space-y-1 text-stone-400">
              <li>
                請登入 LINE Developers Console，在 <strong className="text-stone-300 font-bold">Messaging API tab</strong>{' '}
                找到 Webhook 設定。
              </li>
              <li>
                填入下方的 Webhook URL 網址並點擊 <strong className="text-amber-400 font-bold">Verify (驗證/測試)</strong>{' '}
                按鈕：
                <div className="mt-1.5 flex items-center gap-1.5 bg-stone-950 px-2 py-1.5 rounded select-all font-mono text-[11px] text-emerald-400 border border-stone-800 break-all">
                  {typeof window !== 'undefined' ? window.location.origin : ''}/api/line/webhook
                </div>
              </li>
              <li>
                <strong className="text-stone-300">極重要關鍵：</strong>確保下方欄位{' '}
                <strong className="text-amber-400 font-bold">Use webhook</strong> 的開關已經打開 (
                <strong className="text-emerald-400 font-semibold">Enabled</strong>)！預設往往是關閉。
              </li>
              <li>
                確認 Vercel Environment Variables（或本機 <code className="text-stone-300">.env</code>）設定的{' '}
                <strong className="text-stone-300">LINE_CHANNEL_SECRET</strong> 是{' '}
                <strong className="text-orange-400">32 字元的 Channel Secret</strong> 密鑰（而非 Channel ID 或 Token；若簽名校驗失敗，日誌會顯示 status 401）。
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
