import React from 'react';
import { Trash2 } from 'lucide-react';
import { cn } from '../utils/calendar';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  isElderlyMode: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmModal({ isOpen, isElderlyMode, onCancel, onConfirm }: DeleteConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-md z-[60] flex items-center justify-center p-4">
      <div
        className={cn(
          'bg-white dark:bg-stone-900 rounded-2xl shadow-2xl w-full overflow-hidden animate-in zoom-in duration-200 border border-stone-100 dark:border-stone-800',
          isElderlyMode ? 'max-w-md' : 'max-w-[280px]'
        )}
      >
        <div className={cn('text-center', isElderlyMode ? 'p-8' : 'p-5')}>
          <div
            className={cn(
              'bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center mx-auto mb-3 text-rose-600 dark:text-rose-400',
              isElderlyMode ? 'w-20 h-20' : 'w-12 h-12'
            )}
          >
            <Trash2 size={isElderlyMode ? 40 : 24} />
          </div>
          <h3 className={cn('font-black text-stone-900 dark:text-stone-100 mb-1', isElderlyMode ? 'text-3xl' : 'text-base')}>
            確定要刪除嗎？
          </h3>
          <p className={cn('text-stone-500 dark:text-stone-400 font-medium mb-5', isElderlyMode ? 'text-xl' : 'text-[12px]')}>
            此操作將無法復原。
          </p>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className={cn(
                'flex-1 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 rounded-xl font-black uppercase tracking-widest hover:bg-stone-200 dark:hover:bg-stone-700 transition-all',
                isElderlyMode ? 'px-6 py-4 text-2xl' : 'px-3 py-2 text-[11px]'
              )}
            >
              取消
            </button>
            <button
              onClick={onConfirm}
              className={cn(
                'flex-1 bg-rose-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-rose-700 transition-all shadow-lg shadow-rose-200 dark:shadow-none',
                isElderlyMode ? 'px-6 py-4 text-2xl' : 'px-3 py-2 text-[11px]'
              )}
            >
              刪除
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
