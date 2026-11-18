import React from 'react';
import { Settings, Trash2, X } from 'lucide-react';
import type { QuickAddPreset } from '../types';

interface ManagePresetsModalProps {
  isOpen: boolean;
  presets: QuickAddPreset[];
  newPresetTitle: string;
  isSaving: boolean;
  onNewTitleChange: (value: string) => void;
  onAddPreset: () => void;
  onRemovePreset: (id: string) => void;
  onSave: () => void;
  onClose: () => void;
}

export function ManagePresetsModal({
  isOpen,
  presets,
  newPresetTitle,
  isSaving,
  onNewTitleChange,
  onAddPreset,
  onRemovePreset,
  onSave,
  onClose,
}: ManagePresetsModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-stone-900 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-200 border border-stone-100 dark:border-stone-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-orange-600" />
            <h3 className="text-sm font-black text-stone-900 dark:text-stone-100 uppercase tracking-widest">
              管理一鍵新增選項
            </h3>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300">
            <X size={20} />
          </button>
        </div>

        <div className="p-5">
          <div className="flex flex-col gap-2 mb-4 max-h-60 overflow-y-auto">
            {presets.map((preset) => (
              <div
                key={preset.id}
                className="flex items-center justify-between px-3.5 py-2.5 bg-stone-50 dark:bg-stone-800 rounded-xl border border-stone-100 dark:border-stone-700"
              >
                <span className="font-bold text-sm text-stone-700 dark:text-stone-200">{preset.title}</span>
                <button
                  onClick={() => onRemovePreset(preset.id)}
                  className="text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                  title="刪除"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {presets.length === 0 && (
              <p className="text-xs text-stone-400 text-center py-6">目前沒有任何選項，至少要新增一個</p>
            )}
          </div>

          <div className="flex gap-2 mb-4">
            <input
              value={newPresetTitle}
              onChange={(e) => onNewTitleChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onAddPreset();
                }
              }}
              placeholder="例如：加班"
              maxLength={20}
              className="flex-1 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl px-3.5 py-2.5 text-sm font-medium text-stone-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-orange-500"
            />
            <button
              onClick={onAddPreset}
              disabled={!newPresetTitle.trim()}
              className="px-4 rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 font-bold text-sm hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              新增
            </button>
          </div>

          <button
            onClick={onSave}
            disabled={isSaving}
            className="w-full bg-orange-600 text-white rounded-xl py-2.5 font-bold text-sm hover:bg-orange-700 transition-colors disabled:opacity-50"
          >
            {isSaving ? '儲存中...' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  );
}
