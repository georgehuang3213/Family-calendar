import React from 'react';
import { format } from 'date-fns';
import { Zap, X } from 'lucide-react';
import { FAMILY_MEMBERS, MEMBER_COLORS } from '../../shared/constants';
import type { QuickAddPreset } from '../types';

interface QuickSelectModalProps {
  preset: QuickAddPreset | null;
  selectedDay: Date;
  onSelectMember: (member: string, preset: QuickAddPreset) => void;
  onClose: () => void;
}

export function QuickSelectModal({ preset, selectedDay, onSelectMember, onClose }: QuickSelectModalProps) {
  if (!preset) return null;

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
            <Zap size={18} className="text-amber-500" />
            <h3 className="text-sm font-black text-stone-900 dark:text-stone-100 uppercase tracking-widest">
              快速{preset.title} ({format(selectedDay, 'MM/dd')})
            </h3>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">
          <p className="text-[11px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-4">
            選擇要{preset.title}的成員：
          </p>
          <div className="grid grid-cols-2 gap-2">
            {FAMILY_MEMBERS.map((member) => (
              <button
                key={member}
                onClick={() => onSelectMember(member, preset)}
                className="px-4 py-3 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 bg-white dark:bg-stone-800 hover:bg-stone-50 dark:hover:bg-stone-700 active:scale-[0.98]"
                style={{
                  borderColor: MEMBER_COLORS[member] || '#4F46E5',
                  color: MEMBER_COLORS[member] || '#4F46E5',
                }}
              >
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: MEMBER_COLORS[member] || '#4F46E5' }} />
                {member}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
