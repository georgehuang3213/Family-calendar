import React from 'react';
import { X } from 'lucide-react';
import { FAMILY_MEMBERS, MEMBER_COLORS, LEAVE_TITLES } from '../../shared/constants';
import { cn, getLunarDate, safeParseISO } from '../utils/calendar';
import type { EventFormState } from '../types';

interface EventModalProps {
  isOpen: boolean;
  isElderlyMode: boolean;
  editingEventId: string | number | null;
  newEvent: EventFormState;
  onChange: React.Dispatch<React.SetStateAction<EventFormState>>;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export function EventModal({
  isOpen,
  isElderlyMode,
  editingEventId,
  newEvent,
  onChange,
  onSubmit,
  onClose,
}: EventModalProps) {
  if (!isOpen) return null;

  const isLeavePresetTitle = (LEAVE_TITLES as readonly string[]).includes(newEvent.title || '');
  // Keep end_date / time inputs visible if an existing event already has multi-day span or time set.
  const showEndAndTime =
    !isLeavePresetTitle ||
    (Boolean(newEvent.end_date) && newEvent.end_date > newEvent.start_date) ||
    Boolean(newEvent.start_time || newEvent.end_time);

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-md z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white dark:bg-stone-900 rounded-t-3xl md:rounded-2xl shadow-2xl w-full md:max-w-md overflow-hidden animate-in slide-in-from-bottom md:zoom-in duration-300 max-h-[90vh] flex flex-col border-t md:border border-stone-100 dark:border-stone-800">
        <div className="w-10 h-1 bg-stone-300 dark:bg-stone-700 rounded-full mx-auto mt-2.5 mb-0.5 md:hidden shrink-0" />
        <div className="px-5 py-3.5 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between bg-stone-50/50 dark:bg-stone-800/50 shrink-0">
          <div className="flex flex-col">
            <h2 className={cn('font-black tracking-tight text-stone-900 dark:text-stone-100', isElderlyMode ? 'text-3xl' : 'text-base md:text-lg')}>
              {editingEventId ? '編輯活動' : '新增活動'}
              <span className={cn('text-stone-400 dark:text-stone-500 font-medium ml-2', isElderlyMode ? 'text-xl' : 'text-xs')}>
                農曆 {getLunarDate(safeParseISO(newEvent.start_date))}
              </span>
            </h2>
            {editingEventId && (
              <span className={cn('text-stone-400 dark:text-stone-500 font-medium mt-0.5', isElderlyMode ? 'text-lg' : 'text-[11px]')}>
                原始日期: {newEvent.start_date}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className={cn(
              'flex items-center justify-center bg-stone-200 dark:bg-stone-800 rounded-full text-stone-600 dark:text-stone-400 hover:bg-stone-300 dark:hover:bg-stone-700 transition-colors',
              isElderlyMode ? 'w-12 h-12' : 'w-8 h-8'
            )}
          >
            <X size={isElderlyMode ? 28 : 18} />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          <form onSubmit={onSubmit} className={cn('space-y-4', isElderlyMode && 'space-y-6')}>
            <div>
              <label className={cn('block font-black text-stone-500 dark:text-stone-400 uppercase tracking-widest mb-1.5', isElderlyMode ? 'text-xl' : 'text-xs')}>
                活動名稱
              </label>
              <input
                required
                type="text"
                value={newEvent.title || ''}
                onChange={(e) => {
                  const title = e.target.value;
                  onChange((prev) => {
                    const isLeave = (LEAVE_TITLES as readonly string[]).includes(title);
                    if (isLeave && !editingEventId) {
                      return {
                        ...prev,
                        title,
                        end_date: prev.start_date,
                        start_time: '',
                        end_time: '',
                        time: '',
                      };
                    }
                    return { ...prev, title };
                  });
                }}
                className={cn(
                  'w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all font-medium text-stone-900 dark:text-stone-100',
                  isElderlyMode ? 'px-6 py-4 text-2xl' : 'px-4 py-2.5 text-sm'
                )}
                placeholder="例如：家族聚餐"
              />
            </div>

            <div className={cn('grid gap-3', showEndAndTime ? 'grid-cols-2' : 'grid-cols-1')}>
              <div>
                <label className={cn('block font-black text-stone-500 dark:text-stone-400 uppercase tracking-widest mb-1.5', isElderlyMode ? 'text-xl' : 'text-xs')}>
                  日期
                </label>
                <input
                  required
                  type="date"
                  value={newEvent.start_date || ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    onChange((prev) => ({
                      ...prev,
                      start_date: v,
                      end_date: prev.end_date === prev.start_date || prev.end_date < v ? v : prev.end_date,
                    }));
                  }}
                  className={cn(
                    'w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all font-medium text-stone-900 dark:text-stone-100',
                    isElderlyMode ? 'px-6 py-4 text-2xl' : 'px-4 py-2.5 text-sm'
                  )}
                />
              </div>
              {showEndAndTime && (
                <div>
                  <label className={cn('block font-black text-stone-500 dark:text-stone-400 uppercase tracking-widest mb-1.5', isElderlyMode ? 'text-xl' : 'text-xs')}>
                    結束日期
                  </label>
                  <input
                    required
                    type="date"
                    value={newEvent.end_date || ''}
                    onChange={(e) => onChange((prev) => ({ ...prev, end_date: e.target.value }))}
                    className={cn(
                      'w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all font-medium text-stone-900 dark:text-stone-100',
                      isElderlyMode ? 'px-6 py-4 text-2xl' : 'px-4 py-2.5 text-sm'
                    )}
                  />
                </div>
              )}
            </div>

            {newEvent.start_date && newEvent.end_date && newEvent.end_date > newEvent.start_date && (
              <p className={cn('font-bold text-orange-600 dark:text-orange-400', isElderlyMode ? 'text-lg' : 'text-xs')}>
                📅 跨{' '}
                {Math.round(
                  (safeParseISO(newEvent.end_date).getTime() - safeParseISO(newEvent.start_date).getTime()) / 86400000
                ) + 1}{' '}
                天
              </p>
            )}

            {showEndAndTime && (
              <div className="space-y-2">
                {editingEventId && newEvent.time && !newEvent.start_time && !newEvent.end_time && (
                  <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/40 text-xs">
                    <span className="font-bold text-amber-800 dark:text-amber-300 truncate">
                      原時間文字：{newEvent.time}
                    </span>
                    <button
                      type="button"
                      onClick={() => onChange((prev) => ({ ...prev, time: '' }))}
                      className="text-[11px] font-black text-rose-600 dark:text-rose-400 hover:underline shrink-0"
                    >
                      清除時間
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={cn('block font-black text-stone-500 dark:text-stone-400 uppercase tracking-widest mb-1.5', isElderlyMode ? 'text-xl' : 'text-xs')}>
                      開始時間 (選填)
                    </label>
                    <input
                      type="time"
                      value={newEvent.start_time || ''}
                      onChange={(e) => onChange((prev) => ({ ...prev, start_time: e.target.value }))}
                      className={cn(
                        'w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all font-medium text-stone-900 dark:text-stone-100',
                        isElderlyMode ? 'px-6 py-4 text-2xl' : 'px-4 py-2.5 text-sm'
                      )}
                    />
                  </div>
                  <div>
                    <label className={cn('block font-black text-stone-500 dark:text-stone-400 uppercase tracking-widest mb-1.5', isElderlyMode ? 'text-xl' : 'text-xs')}>
                      結束時間 (選填)
                    </label>
                    <input
                      type="time"
                      value={newEvent.end_time || ''}
                      onChange={(e) => onChange((prev) => ({ ...prev, end_time: e.target.value }))}
                      className={cn(
                        'w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all font-medium text-stone-900 dark:text-stone-100',
                        isElderlyMode ? 'px-6 py-4 text-2xl' : 'px-4 py-2.5 text-sm'
                      )}
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className={cn('block font-black text-stone-500 dark:text-stone-400 uppercase tracking-widest mb-1.5', isElderlyMode ? 'text-xl' : 'text-xs')}>
                參與成員
              </label>
              <div className="flex flex-wrap gap-2">
                {FAMILY_MEMBERS.map((member) => (
                  <button
                    key={member}
                    type="button"
                    onClick={() =>
                      onChange((prev) => ({
                        ...prev,
                        member_name: member,
                        color: MEMBER_COLORS[member] || '#4F46E5',
                      }))
                    }
                    className={cn(
                      'rounded-full font-bold transition-all flex items-center gap-1.5 border',
                      isElderlyMode ? 'px-6 py-3 text-xl' : 'px-3 py-1.5 text-xs',
                      newEvent.member_name === member
                        ? 'bg-stone-800 dark:bg-stone-100 text-white dark:text-stone-900 border-stone-800 dark:border-stone-100 shadow-sm'
                        : 'bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700'
                    )}
                  >
                    <div
                      className={cn('rounded-full', isElderlyMode ? 'w-4 h-4' : 'w-2 h-2')}
                      style={{ backgroundColor: MEMBER_COLORS[member] || '#4F46E5' }}
                    />
                    {member}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={cn('block font-black text-stone-500 dark:text-stone-400 uppercase tracking-widest mb-1.5', isElderlyMode ? 'text-xl' : 'text-xs')}>
                隨行人員 (選填)
              </label>
              <div className="flex flex-wrap gap-2">
                {FAMILY_MEMBERS.map((member) => {
                  const currentList = newEvent.companions ? newEvent.companions.split(',').filter(Boolean) : [];
                  const isSelected = currentList.includes(member);
                  return (
                    <button
                      key={member}
                      type="button"
                      onClick={() => {
                        const next = isSelected
                          ? currentList.filter((c) => c !== member)
                          : [...currentList, member];
                        onChange((prev) => ({ ...prev, companions: next.join(',') }));
                      }}
                      className={cn(
                        'rounded-full font-bold transition-all flex items-center gap-1.5 border',
                        isElderlyMode ? 'px-6 py-3 text-xl' : 'px-3 py-1.5 text-xs',
                        isSelected
                          ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 shadow-sm'
                          : 'bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700'
                      )}
                    >
                      <div
                        className={cn('rounded-full', isElderlyMode ? 'w-4 h-4' : 'w-2 h-2')}
                        style={{ backgroundColor: MEMBER_COLORS[member] || '#4F46E5' }}
                      />
                      {member}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className={cn('block font-black text-stone-500 dark:text-stone-400 uppercase tracking-widest mb-1.5', isElderlyMode ? 'text-xl' : 'text-xs')}>
                備註 (選填)
              </label>
              <textarea
                value={newEvent.description || ''}
                onChange={(e) => onChange((prev) => ({ ...prev, description: e.target.value }))}
                className={cn(
                  'w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all resize-none font-medium text-stone-900 dark:text-stone-100',
                  isElderlyMode ? 'px-6 py-4 text-2xl min-h-[120px]' : 'px-4 py-2.5 text-sm min-h-[80px]'
                )}
                placeholder="活動細節..."
              />
            </div>

            <div className="flex items-center gap-3 py-2.5 px-3 bg-amber-50/50 dark:bg-amber-900/10 rounded-xl border border-amber-100/50 dark:border-amber-900/20">
              <div className="flex-1">
                <label className={cn('block font-black text-amber-700 dark:text-amber-500 uppercase tracking-widest', isElderlyMode ? 'text-xl' : 'text-xs')}>
                  🚀 標記為重要行程
                </label>
                <p className={cn('text-amber-600/70 dark:text-amber-500/60 font-bold', isElderlyMode ? 'text-lg' : 'text-[11px]')}>
                  此行程將置頂顯示，並於開始前 1 小時發送 LINE 重要通知
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(newEvent.is_important)}
                onClick={() => onChange((prev) => ({ ...prev, is_important: !prev.is_important }))}
                className={cn(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
                  newEvent.is_important ? 'bg-amber-500' : 'bg-stone-200 dark:bg-stone-700'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                    newEvent.is_important ? 'translate-x-6' : 'translate-x-1'
                  )}
                />
              </button>
            </div>

            <div className="pt-2 pb-6 md:pb-2">
              <button
                type="submit"
                className={cn(
                  'w-full bg-orange-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-orange-700 active:scale-[0.98] transition-all shadow-lg shadow-orange-200 dark:shadow-none',
                  isElderlyMode ? 'py-6 text-3xl' : 'py-3.5 text-sm'
                )}
              >
                {editingEventId ? '更新活動' : '儲存活動'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
