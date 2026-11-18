import React from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, User, Clock, Filter, Edit, Trash2, Plus, X } from 'lucide-react';
import { getLunarDate, formatTimeDisplay, WEATHER_DESCRIPTIONS } from '../utils/calendar';
import { WEATHER_ICONS, getEventIcon } from '../utils/icons';
import type { CalendarEvent, DayWeather } from '../types';

interface DayEventsModalProps {
  isOpen: boolean;
  selectedDay: Date;
  events: CalendarEvent[];
  weather?: DayWeather;
  onClose: () => void;
  onAddNew: () => void;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
}

export function DayEventsModal({
  isOpen,
  selectedDay,
  events,
  weather,
  onClose,
  onAddNew,
  onEdit,
  onDelete,
}: DayEventsModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-stone-900/40 backdrop-blur-sm transition-opacity p-0 md:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-stone-900 w-full md:w-full md:max-w-sm rounded-t-3xl md:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-full md:slide-in-from-bottom-10 md:fade-in duration-300 max-h-[80vh] flex flex-col border-t md:border border-stone-100 dark:border-stone-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between sticky top-0 bg-white dark:bg-stone-900 z-10">
          <div className="flex flex-col">
            <h3 className="text-base font-black text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <div className="w-1.5 h-4 bg-orange-600 rounded-full" />
              {format(selectedDay, 'MM月dd日')} 活動
              <span className="text-stone-400 dark:text-stone-500 font-medium text-xs ml-1">
                農曆 {getLunarDate(selectedDay)}
              </span>
            </h3>
            {weather && (
              <div className="flex items-center gap-1.5 mt-0.5 ml-3.5">
                <span className="text-stone-400 dark:text-stone-500">{WEATHER_ICONS[weather.code]}</span>
                <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400">
                  {WEATHER_DESCRIPTIONS[weather.code]} · {Math.round(weather.min)}°C ~ {Math.round(weather.max)}°C
                  {weather.pop !== undefined && (
                    <span className="ml-1.5 text-blue-500 dark:text-blue-400 font-black">
                      (降雨 {weather.pop}%)
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 rounded-full hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-3">
          {events.length === 0 ? (
            <div className="bg-stone-50 dark:bg-stone-800/50 border border-dashed border-stone-200 dark:border-stone-700 rounded-2xl p-10 text-center">
              <div className="w-12 h-12 bg-white dark:bg-stone-800 rounded-full flex items-center justify-center mx-auto mb-3 text-stone-300 dark:text-stone-600 shadow-sm">
                <CalendarIcon size={24} />
              </div>
              <p className="text-stone-400 dark:text-stone-500 text-sm font-bold">這天沒有安排活動</p>
              <button
                onClick={onAddNew}
                className="mt-4 text-xs font-black text-orange-600 dark:text-orange-400 hover:underline"
              >
                + 點擊新增活動
              </button>
            </div>
          ) : (
            <>
              {events.map((event) => (
                <div
                  key={event.id}
                  className="bg-white dark:bg-stone-800 rounded-2xl p-4 shadow-sm border border-stone-100 dark:border-stone-700 flex items-start gap-4"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner"
                    style={{
                      backgroundColor: `${event.color || '#4F46E5'}15`,
                      color: event.color || '#4F46E5',
                    }}
                  >
                    {getEventIcon(event.title || '', 20) || <User size={20} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className="text-[11px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg flex items-center gap-1.5 w-fit"
                        style={{
                          backgroundColor: `${event.color || '#4F46E5'}15`,
                          color: event.color || '#4F46E5',
                        }}
                      >
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: event.color || '#4F46E5' }} />
                        {event.member_name}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onEdit(event)}
                          className="w-7 h-7 flex items-center justify-center text-stone-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-full transition-all"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={() => onDelete(event)}
                          className="w-7 h-7 flex items-center justify-center text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-full transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <h4 className="font-black text-stone-900 dark:text-stone-100 text-base truncate">{event.title}</h4>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      {event.time && (
                        <div className="flex items-center gap-1 text-[12px] font-bold text-orange-600 dark:text-orange-400 bg-orange-50/50 dark:bg-orange-900/20 px-1.5 py-0.5 rounded-md">
                          <Clock size={12} />
                          {formatTimeDisplay(event.time)}
                        </div>
                      )}
                      {event.description && (
                        <div className="flex items-center gap-1 text-[12px] font-medium text-stone-500 dark:text-stone-400">
                          <Filter size={12} className="opacity-50" />
                          <span className="truncate max-w-[150px]">{event.description}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <button
                onClick={onAddNew}
                className="w-full py-3 mt-2 border-2 border-dashed border-stone-200 dark:border-stone-700 rounded-xl text-xs font-black text-stone-400 dark:text-stone-500 hover:text-orange-600 dark:hover:text-orange-400 hover:border-orange-200 dark:hover:border-orange-800 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-all flex items-center justify-center gap-2"
              >
                <Plus size={16} /> 新增活動至這天
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
