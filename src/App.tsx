import React, { useState, useEffect } from 'react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths,
  parseISO,
  isWithinInterval,
  startOfDay
} from 'date-fns';
import { 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  Plus, 
  Calendar as CalendarIcon, 
  User, 
  Clock,
  Filter,
  X,
  AlertCircle,
  Edit,
  Trash2,
  Zap,
  CheckCircle2,
  Info,
  AlertTriangle,
  Utensils,
  Coffee,
  Briefcase,
  ShoppingCart,
  Car,
  Heart,
  Star,
  Plane,
  Music
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Event {
  id: string | number;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  time?: string;
  member_name: string;
  color: string;
}

const FAMILY_MEMBERS = ['全家', '江雪卿', '黃喬裕', '陳愉婷', '黃宣綾', '黃宣綸', '黃郁婷', '郭力維', '黃郁慈', '郭品佑', '郭品彤'];

const HOLIDAYS_2026: Record<string, string> = {
  '2026-01-01': '元旦',
  '2026-02-16': '除夕',
  '2026-02-17': '春節',
  '2026-02-18': '春節',
  '2026-02-19': '春節',
  '2026-02-20': '春節',
  '2026-02-21': '春節',
  '2026-02-28': '和平紀念日',
  '2026-04-04': '兒童節/清明節',
  '2026-05-01': '勞動節',
  '2026-06-19': '端午節',
  '2026-09-25': '中秋節',
  '2026-10-10': '國慶日',
};

const MEMBER_COLORS: Record<string, string> = {
  '全家': '#111827', // Dark Gray / Black
  '江雪卿': '#E11D48', // Rose
  '黃喬裕': '#2563EB', // Blue
  '陳愉婷': '#16A34A', // Green
  '黃宣綾': '#D97706', // Amber
  '黃宣綸': '#9333EA', // Purple
  '黃郁婷': '#0891B2', // Cyan
  '郭力維': '#BE185D', // Pink/Magenta
  '黃郁慈': '#EA580C', // Orange
  '郭品佑': '#65A30D', // Lime/Olive
  '郭品彤': '#0D9488', // Teal
};
const COLORS = [
  { name: 'Indigo', value: '#4F46E5' },
  { name: 'Rose', value: '#E11D48' },
  { name: 'Emerald', value: '#10B981' },
  { name: 'Amber', value: '#F59E0B' },
  { name: 'Sky', value: '#0EA5E9' },
  { name: 'Violet', value: '#8B5CF6' },
  { name: 'Pink', value: '#EC4899' },
  { name: 'Cyan', value: '#06B6D4' },
  { name: 'Orange', value: '#F97316' },
  { name: 'Lime', value: '#84CC16' },
];

const getEventIcon = (title: string | undefined | null, size: number = 10) => {
  if (!title || typeof title !== 'string') return null;
  const t = title.toLowerCase();
  if (t.includes('餐') || t.includes('吃') || t.includes('飯')) return <Utensils size={size} />;
  if (t.includes('休') || t.includes('假') || t.includes('咖')) return <Coffee size={size} />;
  if (t.includes('班') || t.includes('工')) return <Briefcase size={size} />;
  if (t.includes('買') || t.includes('購')) return <ShoppingCart size={size} />;
  if (t.includes('車') || t.includes('行')) return <Car size={size} />;
  if (t.includes('醫') || t.includes('病') || t.includes('看')) return <Heart size={size} />;
  if (t.includes('玩') || t.includes('遊')) return <Star size={size} />;
  if (t.includes('飛') || t.includes('旅')) return <Plane size={size} />;
  if (t.includes('唱') || t.includes('音')) return <Music size={size} />;
  return null;
};

export default function App() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<Event[]>([]);
  const [storageSource, setStorageSource] = useState<string>('local');
  const [warning, setWarning] = useState<string | null>(null);
  const [configStatus, setConfigStatus] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filterMember, setFilterMember] = useState<string>('全部');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [editingEventId, setEditingEventId] = useState<string | number | null>(null);
  const [isQuickLeaveEnabled, setIsQuickLeaveEnabled] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<string | number | null>(null);
  const [eventToDeleteObj, setEventToDeleteObj] = useState<Event | null>(null);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [isDayModalOpen, setIsDayModalOpen] = useState(false);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  };

  const handleQuickLeave = async (member: string) => {
    const eventColor = MEMBER_COLORS[member] || '#4F46E5';
    const leaveEvent = {
      title: '排休',
      description: '',
      start_date: format(selectedDay, 'yyyy-MM-dd'),
      end_date: format(selectedDay, 'yyyy-MM-dd'),
      time: '',
      member_name: member,
      color: eventColor,
      action: 'create',
    };

    const tempId = Date.now();
    const optimisticEvent = { ...leaveEvent, id: tempId };
    
    const previousEvents = [...events];
    setEvents([...events, optimisticEvent]);
    showToast(`已快速新增 ${member} 排休`);
    setIsDayModalOpen(false);

    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leaveEvent)
      });
      
      const contentType = res.headers.get("content-type");
      let result;
      if (contentType && contentType.includes("application/json")) {
        result = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`伺服器傳回非 JSON 回應: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
      }

      if (!res.ok) throw new Error(result.error || '快速新增失敗');
      
      if (result.id) {
        setEvents(prev => prev.map(e => String(e.id) === String(tempId) ? { ...e, id: result.id } : e));
      }
      
      fetchEvents(false);
    } catch (err: any) {
      setEvents(previousEvents);
      showToast(`快速新增失敗: ${err.message}`, 'error');
    }
  };

  // Form state
  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    start_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: format(new Date(), 'yyyy-MM-dd'),
    time: '',
    member_name: FAMILY_MEMBERS[0],
    color: MEMBER_COLORS[FAMILY_MEMBERS[0]],
    companions: '',
  });

  useEffect(() => {
    fetchEvents();
    fetchConfigStatus();
  }, []);

  const fetchConfigStatus = async () => {
    try {
      const res = await fetch('/api/config-status');
      if (res.ok) {
        const data = await res.json();
        setConfigStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch config status');
    }
  };

  const fetchEvents = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const res = await fetch('/api/events');
      
      const contentType = res.headers.get("content-type");
      let data;
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`伺服器傳回非 JSON 回應: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
      }

      if (!res.ok) {
        throw new Error(data.error || '無法取得活動資料');
      }
      
      // 確保所有 ID 都轉換為字串
      const processedEvents = (data.events || []).map((event: Event) => ({
        ...event,
        id: String(event.id)
      }));
      
      setEvents(processedEvents);
      setStorageSource(data.source || 'local');
      setWarning(data.warning || null);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      // 如果發生錯誤，自動顯示除錯資訊以便使用者排查
      setShowDebug(true);
      fetchConfigStatus();
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handleEditClick = (event: Event) => {
    setEditingEventId(event.id);
    
    // 確保日期格式為 YYYY-MM-DD 以便在 input[type="date"] 中顯示
    const normalizeDate = (d: any) => {
      if (!d) return format(new Date(), 'yyyy-MM-dd');
      
      const s = String(d);
      
      // 處理 ISO 格式 (例如 2026-03-18T16:00:00.000Z)
      if (s.includes('T')) {
        try {
          const date = new Date(s);
          if (!isNaN(date.getTime())) {
            // 使用本地時間格式化，避免時區偏移導致日期跳掉
            return format(date, 'yyyy-MM-dd');
          }
        } catch (e) {
          return s.split('T')[0];
        }
      }
      
      // 處理 YYYY/MM/DD 或其他格式
      return s.replace(/\//g, '-').split(' ')[0];
    };

    // 確保時間格式為 HH:mm 以便在 input[type="time"] 中顯示
    const normalizeTime = (t: any, dateStr?: any) => {
      if (!t) {
        // 如果沒有時間，但日期字串包含時間資訊 (ISO 格式)
        if (dateStr && String(dateStr).includes('T')) {
          try {
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
              return format(date, 'HH:mm');
            }
          } catch (e) {}
        }
        return '';
      }
      
      const s = String(t);
      if (s.includes('T')) {
        try {
          const date = new Date(s);
          if (!isNaN(date.getTime())) {
            return format(date, 'HH:mm');
          }
        } catch (e) {}
      }
      // 處理 "14:30:00" -> "14:30"
      if (s.match(/^\d{2}:\d{2}:\d{2}$/)) {
        return s.substring(0, 5);
      }
      // 處理 "14:30"
      if (s.match(/^\d{2}:\d{2}$/)) {
        return s;
      }
      return s;
    };
    
    const startDate = normalizeDate(event.start_date);
    const endDate = normalizeDate(event.end_date || event.start_date);
    const eventTime = normalizeTime(event.time, event.start_date);
    
    setNewEvent({
      title: event.title,
      description: event.description || '',
      start_date: startDate,
      end_date: endDate,
      time: eventTime,
      member_name: event.member_name,
      color: event.color,
      companions: (event as any).companions || '',
    });
    setIsModalOpen(true);
  };

  const handleDeleteEvent = (event: Event) => {
    // 確保傳入的是完整的 event 物件以進行標題檢查
    setEventToDelete(event.id);
    // 這裡我們暫存 event 物件以便在 executeDelete 中使用
    setEventToDeleteObj(event);
    setIsDeleteModalOpen(true);
  };

  const executeDelete = async () => {
    if (!eventToDelete || !eventToDeleteObj) return;
    
    const previousEvents = [...events];
    setIsDeleteModalOpen(false);
    
    // Optimistic update
    setEvents(events.filter(e => e.id !== eventToDelete));
    showToast('活動已刪除');
    
    try {
      // 使用 DELETE 方法並將 title 放入 query string
      const res = await fetch(`/api/events/${eventToDelete}?title=${encodeURIComponent(eventToDeleteObj.title)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!res.ok) throw new Error('刪除請求失敗');
      
      const result = await res.json();
      if (!result.success) throw new Error(result.error || '刪除失敗');
      
      fetchEvents(false);
    } catch (err: any) {
      setEvents(previousEvents);
      showToast(`刪除失敗: ${err.message}`, 'error');
    }
  };
  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    const eventColor = MEMBER_COLORS[newEvent.member_name] || '#4F46E5';
    const isEditing = !!editingEventId;
    
    const optimisticEvent = {
      ...newEvent,
      id: isEditing ? editingEventId : Date.now().toString(),
      color: eventColor
    };

    const previousEvents = [...events];
    
    // Optimistic update
    if (isEditing) {
      setEvents(events.map(ev => ev.id === editingEventId ? optimisticEvent : ev));
    } else {
      setEvents([...events, optimisticEvent]);
    }

    // 關閉視窗並重置
    setIsModalOpen(false);
    setEditingEventId(null);
    setNewEvent({
      title: '',
      description: '',
      start_date: format(new Date(), 'yyyy-MM-dd'),
      end_date: format(new Date(), 'yyyy-MM-dd'),
      time: '',
      member_name: FAMILY_MEMBERS[0],
      color: MEMBER_COLORS[FAMILY_MEMBERS[0]],
    });
    showToast(isEditing ? '活動已更新' : '活動已儲存');

    try {
      const url = isEditing ? `/api/events/${editingEventId}` : '/api/events';
      const method = isEditing ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...newEvent, 
          color: eventColor,
          action: isEditing ? 'update' : 'create'
        })
      });
      
      const contentType = res.headers.get("content-type");
      let result;
      if (contentType && contentType.includes("application/json")) {
        result = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`伺服器傳回非 JSON 回應: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
      }

      if (!res.ok) throw new Error(result.error || '儲存失敗');
      
      // Update with real ID if it was a create
      if (!isEditing && result.id) {
        setEvents(prev => prev.map(ev => ev.id === optimisticEvent.id ? { ...ev, id: result.id } : ev));
      }
      
      // 成功後，在背景重新抓取最新資料
      fetchEvents(false);
      
    } catch (err: any) {
      setEvents(previousEvents);
      showToast(`儲存失敗: ${err.message}`, 'error');
    }
  };

  const safeParseISO = (dateStr: string | undefined | null) => {
    if (!dateStr || typeof dateStr !== 'string') return new Date();
    
    // Handle YYYY/MM/DD format
    const normalizedDate = dateStr.replace(/\//g, '-');
    
    try {
      const parsed = parseISO(normalizedDate);
      if (isNaN(parsed.getTime())) {
        // Try native Date parsing as fallback
        const native = new Date(normalizedDate);
        return isNaN(native.getTime()) ? new Date() : native;
      }
      return parsed;
    } catch (e) {
      const native = new Date(normalizedDate);
      return isNaN(native.getTime()) ? new Date() : native;
    }
  };

  const formatTimeDisplay = (timeStr: string | undefined | null) => {
    if (!timeStr) return '';
    const s = String(timeStr);
    if (s.includes('T')) {
      try {
        const date = new Date(s);
        if (!isNaN(date.getTime())) {
          return format(date, 'HH:mm');
        }
      } catch (e) {}
    }
    if (s.match(/^\d{2}:\d{2}:\d{2}$/)) {
      return s.substring(0, 5);
    }
    return s;
  };

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const filteredEvents = events.filter(event => 
    filterMember === '全部' || event.member_name === filterMember
  );

  const selectedDayEvents = filteredEvents.filter(e => {
    try {
      const start = startOfDay(safeParseISO(e.start_date));
      const end = startOfDay(safeParseISO(e.end_date));
      const current = startOfDay(selectedDay);
      
      const intervalStart = start < end ? start : end;
      const intervalEnd = start < end ? end : start;
      
      return isWithinInterval(current, { start: intervalStart, end: intervalEnd });
    } catch (err) {
      return false;
    }
  });

  const upcomingEvents = filteredEvents.filter(e => {
    try {
      const end = startOfDay(safeParseISO(e.end_date));
      const today = startOfDay(new Date());
      return end >= today;
    } catch (err) {
      return false;
    }
  }).sort((a, b) => {
    const dateA = safeParseISO(a.start_date).getTime();
    const dateB = safeParseISO(b.start_date).getTime();
    if (dateA !== dateB) return dateA - dateB;
    const aIsLeave = String(a.title || '').includes('休') || String(a.title || '').includes('假');
    const bIsLeave = String(b.title || '').includes('休') || String(b.title || '').includes('假');
    if (aIsLeave && !bIsLeave) return -1;
    if (!aIsLeave && bIsLeave) return 1;
    return 0;
  }).slice(0, 10);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans pb-24 md:pb-0">
      {/* Header - Simplified for Mobile */}
      <header className="bg-white border-b border-stone-200 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-8 h-8 md:w-10 md:h-10 bg-indigo-600 rounded-lg md:rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200 flex-shrink-0">
            <CalendarIcon size={16} className="md:hidden" />
            <CalendarIcon size={24} className="hidden md:block" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-sm md:text-xl font-black tracking-tight truncate">家庭行事曆</h1>
            <div className="flex items-center gap-1">
              <div className={cn(
                "w-1 h-1 rounded-full",
                storageSource === 'local' ? "bg-amber-500" : "bg-emerald-500"
              )} />
              <span className="text-[8px] font-bold text-stone-400 uppercase tracking-tighter">
                {storageSource === 'local' ? '本地' : '雲端'}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5 md:gap-4">
          <button 
            onClick={() => fetchEvents(true)}
            className="p-2 text-stone-500 hover:text-indigo-600 transition-colors bg-white border border-stone-200 rounded-lg shadow-sm"
            title="重新整理"
          >
            <Zap size={16} className={cn(loading && "animate-pulse text-indigo-500")} />
          </button>

          <div className="flex items-center bg-stone-100 rounded-lg p-0.5 md:p-1">
            <button 
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
              className="p-1 md:p-1 hover:bg-white hover:shadow-sm rounded-md transition-all"
              title="上個月"
            >
              <ChevronLeft size={18} className="md:w-[18px] md:h-[18px]" />
            </button>
            <span className="px-1.5 md:px-4 font-bold text-xs md:text-base min-w-[70px] md:min-w-[120px] text-center">
              {format(currentDate, 'yyyy/MM')}
            </span>
            <button 
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
              className="p-1 md:p-1 hover:bg-white hover:shadow-sm rounded-md transition-all"
              title="下個月"
            >
              <ChevronRight size={18} className="md:w-[18px] md:h-[18px]" />
            </button>
          </div>
          
          <button 
            onClick={() => {
              setCurrentDate(new Date());
              setSelectedDay(new Date());
            }}
            className="flex items-center justify-center bg-white border border-stone-200 px-2 md:px-3 py-1.5 md:py-2 rounded-lg text-[10px] md:text-xs font-bold text-stone-600 hover:bg-stone-50 transition-colors shadow-sm"
          >
            今天
          </button>
          
          <button 
            onClick={() => {
              setEditingEventId(null);
              setNewEvent({
                title: '',
                description: '',
                start_date: format(new Date(), 'yyyy-MM-dd'),
                end_date: format(new Date(), 'yyyy-MM-dd'),
                time: '',
                member_name: FAMILY_MEMBERS[0],
                color: MEMBER_COLORS[FAMILY_MEMBERS[0]],
              });
              setIsModalOpen(true);
            }}
            className="hidden md:flex bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold items-center gap-2 hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Plus size={20} />
            <span>新增活動</span>
          </button>
        </div>
      </header>

      <main className="p-4 md:p-6 max-w-7xl mx-auto">
        {/* Desktop View Toggle (Hidden on Mobile) */}
        <div className="hidden md:flex bg-stone-200 p-1 rounded-xl mb-6 w-fit">
          <button 
            onClick={() => setViewMode('calendar')}
            className={cn(
              "px-6 py-2 rounded-lg text-sm font-bold transition-all",
              viewMode === 'calendar' ? "bg-white shadow-sm text-indigo-600" : "text-stone-500"
            )}
          >
            月曆模式
          </button>
          <button 
            onClick={() => setViewMode('list')}
            className={cn(
              "px-6 py-2 rounded-lg text-sm font-bold transition-all",
              viewMode === 'list' ? "bg-white shadow-sm text-indigo-600" : "text-stone-500"
            )}
          >
            列表模式
          </button>
        </div>

        {/* Filters & Settings */}
        <div className="mb-4 md:mb-6 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-stone-500">
              <Filter size={14} />
              <span className="text-[10px] font-black uppercase tracking-widest">篩選成員</span>
            </div>
            
            <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
              {['全部', ...FAMILY_MEMBERS].map(member => (
                <button
                  key={member}
                  onClick={() => setFilterMember(member)}
                  className={cn(
                    "flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5",
                    filterMember === member 
                      ? "bg-stone-800 border-stone-800 text-white shadow-md" 
                      : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"
                  )}
                >
                  {member !== '全部' && (
                    <div 
                      className="w-2 h-2 rounded-full" 
                      style={{ backgroundColor: MEMBER_COLORS[member] || '#4F46E5' }} 
                    />
                  )}
                  {member}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setShowDebug(!showDebug)}
                className="p-1.5 text-stone-400 hover:text-stone-600 transition-colors"
                title="偵錯資訊"
              >
                <Info size={16} />
              </button>

              {/* 一鍵排休開關 */}
              <button
                onClick={() => setIsQuickLeaveEnabled(!isQuickLeaveEnabled)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all",
                  isQuickLeaveEnabled 
                    ? "bg-amber-100 text-amber-700 border border-amber-200 shadow-sm"
                    : "bg-stone-100 text-stone-500 border border-stone-200 hover:bg-stone-200"
                )}
              >
                <Zap size={12} className={isQuickLeaveEnabled ? "text-amber-500" : "text-stone-400"} />
                一鍵排休
              </button>
            </div>

            <div className="md:hidden">
              {/* Mobile View Mode Toggle */}
              <div className="flex bg-stone-100 p-0.5 rounded-lg">
                <button 
                  onClick={() => setViewMode('calendar')}
                  className={cn(
                    "px-3 py-1 rounded-md text-[10px] font-bold transition-all",
                    viewMode === 'calendar' ? "bg-white shadow-sm text-indigo-600" : "text-stone-500"
                  )}
                >
                  月曆
                </button>
                <button 
                  onClick={() => setViewMode('list')}
                  className={cn(
                    "px-3 py-1 rounded-md text-[10px] font-bold transition-all",
                    viewMode === 'list' ? "bg-white shadow-sm text-indigo-600" : "text-stone-500"
                  )}
                >
                  列表
                </button>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-xl mb-6 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle size={20} />
                <p className="text-sm font-medium">{error}</p>
              </div>
              <button 
                onClick={() => fetchEvents(true)}
                className="flex items-center gap-1 px-3 py-1 bg-red-100 hover:bg-red-200 rounded-lg text-xs font-bold transition-colors"
              >
                <Zap size={12} />
                <span>重試</span>
              </button>
            </div>
            <button 
              onClick={() => setShowDebug(!showDebug)}
              className="text-xs text-red-500 underline self-start ml-8"
            >
              {showDebug ? '隱藏除錯資訊' : '顯示除錯資訊'}
            </button>
            {showDebug && configStatus && (
              <div className="ml-8 p-3 bg-white/50 rounded-lg text-[10px] font-mono space-y-1">
                <p>Google Sheet ID: {configStatus.hasSheetId ? '✅ 已設定' : '❌ 未設定'}</p>
                <p>Service Account: {configStatus.serviceAccountEmail}</p>
                <p>Private Key: {configStatus.hasPrivateKey ? '✅ 已設定' : '❌ 未設定'}</p>
                <p>Apps Script URL: {configStatus.hasAppsScript ? '✅ 已設定' : '❌ 未設定'}</p>
                <p>SQLite 資料庫: {configStatus.sqliteAvailable ? '✅ 可用' : '❌ 不可用 (Vercel 可能限制 native 模組)'}</p>
                <p>環境: {configStatus.env?.VERCEL ? 'Vercel' : 'AI Studio / Local'} ({configStatus.env?.NODE_ENV})</p>
                {configStatus.sheetInit && (
                  <p className={cn("mt-1", configStatus.sheetInit.success ? "text-emerald-600" : "text-red-600")}>
                    試算表初始化: {configStatus.sheetInit.success ? '✅ 成功' : `❌ 失敗 (${configStatus.sheetInit.error})`}
                  </p>
                )}
                <p className="mt-2 text-stone-400">提示：請在 Vercel 專案設定中新增這些環境變數。</p>
              </div>
            )}
          </div>
        )}

        {warning && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 p-4 rounded-xl mb-6 flex items-center gap-3">
            <AlertTriangle size={20} className="text-amber-500" />
            <p className="text-sm font-medium">{warning}</p>
          </div>
        )}

        {showDebug && (
          <div className="bg-stone-900 text-stone-100 p-6 rounded-2xl mb-6 overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h3 className="font-black text-xs uppercase tracking-widest text-stone-400">偵錯資訊 (Raw Data)</h3>
                <button 
                  onClick={fetchEvents}
                  className="p-1 text-stone-500 hover:text-indigo-400 transition-colors"
                  title="重新整理"
                >
                  <Zap size={14} />
                </button>
              </div>
              <button onClick={() => setShowDebug(false)} className="text-stone-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-stone-800 p-4 rounded-xl">
                <p className="text-[10px] font-black text-stone-500 uppercase mb-2">統計資料</p>
                <div className="space-y-1 text-sm">
                  <p>總活動數: <span className="text-indigo-400 font-bold">{events.length}</span></p>
                  <p>篩選後數量: <span className="text-indigo-400 font-bold">{filteredEvents.length}</span></p>
                  <p>儲存來源: <span className="text-emerald-400 font-bold">{storageSource}</span></p>
                  {warning && <p className="text-amber-400 text-xs mt-2">警告: {warning}</p>}
                </div>
              </div>
              <div className="bg-stone-800 p-4 rounded-xl">
                <p className="text-[10px] font-black text-stone-500 uppercase mb-2">最近 5 筆活動</p>
                <div className="space-y-2">
                  {events.slice(0, 5).map(e => (
                    <div key={e.id} className="text-[10px] border-b border-stone-700 pb-1 last:border-0">
                      <p className="font-bold text-stone-200">{e.title} ({e.member_name})</p>
                      <p className="text-stone-500">{e.start_date} ~ {e.end_date}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Calendar Grid (Desktop & Mobile Calendar Mode) */}
        {(viewMode === 'calendar') && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-stone-100 bg-stone-50/50">
              {['日', '一', '二', '三', '四', '五', '六'].map(day => (
                <div key={day} className="py-2 md:py-3 text-center text-[10px] md:text-xs font-black text-stone-400 uppercase tracking-widest">
                  {day}
                </div>
              ))}
            </div>
            
            <div className="grid grid-cols-7">
              {calendarDays.map((day, i) => {
                const dayEvents = filteredEvents.filter(e => {
                  try {
                    const start = startOfDay(safeParseISO(e.start_date));
                    const end = startOfDay(safeParseISO(e.end_date));
                    const current = startOfDay(day);
                    
                    // Safety check for interval
                    const intervalStart = start < end ? start : end;
                    const intervalEnd = start < end ? end : start;
                    
                    return isWithinInterval(current, { start: intervalStart, end: intervalEnd });
                  } catch (err) {
                    console.error("Date filter error:", err);
                    return false;
                  }
                }).sort((a, b) => {
                  // Sort '排休' events to the top
                  const aTitle = String(a.title || '');
                  const bTitle = String(b.title || '');
                  const aIsLeave = aTitle.includes('休') || aTitle.includes('假');
                  const bIsLeave = bTitle.includes('休') || bTitle.includes('假');
                  if (aIsLeave && !bIsLeave) return -1;
                  if (!aIsLeave && bIsLeave) return 1;
                  return 0;
                });
                const isToday = isSameDay(day, new Date());
                const isCurrentMonth = isSameMonth(day, monthStart);
                const isSelected = isSameDay(day, selectedDay);
                const dateKey = format(day, 'yyyy-MM-dd');
                const holidayName = HOLIDAYS_2026[dateKey];

                return (
                  <div 
                    key={day.toString()} 
                    onClick={() => {
                      setSelectedDay(day);
                      if (!isQuickLeaveEnabled) {
                        setIsDayModalOpen(true);
                      }
                    }}
                    className={cn(
                      "min-h-[60px] md:min-h-[140px] p-1 md:p-2 border-r border-b border-stone-50 last:border-r-0 transition-all cursor-pointer relative",
                      !isCurrentMonth && "bg-stone-50/30",
                      isSelected && "bg-indigo-50/50 ring-2 ring-inset ring-indigo-400 z-10",
                      holidayName && "bg-rose-50/30"
                    )}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-1 md:mb-2 gap-1">
                      <span className={cn(
                        "w-7 h-7 md:w-8 md:h-8 flex items-center justify-center rounded-full text-xs md:text-sm font-bold",
                        isToday ? "bg-indigo-600 text-white shadow-md" : holidayName ? "text-rose-600" : isCurrentMonth ? "text-stone-900" : "text-stone-300"
                      )}>
                        {format(day, 'd')}
                      </span>
                      {holidayName && (
                        <span className="text-[8px] md:text-[10px] font-black text-rose-500 truncate bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                          {holidayName}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex flex-col gap-0.5 md:gap-1 overflow-hidden">
                      {/* Desktop View: Badges with Icons */}
                      <div className="hidden md:flex flex-col gap-1">
                        {dayEvents.slice(0, 4).map(event => {
                          const eventTitle = String(event.title || '無標題');
                          const isLeave = eventTitle.includes('休') || eventTitle.includes('假');
                          const icon = getEventIcon(eventTitle, 10);
                          return (
                            <div 
                              key={event.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditClick(event);
                              }}
                              style={{ 
                                backgroundColor: isLeave ? `${event.color || '#4F46E5'}25` : `${event.color || '#4F46E5'}15`, 
                                borderLeft: `3px solid ${event.color || '#4F46E5'}`,
                                color: event.color || '#4F46E5'
                              }}
                              className={cn(
                                "px-1.5 py-0.5 rounded text-[10px] font-bold truncate hover:brightness-95 transition-all flex items-center gap-1",
                                isLeave && "ring-1 ring-inset ring-white/20"
                              )}
                            >
                              {icon && <span className="shrink-0">{icon}</span>}
                              <span className="truncate">{eventTitle}</span>
                            </div>
                          );
                        })}
                        {dayEvents.length > 4 && (
                          <div className="text-[9px] text-stone-400 font-black pl-1 flex items-center gap-1">
                            <Plus size={8} /> {dayEvents.length - 4} 更多
                          </div>
                        )}
                      </div>

                      {/* Mobile View: Compact Badges for few events */}
                      <div className="md:hidden flex flex-col gap-0.5">
                        {dayEvents.slice(0, 2).map(event => {
                          const eventTitle = String(event.title || '無標題');
                          const icon = getEventIcon(eventTitle, 8);
                          return (
                            <div 
                              key={event.id}
                              style={{ 
                                backgroundColor: `${event.color || '#4F46E5'}15`, 
                                borderLeft: `2px solid ${event.color || '#4F46E5'}`,
                                color: event.color || '#4F46E5'
                              }}
                              className="px-1 py-0 rounded-[2px] text-[8px] font-black truncate flex items-center gap-0.5"
                            >
                              {icon && <span className="shrink-0">{icon}</span>}
                              <span className="truncate">{eventTitle}</span>
                            </div>
                          );
                        })}
                        {dayEvents.length > 2 && (
                          <div className="text-[8px] text-stone-400 font-black pl-1 flex items-center gap-0.5">
                            <Plus size={6} /> {dayEvents.length - 2}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 一鍵排休區塊 */}
        {viewMode === 'calendar' && isQuickLeaveEnabled && (
          <div className="mt-4 bg-white border border-amber-200 rounded-2xl p-4 shadow-sm animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={16} className="text-amber-500" />
              <h3 className="text-xs font-black text-stone-700 uppercase tracking-widest">
                快速新增排休 ({format(selectedDay, 'MM/dd')})
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {FAMILY_MEMBERS.map(member => (
                <button
                  key={member}
                  onClick={() => handleQuickLeave(member)}
                  className="px-4 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 bg-white hover:bg-stone-50"
                  style={{ borderColor: MEMBER_COLORS[member] || '#4F46E5', color: MEMBER_COLORS[member] || '#4F46E5' }}
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: MEMBER_COLORS[member] || '#4F46E5' }} />
                  {member}排休
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming Events (Below Calendar) */}
        {viewMode === 'calendar' && (
          <div className="mt-8 md:mt-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm md:text-base font-black text-stone-900 uppercase tracking-widest flex items-center gap-2">
                <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                接下來的活動
              </h3>
              <span className="text-[10px] font-bold text-stone-400 bg-stone-100 px-2 py-1 rounded-lg">
                近期 {upcomingEvents.length} 個活動
              </span>
            </div>
            
            <div className="flex overflow-x-auto gap-4 pb-6 -mx-4 px-4 md:mx-0 md:px-0 snap-x no-scrollbar">
              {upcomingEvents.length === 0 ? (
                <div className="w-full bg-white border border-dashed border-stone-200 rounded-2xl p-8 text-center shadow-sm">
                  <div className="w-12 h-12 bg-stone-50 rounded-full flex items-center justify-center mx-auto mb-3 text-stone-300">
                    <CalendarIcon size={24} />
                  </div>
                  <p className="text-stone-400 text-sm font-bold">目前沒有即將到來的活動</p>
                </div>
              ) : (
                upcomingEvents.map(event => (
                  <div key={event.id} className="snap-center shrink-0 w-[260px] md:w-[300px] bg-white rounded-2xl p-5 shadow-sm border border-stone-100 flex flex-col gap-3 hover:shadow-md transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${event.color || '#4F46E5'}15`, color: event.color || '#4F46E5' }}>
                          {getEventIcon(event.title || '', 16) || <User size={16} />}
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg flex items-center gap-1.5" style={{ backgroundColor: `${event.color || '#4F46E5'}15`, color: event.color || '#4F46E5' }}>
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: event.color || '#4F46E5' }} />
                          {event.member_name}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-stone-400">
                        {format(safeParseISO(event.start_date), 'MM/dd')}
                        {event.start_date !== event.end_date && ` - ${format(safeParseISO(event.end_date), 'MM/dd')}`}
                      </span>
                    </div>
                    <h4 className="font-black text-stone-900 text-base truncate">{event.title}</h4>
                    <div className="flex items-center gap-3 mt-auto pt-2">
                      {event.time && (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50/50 px-2 py-1 rounded-lg">
                          <Clock size={14} />
                          {formatTimeDisplay(event.time)}
                        </div>
                      )}
                      {event.description && (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-stone-500 truncate">
                          <Filter size={14} className="opacity-50" />
                          <span className="truncate">{event.description}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* List View Mode */}
        {viewMode === 'list' && (
          <div className="space-y-6">
            {Array.from(new Set(filteredEvents.map(e => e.start_date)))
              .sort()
              .filter((date): date is string => typeof date === 'string' && isSameMonth(safeParseISO(date), currentDate))
              .map(date => (
                <div key={date}>
                  <h3 className="text-xs font-black text-stone-400 uppercase tracking-widest mb-3 sticky top-16 md:top-24 bg-stone-50 py-2 z-10">
                    {format(safeParseISO(date), 'MM月dd日 EEEE')}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredEvents
                      .filter(e => e.start_date === date)
                      .map(event => (
                        <div key={event.id} className="bg-white rounded-xl p-4 shadow-sm border border-stone-100 flex items-start gap-4">
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${event.color || '#4F46E5'}15`, color: event.color || '#4F46E5' }}>
                            {getEventIcon(event.title || '', 20) || <User size={20} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg flex items-center gap-1.5 w-fit" style={{ backgroundColor: `${event.color || '#4F46E5'}15`, color: event.color || '#4F46E5' }}>
                                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: event.color || '#4F46E5' }} />
                                {event.member_name}
                              </span>
                              <div className="flex items-center gap-2">
                                <button 
                                  onClick={() => handleEditClick(event)}
                                  className="p-1 text-stone-400 hover:text-indigo-600 transition-colors"
                                >
                                  <Edit size={16} />
                                </button>
                                <button 
                                  onClick={() => handleDeleteEvent(event)}
                                  className="p-1 text-stone-400 hover:text-rose-600 transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                            <h4 className="font-bold text-stone-900">{event.title}</h4>
                            <div className="flex items-center gap-2 mt-1">
                              {event.time && (
                                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                                  <Clock size={10} /> {formatTimeDisplay(event.time)}
                                </span>
                              )}
                              {event.description && <p className="text-xs text-stone-500">{event.description}</p>}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            {filteredEvents.filter(e => isSameMonth(safeParseISO(e.start_date), currentDate)).length === 0 && (
              <div className="bg-white border border-dashed border-stone-200 rounded-2xl p-12 text-center">
                <CalendarIcon size={48} className="mx-auto text-stone-200 mb-4" />
                <p className="text-stone-400 font-medium">本月尚無活動紀錄</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bottom Navigation Bar for Mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 px-6 py-3 flex items-center justify-between z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <button 
          onClick={() => setViewMode('calendar')}
          className={cn(
            "flex flex-col items-center gap-1 transition-all",
            viewMode === 'calendar' ? "text-indigo-600" : "text-stone-400"
          )}
        >
          <CalendarIcon size={20} />
          <span className="text-[10px] font-black uppercase tracking-widest">月曆</span>
        </button>

        <button 
          onClick={() => {
            setEditingEventId(null);
            setNewEvent({
              title: '',
              description: '',
              start_date: format(new Date(), 'yyyy-MM-dd'),
              end_date: format(new Date(), 'yyyy-MM-dd'),
              time: '',
              member_name: FAMILY_MEMBERS[0],
              color: MEMBER_COLORS[FAMILY_MEMBERS[0]],
            });
            setIsModalOpen(true);
          }}
          className="w-14 h-14 bg-indigo-600 text-white rounded-full shadow-xl flex items-center justify-center -translate-y-8 border-4 border-stone-50 active:scale-90 transition-all"
        >
          <Plus size={28} />
        </button>

        <button 
          onClick={() => setViewMode('list')}
          className={cn(
            "flex flex-col items-center gap-1 transition-all",
            viewMode === 'list' ? "text-indigo-600" : "text-stone-400"
          )}
        >
          <Clock size={20} />
          <span className="text-[10px] font-black uppercase tracking-widest">列表</span>
        </button>
      </nav>

      {/* Toast Notification */}
      {toast && (
        <div className={cn(
          "fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300",
          toast.type === 'success' ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
        )}>
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="text-sm font-black tracking-tight">{toast.message}</span>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-md z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[280px] overflow-hidden animate-in zoom-in duration-200">
            <div className="p-5 text-center">
              <div className="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-3 text-rose-600">
                <Trash2 size={24} />
              </div>
              <h3 className="text-base font-black text-stone-900 mb-1">確定要刪除嗎？</h3>
              <p className="text-stone-500 text-[11px] font-medium mb-5">此操作將無法復原。</p>
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 px-3 py-2 bg-stone-100 text-stone-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-stone-200 transition-all"
                >
                  取消
                </button>
                <button 
                  onClick={executeDelete}
                  className="flex-1 px-3 py-2 bg-rose-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-700 transition-all shadow-lg shadow-rose-200"
                >
                  刪除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Event Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-md z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-white rounded-t-3xl md:rounded-2xl shadow-2xl w-full md:max-w-md overflow-hidden animate-in slide-in-from-bottom md:zoom-in duration-300 max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/50 shrink-0">
              <div className="flex flex-col">
                <h2 className="text-base md:text-lg font-black tracking-tight">{editingEventId ? '編輯活動' : '新增活動'}</h2>
                {editingEventId && (
                  <span className="text-[10px] text-stone-400 font-medium mt-0.5">
                    原始日期: {newEvent.start_date}
                  </span>
                )}
              </div>
              <button 
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingEventId(null);
                }} 
                className="w-8 h-8 flex items-center justify-center bg-stone-200 rounded-full text-stone-600 hover:bg-stone-300 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="overflow-y-auto p-5">
              <form onSubmit={handleAddEvent} className="space-y-4">
                <div>
                  <label className="block text-xs font-black text-stone-500 uppercase tracking-widest mb-1.5">活動名稱</label>
                  <input 
                    required
                    type="text" 
                    value={newEvent.title}
                    onChange={e => setNewEvent({...newEvent, title: e.target.value})}
                    className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm font-medium"
                    placeholder="例如：家族聚餐"
                  />
                </div>

                <div className={cn("grid gap-3", !['請假', '排休', '特休', '補休', '公休'].includes(newEvent.title) ? "grid-cols-2" : "grid-cols-1")}>
                  <div>
                    <label className="block text-xs font-black text-stone-500 uppercase tracking-widest mb-1.5">日期</label>
                    <input 
                      required
                      type="date" 
                      value={newEvent.start_date}
                      onChange={e => setNewEvent({...newEvent, start_date: e.target.value, end_date: e.target.value})}
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm font-medium"
                    />
                  </div>
                  {!['請假', '排休', '特休', '補休', '公休'].includes(newEvent.title) && (
                    <div>
                      <label className="block text-xs font-black text-stone-500 uppercase tracking-widest mb-1.5">結束日期</label>
                      <input 
                        required
                        type="date" 
                        value={newEvent.end_date}
                        onChange={e => setNewEvent({...newEvent, end_date: e.target.value})}
                        className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm font-medium"
                      />
                    </div>
                  )}
                </div>

                {!['請假', '排休', '特休', '補休', '公休'].includes(newEvent.title) && (
                  <div>
                    <label className="block text-xs font-black text-stone-500 uppercase tracking-widest mb-1.5">時間 (選填)</label>
                    <input 
                      type="time" 
                      value={newEvent.time}
                      onChange={e => setNewEvent({...newEvent, time: e.target.value})}
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm font-medium"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-black text-stone-500 uppercase tracking-widest mb-1.5">參與成員</label>
                  <div className="flex flex-wrap gap-2">
                    {FAMILY_MEMBERS.map(member => (
                      <button
                        key={member}
                        type="button"
                        onClick={() => setNewEvent({...newEvent, member_name: member, color: MEMBER_COLORS[member] || '#4F46E5'})}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 border",
                          newEvent.member_name === member
                            ? "bg-stone-800 text-white border-stone-800 shadow-sm"
                            : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                        )}
                      >
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: MEMBER_COLORS[member] || '#4F46E5' }} />
                        {member}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-stone-500 uppercase tracking-widest mb-1.5">隨行人員 (選填)</label>
                  <div className="flex flex-wrap gap-2">
                    {FAMILY_MEMBERS.map(member => {
                      const isSelected = (newEvent.companions ? newEvent.companions.split(',') : []).includes(member);
                      return (
                        <button
                          key={member}
                          type="button"
                          onClick={() => {
                            const companions = newEvent.companions ? newEvent.companions.split(',') : [];
                            if (companions.includes(member)) {
                              setNewEvent({...newEvent, companions: companions.filter(c => c !== member).join(',')});
                            } else {
                              setNewEvent({...newEvent, companions: [...companions, member].join(',')});
                            }
                          }}
                          className={cn(
                            "px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 border",
                            isSelected
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm"
                              : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                          )}
                        >
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: MEMBER_COLORS[member] || '#4F46E5' }} />
                          {member}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-stone-500 uppercase tracking-widest mb-1.5">備註 (選填)</label>
                  <textarea 
                    value={newEvent.description}
                    onChange={e => setNewEvent({...newEvent, description: e.target.value})}
                    className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all min-h-[80px] text-sm font-medium resize-none"
                    placeholder="活動細節..."
                  />
                </div>

                <div className="pt-2 pb-6 md:pb-2">
                  <button 
                    type="submit"
                    className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-lg shadow-indigo-200"
                  >
                    {editingEventId ? '更新活動' : '儲存活動'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Day Events Modal (Bottom Sheet for Mobile, Centered for Desktop) */}
      {isDayModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-stone-900/40 backdrop-blur-sm transition-opacity p-0 md:p-4"
          onClick={() => setIsDayModalOpen(false)}
        >
          <div 
            className="bg-white w-full md:w-full md:max-w-sm rounded-t-3xl md:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-full md:slide-in-from-bottom-10 md:fade-in duration-300 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="text-base font-black text-stone-900 flex items-center gap-2">
                <div className="w-1.5 h-4 bg-indigo-600 rounded-full" />
                {format(selectedDay, 'MM月dd日')} 活動
              </h3>
              <button 
                onClick={() => setIsDayModalOpen(false)}
                className="w-7 h-7 flex items-center justify-center bg-stone-100 text-stone-500 rounded-full hover:bg-stone-200 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto space-y-3">
              {selectedDayEvents.length === 0 ? (
                <div className="bg-stone-50 border border-dashed border-stone-200 rounded-2xl p-10 text-center">
                  <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 text-stone-300 shadow-sm">
                    <CalendarIcon size={24} />
                  </div>
                  <p className="text-stone-400 text-sm font-bold">這天沒有安排活動</p>
                  <button 
                    onClick={() => {
                      setIsDayModalOpen(false);
                      setEditingEventId(null);
                      setNewEvent({
                        ...newEvent,
                        start_date: format(selectedDay, 'yyyy-MM-dd'),
                        end_date: format(selectedDay, 'yyyy-MM-dd'),
                      });
                      setIsModalOpen(true);
                    }}
                    className="mt-4 text-xs font-black text-indigo-600 hover:underline"
                  >
                    + 點擊新增活動
                  </button>
                </div>
              ) : (
                <>
                  {selectedDayEvents.map(event => (
                    <div key={event.id} className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100 flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-inner" style={{ backgroundColor: `${event.color}15`, color: event.color }}>
                        {getEventIcon(event.title || '', 20) || <User size={20} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg flex items-center gap-1.5 w-fit" style={{ backgroundColor: `${event.color || '#4F46E5'}15`, color: event.color || '#4F46E5' }}>
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: event.color || '#4F46E5' }} />
                            {event.member_name}
                          </span>
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => {
                                setIsDayModalOpen(false);
                                handleEditClick(event);
                              }}
                              className="w-7 h-7 flex items-center justify-center text-stone-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all"
                            >
                              <Edit size={14} />
                            </button>
                            <button 
                              onClick={() => {
                                setIsDayModalOpen(false);
                                handleDeleteEvent(event);
                              }}
                              className="w-7 h-7 flex items-center justify-center text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-full transition-all"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <h4 className="font-black text-stone-900 text-base truncate">{event.title}</h4>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          {event.time && (
                            <div className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 bg-indigo-50/50 px-1.5 py-0.5 rounded-md">
                              <Clock size={12} />
                              {formatTimeDisplay(event.time)}
                            </div>
                          )}
                          {event.description && (
                            <div className="flex items-center gap-1 text-[11px] font-medium text-stone-500">
                              <Filter size={12} className="opacity-50" />
                              <span className="truncate max-w-[150px]">{event.description}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <button 
                    onClick={() => {
                      setIsDayModalOpen(false);
                      setEditingEventId(null);
                      setNewEvent({
                        ...newEvent,
                        start_date: format(selectedDay, 'yyyy-MM-dd'),
                        end_date: format(selectedDay, 'yyyy-MM-dd'),
                      });
                      setIsModalOpen(true);
                    }}
                    className="w-full py-3 mt-2 border-2 border-dashed border-stone-200 rounded-xl text-xs font-black text-stone-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-all flex items-center justify-center gap-2"
                  >
                    <Plus size={16} /> 新增活動至這天
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="fixed bottom-24 md:bottom-6 right-6 bg-white px-4 py-2 rounded-full shadow-lg border border-stone-100 flex items-center gap-2 animate-pulse z-20">
          <Clock size={16} className="text-indigo-600 animate-spin" />
          <span className="text-xs font-bold text-stone-600 uppercase tracking-wider">同步中</span>
        </div>
      )}
    </div>
  );
}
