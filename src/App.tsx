import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  addDays,
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
  Sun,
  Moon,
  AlertTriangle,
  Utensils,
  Coffee,
  Briefcase,
  ShoppingCart,
  Car,
  Heart,
  Star,
  Plane,
  Music,
  Cloud,
  CloudRain,
  CloudSun,
  CloudLightning,
  Snowflake,
  Wind,
  Thermometer
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
  companions?: string;
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

const WEATHER_ICONS: Record<number, React.ReactNode> = {
  0: <Sun size={14} className="text-amber-500" />, // Clear sky
  1: <CloudSun size={14} className="text-amber-400" />, // Mainly clear
  2: <CloudSun size={14} className="text-stone-400" />, // Partly cloudy
  3: <Cloud size={14} className="text-stone-500" />, // Overcast
  45: <Wind size={14} className="text-stone-400" />, // Fog
  48: <Wind size={14} className="text-stone-400" />, // Depositing rime fog
  51: <CloudRain size={14} className="text-blue-400" />, // Drizzle: Light
  53: <CloudRain size={14} className="text-blue-500" />, // Drizzle: Moderate
  55: <CloudRain size={14} className="text-blue-600" />, // Drizzle: Dense intensity
  61: <CloudRain size={14} className="text-blue-500" />, // Rain: Slight
  63: <CloudRain size={14} className="text-blue-600" />, // Rain: Moderate
  65: <CloudRain size={14} className="text-blue-700" />, // Rain: Heavy intensity
  71: <Snowflake size={14} className="text-blue-200" />, // Snow fall: Slight
  73: <Snowflake size={14} className="text-blue-300" />, // Snow fall: Moderate
  75: <Snowflake size={14} className="text-blue-400" />, // Snow fall: Heavy intensity
  80: <CloudRain size={14} className="text-blue-500" />, // Rain showers: Slight
  81: <CloudRain size={14} className="text-blue-600" />, // Rain showers: Moderate
  82: <CloudRain size={14} className="text-blue-700" />, // Rain showers: Violent
  95: <CloudLightning size={14} className="text-indigo-500" />, // Thunderstorm: Slight or moderate
  96: <CloudLightning size={14} className="text-indigo-600" />, // Thunderstorm with slight hail
  99: <CloudLightning size={14} className="text-indigo-700" />, // Thunderstorm with heavy hail
};
const WEATHER_DESCRIPTIONS: Record<number, string> = {
  0: '晴朗',
  1: '晴時多雲',
  2: '多雲',
  3: '陰天',
  45: '霧',
  48: '霧',
  51: '毛毛雨 (輕微)',
  53: '毛毛雨 (中等)',
  55: '毛毛雨 (密集)',
  61: '雨 (輕微)',
  63: '雨 (中等)',
  65: '雨 (大雨)',
  71: '雪 (輕微)',
  73: '雪 (中等)',
  75: '雪 (大雪)',
  80: '陣雨 (輕微)',
  81: '陣雨 (中等)',
  82: '陣雨 (大雨)',
  95: '雷陣雨',
  96: '雷陣雨伴有冰雹',
  99: '雷陣雨伴有強烈冰雹',
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
  const [isQuickSelectOpen, setIsQuickSelectOpen] = useState(false);
  const pendingQuickLeaves = useRef<Set<string>>(new Set());
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark';
    }
    return false;
  });
  const [weatherData, setWeatherData] = useState<any>(null);
  const [dynamicHolidays, setDynamicHolidays] = useState<Record<string, string>>({});
  const [makeupWorkdays, setMakeupWorkdays] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const handleDragStart = (e: React.DragEvent, eventId: string | number) => {
    e.dataTransfer.setData('eventId', String(eventId));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetDate: Date) => {
    e.preventDefault();
    const eventId = e.dataTransfer.getData('eventId');
    if (!eventId) return;

    const eventToMove = events.find(ev => String(ev.id) === eventId);
    if (!eventToMove) return;

    const oldStart = safeParseISO(eventToMove.start_date);
    const oldEnd = safeParseISO(eventToMove.end_date);
    
    // Calculate duration in days
    const duration = Math.round((oldEnd.getTime() - oldStart.getTime()) / (1000 * 60 * 60 * 24));
    
    const newStart = targetDate;
    const newEnd = new Date(targetDate.getTime() + duration * 24 * 60 * 60 * 1000);

    const updatedEvent = {
      ...eventToMove,
      start_date: format(newStart, 'yyyy-MM-dd'),
      end_date: format(newEnd, 'yyyy-MM-dd'),
      action: 'update'
    };

    // Optimistic update
    const previousEvents = [...events];
    setEvents(events.map(ev => String(ev.id) === eventId ? updatedEvent : ev));
    showToast('行程已移動');

    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedEvent)
      });
      if (!res.ok) throw new Error('移動失敗');
      fetchEvents(false);
    } catch (err: any) {
      setEvents(previousEvents);
      showToast(`移動失敗: ${err.message}`, 'error');
    }
  };

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
    const dateStr = format(selectedDay, 'yyyy-MM-dd');
    const lockKey = `${member}-${dateStr}`;
    
    // 1. 防止重複點擊 (鎖定)
    if (pendingQuickLeaves.current.has(lockKey)) return;
    
    // 2. 檢查是否已經有該成員在該天的排休
    const alreadyHasLeave = events.some(e => 
      e.member_name === member && 
      e.start_date === dateStr && 
      (e.title.includes('排休') || e.title.includes('休假'))
    );
    
    if (alreadyHasLeave) {
      showToast(`${member} 在 ${format(selectedDay, 'MM/dd')} 已經有排休了`, 'error');
      return;
    }

    pendingQuickLeaves.current.add(lockKey);
    
    const eventColor = MEMBER_COLORS[member] || '#4F46E5';
    const leaveEvent = {
      title: '排休',
      description: '',
      start_date: dateStr,
      end_date: dateStr,
      time: '',
      member_name: member,
      color: eventColor,
      action: 'create',
    };

    const tempId = `temp-${Date.now()}`;
    const optimisticEvent = { ...leaveEvent, id: tempId, syncing: true };
    
    setEvents(prev => [...prev, optimisticEvent]);
    showToast(`正在新增 ${member} 排休...`);
    setIsDayModalOpen(false);
    
    if (filterMember !== '全部' && filterMember !== member) {
      setFilterMember(member);
    }

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
        throw new Error(`伺服器回應異常`);
      }

      if (!res.ok) throw new Error(result.error || '快速新增失敗');
      
      showToast(`已成功新增 ${member} 排休`);
      
      if (result.id) {
        setEvents(prev => prev.map(e => String(e.id) === tempId ? { ...e, id: result.id, syncing: false } : e));
      }
      
      // 稍微延遲重新抓取，確保後端同步完成
      setTimeout(() => fetchEvents(false), 500);
    } catch (err: any) {
      console.error("Quick Leave Error:", err);
      showToast(`新增失敗: ${err.message}`, 'error');
      setEvents(prev => prev.filter(e => String(e.id) !== tempId));
    } finally {
      pendingQuickLeaves.current.delete(lockKey);
    }
  };

  // Form state
  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    start_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: format(new Date(), 'yyyy-MM-dd'),
    time: '',
    start_time: '',
    end_time: '',
    member_name: FAMILY_MEMBERS[0],
    color: MEMBER_COLORS[FAMILY_MEMBERS[0]],
    companions: '',
  });

  useEffect(() => {
    fetchEvents();
    fetchConfigStatus();
    fetchWeather();
    fetchHolidays(2026);
  }, []);

  const fetchWeather = async () => {
    try {
      // Default to Taichung coordinates
      const lat = 24.1477;
      const lon = 120.6736;
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=Asia%2FTaipei`);
      if (!response.ok) return;
      const text = await response.text();
      if (!text) return;
      const data = JSON.parse(text);
      if (data && data.daily) {
        const mapped: Record<string, any> = {};
        data.daily.time.forEach((time: string, i: number) => {
          mapped[time] = {
            code: data.daily.weathercode[i],
            max: data.daily.temperature_2m_max[i],
            min: data.daily.temperature_2m_min[i]
          };
        });
        setWeatherData(mapped);
      }
    } catch (e) {
      console.error("Weather fetch error:", e);
    }
  };

  const fetchHolidays = async (year: number) => {
    try {
      // Fetch from our local API which proxies the Taiwan Government Open Data
      const response = await fetch(`/api/taiwan-calendar?year=${year}`);
      if (!response.ok) {
        // Fallback to Nager.Date if our local API fails
        const fallbackResponse = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/TW`);
        if (fallbackResponse.ok) {
          const text = await fallbackResponse.text();
          if (text) {
            const data = JSON.parse(text);
            const holidayMap: Record<string, string> = {};
            data.forEach((h: any) => {
              if (h.date) holidayMap[h.date] = h.localName || h.name;
            });
            setDynamicHolidays(prev => ({ ...prev, ...holidayMap }));
          }
        }
        return;
      }
      
      const text = await response.text();
      if (!text) return;
      
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        console.error("Failed to parse Taiwan calendar JSON:", parseError);
        return;
      }

      if (data.holidays) {
        setDynamicHolidays(prev => ({ ...prev, ...data.holidays }));
      }
      if (data.makeupWorkdays) {
        setMakeupWorkdays(prev => ({ ...prev, ...data.makeupWorkdays }));
      }
    } catch (e) {
      console.error("Holiday fetch error:", e);
    }
  };

  const allHolidays = useMemo(() => {
    return { ...HOLIDAYS_2026, ...dynamicHolidays };
  }, [dynamicHolidays]);

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
    let startTime = '';
    let endTime = '';
    
    if (eventTime && eventTime.includes(' - ')) {
      const [s, e] = eventTime.split(' - ');
      startTime = s;
      endTime = e;
    } else if (eventTime) {
      startTime = eventTime;
    }
    
    setNewEvent({
      title: event.title || '',
      description: event.description || '',
      start_date: startDate || format(new Date(), 'yyyy-MM-dd'),
      end_date: endDate || startDate || format(new Date(), 'yyyy-MM-dd'),
      time: eventTime || '',
      start_time: startTime || '',
      end_time: endTime || '',
      member_name: event.member_name || FAMILY_MEMBERS[0],
      color: event.color || MEMBER_COLORS[FAMILY_MEMBERS[0]],
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
    
    // Combine start_time and end_time into time field
    let combinedTime = '';
    if (newEvent.start_time && newEvent.end_time) {
      combinedTime = `${newEvent.start_time} - ${newEvent.end_time}`;
    } else if (newEvent.start_time) {
      combinedTime = newEvent.start_time;
    } else if (newEvent.end_time) {
      combinedTime = ` - ${newEvent.end_time}`;
    }

    const optimisticEvent = {
      ...newEvent,
      time: combinedTime,
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
      start_time: '',
      end_time: '',
      member_name: FAMILY_MEMBERS[0],
      color: MEMBER_COLORS[FAMILY_MEMBERS[0]],
      companions: '',
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
          time: combinedTime,
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
    // Replace " - " with " ~ " for better display
    if (s.includes(' - ')) {
      return s.replace(' - ', ' ~ ');
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

  // Calculate lanes for multi-day events to prevent visual overlap
  const eventLanes = useMemo(() => {
    const lanes: Record<string, number> = {};
    const occupiedSlots: Record<string, boolean[]> = {};

    // Sort: Multi-day first, then by duration, then by start date, then by title
    const sortedForLanes = [...filteredEvents].sort((a, b) => {
      const startA = startOfDay(safeParseISO(a.start_date));
      const startB = startOfDay(safeParseISO(b.start_date));
      const endA = startOfDay(safeParseISO(a.end_date));
      const endB = startOfDay(safeParseISO(b.end_date));
      
      const isMultiA = startA.getTime() !== endA.getTime();
      const isMultiB = startB.getTime() !== endB.getTime();
      
      if (isMultiA && !isMultiB) return -1;
      if (!isMultiA && isMultiB) return 1;
      
      const durA = endA.getTime() - startA.getTime();
      const durB = endB.getTime() - startB.getTime();
      if (durA !== durB) return durB - durA;
      
      if (startA.getTime() !== startB.getTime()) return startA.getTime() - startB.getTime();
      
      return (a.title || '').localeCompare(b.title || '');
    });

    sortedForLanes.forEach(event => {
      const start = startOfDay(safeParseISO(event.start_date));
      const end = startOfDay(safeParseISO(event.end_date));
      
      let lane = 0;
      let foundLane = false;
      
      while (!foundLane) {
        let isLaneFree = true;
        let curr = new Date(start);
        while (curr <= end) {
          const dateKey = format(curr, 'yyyy-MM-dd');
          if (occupiedSlots[dateKey] && occupiedSlots[dateKey][lane]) {
            isLaneFree = false;
            break;
          }
          curr = addDays(curr, 1);
        }
        
        if (isLaneFree) {
          lanes[event.id] = lane;
          let fillCurr = new Date(start);
          while (fillCurr <= end) {
            const dateKey = format(fillCurr, 'yyyy-MM-dd');
            if (!occupiedSlots[dateKey]) occupiedSlots[dateKey] = [];
            occupiedSlots[dateKey][lane] = true;
            fillCurr = addDays(fillCurr, 1);
          }
          foundLane = true;
        } else {
          lane++;
        }
      }
    });
    
    return lanes;
  }, [filteredEvents]);

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
    <div className={cn(
      "min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 font-sans pb-24 md:pb-0 transition-colors duration-300",
      isDarkMode && "dark"
    )}>
      {/* Header - Simplified for Mobile */}
      <header className="bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-b border-stone-200 dark:border-stone-800 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between sticky top-0 z-50 shadow-sm">
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
            className="p-2 text-stone-500 hover:text-indigo-600 dark:text-stone-400 dark:hover:text-indigo-400 transition-colors bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg shadow-sm"
            title="重新整理"
          >
            <Zap size={16} className={cn(loading && "animate-pulse text-indigo-500")} />
          </button>

          <div className="flex items-center bg-stone-100 dark:bg-stone-800 rounded-lg p-0.5 md:p-1">
            <button 
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
              className="p-1 md:p-1 hover:bg-white dark:hover:bg-stone-700 hover:shadow-sm rounded-md transition-all"
              title="上個月"
            >
              <ChevronLeft size={18} className="md:w-[18px] md:h-[18px]" />
            </button>
            <span className="px-1.5 md:px-4 font-bold text-xs md:text-base min-w-[70px] md:min-w-[120px] text-center">
              {format(currentDate, 'yyyy/MM')}
            </span>
            <button 
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
              className="p-1 md:p-1 hover:bg-white dark:hover:bg-stone-700 hover:shadow-sm rounded-md transition-all"
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
            className="flex items-center justify-center bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 px-2 md:px-3 py-1.5 md:py-2 rounded-lg text-[10px] md:text-xs font-bold text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors shadow-sm"
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
        <div className="hidden md:flex bg-stone-200 dark:bg-stone-800 p-1 rounded-xl mb-6 w-fit">
          <button 
            onClick={() => setViewMode('calendar')}
            className={cn(
              "px-6 py-2 rounded-lg text-sm font-bold transition-all",
              viewMode === 'calendar' ? "bg-white dark:bg-stone-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-stone-500 dark:text-stone-400"
            )}
          >
            月曆模式
          </button>
          <button 
            onClick={() => setViewMode('list')}
            className={cn(
              "px-6 py-2 rounded-lg text-sm font-bold transition-all",
              viewMode === 'list' ? "bg-white dark:bg-stone-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-stone-500 dark:text-stone-400"
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
              {/* 一鍵排休開關 */}
              <button
                onClick={() => setIsQuickLeaveEnabled(!isQuickLeaveEnabled)}
                className={cn(
                  "flex-shrink-0 flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border",
                  isQuickLeaveEnabled 
                    ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 shadow-sm"
                    : "bg-white dark:bg-stone-800 text-stone-500 dark:text-stone-400 border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700"
                )}
              >
                <Zap size={12} className={isQuickLeaveEnabled ? "text-amber-500" : "text-stone-400"} />
                一鍵排休
              </button>

              <div className="w-px h-4 bg-stone-200 dark:bg-stone-700 flex-shrink-0 mx-1" />

              {['全部', ...FAMILY_MEMBERS].map(member => (
                <button
                  key={member}
                  onClick={() => setFilterMember(member)}
                  className={cn(
                    "flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5",
                    filterMember === member 
                      ? "bg-stone-800 dark:bg-stone-100 border-stone-800 dark:border-stone-100 text-white dark:text-stone-900 shadow-md" 
                      : "bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-stone-300 dark:hover:border-stone-600"
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
                className="p-1.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
                title="偵錯資訊"
              >
                <Info size={16} />
              </button>

              {/* 深色模式開關 */}
              <button 
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-1.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
                title={isDarkMode ? "切換為淺色模式" : "切換為深色模式"}
              >
                {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            </div>

            <div className="md:hidden">
              {/* Mobile View Mode Toggle */}
              <div className="flex bg-stone-100 dark:bg-stone-800 p-0.5 rounded-lg">
                <button 
                  onClick={() => setViewMode('calendar')}
                  className={cn(
                    "px-3 py-1 rounded-md text-[10px] font-bold transition-all",
                    viewMode === 'calendar' ? "bg-white dark:bg-stone-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-stone-500 dark:text-stone-400"
                  )}
                >
                  月曆
                </button>
                <button 
                  onClick={() => setViewMode('list')}
                  className={cn(
                    "px-3 py-1 rounded-md text-[10px] font-bold transition-all",
                    viewMode === 'list' ? "bg-white dark:bg-stone-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-stone-500 dark:text-stone-400"
                  )}
                >
                  列表
                </button>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 p-4 rounded-xl mb-6 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle size={20} />
                <p className="text-sm font-medium">{error}</p>
              </div>
              <button 
                onClick={() => fetchEvents(true)}
                className="flex items-center gap-1 px-3 py-1 bg-red-100 dark:bg-red-900/50 hover:bg-red-200 dark:hover:bg-red-900/80 rounded-lg text-xs font-bold transition-colors"
              >
                <Zap size={12} />
                <span>重試</span>
              </button>
            </div>
            <button 
              onClick={() => setShowDebug(!showDebug)}
              className="text-xs text-red-500 dark:text-red-400 underline self-start ml-8"
            >
              {showDebug ? '隱藏除錯資訊' : '顯示除錯資訊'}
            </button>
            {showDebug && configStatus && (
              <div className="ml-8 p-3 bg-white/50 dark:bg-stone-900/50 rounded-lg text-[10px] font-mono space-y-1">
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
                <p className="mt-2 text-stone-400 dark:text-stone-500">提示：請在 Vercel 專案設定中新增這些環境變數。</p>
              </div>
            )}
          </div>
        )}

        {warning && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-amber-700 dark:text-amber-400 p-4 rounded-xl mb-6 flex items-center gap-3">
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
          <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-200 dark:border-stone-800">
            <div className="grid grid-cols-7 border-b border-stone-100 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-800/80 backdrop-blur-md sticky top-[56px] md:top-[72px] z-30 rounded-t-2xl">
              {['日', '一', '二', '三', '四', '五', '六'].map(day => (
                <div key={day} className="py-2 md:py-3 text-center text-[10px] md:text-xs font-black text-stone-400 dark:text-stone-500 uppercase tracking-widest">
                  {day}
                </div>
              ))}
            </div>
            
            <div className="grid grid-cols-7 relative rounded-b-2xl overflow-hidden">
              {calendarDays.map((day, i) => {
                // Sort events for consistent lane assignment if needed, 
                // but we'll primarily use the pre-calculated eventLanes.
                const dayEvents = filteredEvents.filter(e => {
                  try {
                    const start = startOfDay(safeParseISO(e.start_date));
                    const end = startOfDay(safeParseISO(e.end_date));
                    const current = startOfDay(day);
                    
                    const intervalStart = start < end ? start : end;
                    const intervalEnd = start < end ? end : start;
                    
                    return isWithinInterval(current, { start: intervalStart, end: intervalEnd });
                  } catch (err) {
                    return false;
                  }
                });

                // Assign events to slots based on their pre-calculated lanes
                const maxDisplaySlots = 4;
                const daySlots = new Array(maxDisplaySlots).fill(null);
                const dayOverflow: any[] = [];
                
                dayEvents.forEach(event => {
                  const lane = eventLanes[event.id] ?? 999;
                  if (lane < maxDisplaySlots) {
                    daySlots[lane] = event;
                  } else {
                    dayOverflow.push(event);
                  }
                });

                // For mobile
                const maxMobileSlots = 3;
                const mobileSlots = new Array(maxMobileSlots).fill(null);
                const mobileOverflow: any[] = [];
                dayEvents.forEach(event => {
                  const lane = eventLanes[event.id] ?? 999;
                  if (lane < maxMobileSlots) {
                    mobileSlots[lane] = event;
                  } else {
                    mobileOverflow.push(event);
                  }
                });
                
                const isToday = isSameDay(day, new Date());
                const isCurrentMonth = isSameMonth(day, monthStart);
                const isSelected = isSameDay(day, selectedDay);
                const dayOfWeek = day.getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                const dateKey = format(day, 'yyyy-MM-dd');
                const holidayName = allHolidays[dateKey];
                const isHoliday = holidayName !== undefined;
                const makeupWorkdayName = makeupWorkdays[dateKey];
                const weather = weatherData?.[dateKey];

                return (
                  <div 
                    key={day.toString()} 
                    onClick={() => {
                      setSelectedDay(day);
                      if (isQuickLeaveEnabled) {
                        if (filterMember !== '全部') {
                          // 如果已選擇特定成員，直接排休
                          handleQuickLeave(filterMember);
                        } else {
                          // 如果是全部成員，開啟快速選擇視窗
                          setIsQuickSelectOpen(true);
                        }
                      } else {
                        setIsDayModalOpen(true);
                      }
                    }}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, day)}
                    className={cn(
                      "min-h-[80px] md:min-h-[140px] p-1 md:p-2 border-r border-b border-stone-50 dark:border-stone-800 last:border-r-0 transition-all cursor-pointer relative",
                      !isCurrentMonth && "bg-stone-50/30 dark:bg-stone-800/30",
                      isSelected && "bg-indigo-50/50 dark:bg-indigo-900/20 ring-2 ring-inset ring-indigo-400 z-10",
                      isHoliday && "bg-rose-50/30 dark:bg-rose-900/10",
                      makeupWorkdayName && "bg-stone-100/50 dark:bg-stone-800/50"
                    )}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-1 md:mb-2 gap-1">
                      <div className="flex items-center gap-1">
                        <span className={cn(
                          "w-7 h-7 md:w-8 md:h-8 flex items-center justify-center rounded-full text-xs md:text-sm font-bold",
                          isToday ? "bg-indigo-600 text-white shadow-md" : (isHoliday || isWeekend) ? "text-rose-600 dark:text-rose-400" : isCurrentMonth ? "text-stone-900 dark:text-stone-100" : "text-stone-300 dark:text-stone-600"
                        )}>
                          {format(day, 'd')}
                        </span>
                        {weather && (
                          <div className="flex items-center gap-0.5 group relative">
                            {WEATHER_ICONS[weather.code]}
                            <span className="hidden md:block text-[8px] text-stone-400 font-medium">
                              {Math.round(weather.min)}°~{Math.round(weather.max)}°
                            </span>
                            {/* Tooltip for mobile or extra info */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-stone-900/95 dark:bg-stone-800/95 text-white text-[10px] py-1.5 px-2.5 rounded-lg shadow-xl backdrop-blur-sm border border-white/10 whitespace-nowrap z-50 animate-in fade-in zoom-in duration-200">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-bold text-amber-400">{WEATHER_DESCRIPTIONS[weather.code] || '未知天氣'}</span>
                                <span className="opacity-90">{Math.round(weather.min)}°C ~ {Math.round(weather.max)}°C</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {holidayName && (
                          <span className="text-[8px] md:text-[10px] font-black text-rose-500 dark:text-rose-400 truncate bg-rose-50 dark:bg-rose-900/30 px-1.5 py-0.5 rounded border border-rose-100 dark:border-rose-900/50">
                            {holidayName}
                          </span>
                        )}
                        {makeupWorkdayName && (
                          <span className="text-[8px] md:text-[10px] font-black text-stone-500 dark:text-stone-400 truncate bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded border border-stone-200 dark:border-stone-700">
                            {makeupWorkdayName}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-0.5 md:gap-1 relative z-20">
                      {/* Desktop View: Badges with Icons */}
                      <div className="hidden md:flex flex-col gap-1">
                        {daySlots.map((event, slotIndex) => {
                          if (!event) {
                            return <div key={`empty-${slotIndex}`} className="h-[20px] invisible" />;
                          }
                          const eventTitle = String(event.title || '無標題');
                          const isLeave = eventTitle.includes('休') || eventTitle.includes('假');
                          const icon = getEventIcon(eventTitle, 10);
                          
                          // Check if this is a multi-day event
                          const start = startOfDay(safeParseISO(event.start_date));
                          const end = startOfDay(safeParseISO(event.end_date));
                          const isMultiDay = start.getTime() !== end.getTime();
                          
                          // Determine if this is the start, middle, or end of a multi-day event
                          const isStart = isSameDay(day, start);
                          const isEnd = isSameDay(day, end);
                          
                          return (
                            <div 
                              key={event.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, event.id)}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditClick(event);
                              }}
                              style={{ 
                                backgroundColor: isLeave ? `${event.color || '#4F46E5'}25` : `${event.color || '#4F46E5'}15`, 
                                borderLeft: isStart || !isMultiDay ? `3px solid ${event.color || '#4F46E5'}` : 'none',
                                color: event.color || '#4F46E5',
                                // For multi-day events, remove border radius on connected sides
                                borderTopLeftRadius: isStart || !isMultiDay ? '4px' : '0',
                                borderBottomLeftRadius: isStart || !isMultiDay ? '4px' : '0',
                                borderTopRightRadius: isEnd || !isMultiDay ? '4px' : '0',
                                borderBottomRightRadius: isEnd || !isMultiDay ? '4px' : '0',
                                // Add negative margin to connect bars across cells
                                marginLeft: isStart || !isMultiDay ? '0' : '-9px',
                                marginRight: isEnd || !isMultiDay ? '0' : '-9px',
                                paddingLeft: isStart || !isMultiDay ? '6px' : '10px',
                                paddingRight: isEnd || !isMultiDay ? '6px' : '10px',
                                zIndex: isMultiDay ? 10 : 1,
                              }}
                              className={cn(
                                "py-0.5 text-[10px] font-bold truncate hover:brightness-95 transition-all flex items-center gap-1 cursor-grab active:cursor-grabbing h-[20px]",
                                isLeave && "ring-1 ring-inset ring-white/20",
                                (event as any).syncing && "opacity-50 animate-pulse"
                              )}
                            >
                              {icon && <span className="shrink-0">{icon}</span>}
                              <span className="truncate">{eventTitle}</span>
                            </div>
                          );
                        })}
                        {dayOverflow.length > 0 && (
                          <div className="text-[9px] text-stone-400 font-black pl-1 flex items-center gap-1">
                            <Plus size={8} /> {dayOverflow.length} 更多
                          </div>
                        )}
                      </div>

                      {/* Mobile View: Compact Badges for few events */}
                      <div className="md:hidden flex flex-col gap-0.5">
                        {mobileSlots.map((event, slotIndex) => {
                          if (!event) {
                            return <div key={`empty-mobile-${slotIndex}`} className="h-[14px] invisible" />;
                          }
                          const eventTitle = String(event.title || '無標題');
                          const icon = getEventIcon(eventTitle, 8);
                          
                          const start = startOfDay(safeParseISO(event.start_date));
                          const end = startOfDay(safeParseISO(event.end_date));
                          const isMultiDay = start.getTime() !== end.getTime();
                          const isStart = isSameDay(day, start);
                          const isEnd = isSameDay(day, end);

                          return (
                            <div 
                              key={event.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, event.id)}
                              style={{ 
                                backgroundColor: `${event.color || '#4F46E5'}15`, 
                                borderLeft: isStart || !isMultiDay ? `2px solid ${event.color || '#4F46E5'}` : 'none',
                                color: event.color || '#4F46E5',
                                borderTopLeftRadius: isStart || !isMultiDay ? '2px' : '0',
                                borderBottomLeftRadius: isStart || !isMultiDay ? '2px' : '0',
                                borderTopRightRadius: isEnd || !isMultiDay ? '2px' : '0',
                                borderBottomRightRadius: isEnd || !isMultiDay ? '2px' : '0',
                                marginLeft: isStart || !isMultiDay ? '0' : '-5px',
                                marginRight: isEnd || !isMultiDay ? '0' : '-5px',
                                paddingLeft: isStart || !isMultiDay ? '4px' : '6px',
                                paddingRight: isEnd || !isMultiDay ? '4px' : '6px',
                                zIndex: isMultiDay ? 10 : 1,
                              }}
                              className={cn(
                                "py-0.5 text-[8px] font-bold truncate h-[14px] flex items-center gap-0.5",
                                (event as any).syncing && "opacity-50 animate-pulse"
                              )}
                            >
                              {icon && <span className="shrink-0">{icon}</span>}
                              <span className="truncate">{eventTitle}</span>
                            </div>
                          );
                        })}
                        {mobileOverflow.length > 0 && (
                          <div className="text-[7px] text-stone-400 font-black pl-0.5">
                            +{mobileOverflow.length}
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

        {/* Quick Select Modal for Quick Leave */}
        {isQuickSelectOpen && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4"
            onClick={() => setIsQuickSelectOpen(false)}
          >
            <div 
              className="bg-white dark:bg-stone-900 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-200 border border-stone-100 dark:border-stone-800"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap size={18} className="text-amber-500" />
                  <h3 className="text-sm font-black text-stone-900 dark:text-stone-100 uppercase tracking-widest">
                    快速排休 ({format(selectedDay, 'MM/dd')})
                  </h3>
                </div>
                <button 
                  onClick={() => setIsQuickSelectOpen(false)}
                  className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-5">
                <p className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-4">選擇要排休的成員：</p>
                <div className="grid grid-cols-2 gap-2">
                  {FAMILY_MEMBERS.map(member => (
                    <button
                      key={member}
                      onClick={() => {
                        handleQuickLeave(member);
                        setIsQuickSelectOpen(false);
                      }}
                      className="px-4 py-3 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 bg-white dark:bg-stone-800 hover:bg-stone-50 dark:hover:bg-stone-700 active:scale-[0.98]"
                      style={{ borderColor: MEMBER_COLORS[member] || '#4F46E5', color: MEMBER_COLORS[member] || '#4F46E5' }}
                    >
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: MEMBER_COLORS[member] || '#4F46E5' }} />
                      {member}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dashboard Statistics */}
        {viewMode === 'calendar' && (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Total Outings */}
            <div className="bg-white dark:bg-stone-900 rounded-2xl p-5 shadow-sm border border-stone-100 dark:border-stone-800 flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
                <Car size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-1">本月全家出遊</p>
                <p className="text-2xl font-black text-stone-900 dark:text-stone-100">
                  {events.filter(e => 
                    e.member_name === '全家' && 
                    isSameMonth(safeParseISO(e.start_date), currentDate)
                  ).length} <span className="text-sm font-bold text-stone-400 dark:text-stone-500">次</span>
                </p>
              </div>
            </div>

            {/* Total Leaves */}
            <div className="bg-white dark:bg-stone-900 rounded-2xl p-5 shadow-sm border border-stone-100 dark:border-stone-800 flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-xl flex items-center justify-center shrink-0">
                <Coffee size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-1">本月排休總計</p>
                <p className="text-2xl font-black text-stone-900 dark:text-stone-100">
                  {events.filter(e => 
                    (String(e.title || '').includes('休') || String(e.title || '').includes('假')) && 
                    isSameMonth(safeParseISO(e.start_date), currentDate)
                  ).length} <span className="text-sm font-bold text-stone-400 dark:text-stone-500">天</span>
                </p>
              </div>
            </div>

            {/* Member Leave Stats */}
            <div className="bg-white dark:bg-stone-900 rounded-2xl p-5 shadow-sm border border-stone-100 dark:border-stone-800 flex flex-col justify-center">
              <p className="text-[10px] font-black text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-3">各成員排休天數</p>
              <div className="flex flex-wrap gap-2">
                {FAMILY_MEMBERS.filter(m => m !== '全家').map(member => {
                  const leaveCount = events.filter(e => 
                    e.member_name === member && 
                    (String(e.title || '').includes('休') || String(e.title || '').includes('假')) && 
                    isSameMonth(safeParseISO(e.start_date), currentDate)
                  ).length;
                  
                  if (leaveCount === 0) return null;
                  
                  return (
                    <div key={member} className="flex items-center gap-1.5 bg-stone-50 dark:bg-stone-800 px-2 py-1 rounded-lg border border-stone-100 dark:border-stone-700">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: MEMBER_COLORS[member] || '#4F46E5' }} />
                      <span className="text-[10px] font-bold text-stone-600 dark:text-stone-300">{member}</span>
                      <span className="text-[10px] font-black text-stone-900 dark:text-stone-100">{leaveCount}</span>
                    </div>
                  );
                })}
                {events.filter(e => 
                  (String(e.title || '').includes('休') || String(e.title || '').includes('假')) && 
                  isSameMonth(safeParseISO(e.start_date), currentDate)
                ).length === 0 && (
                  <span className="text-xs text-stone-400 dark:text-stone-500 font-medium">本月尚無排休紀錄</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Upcoming Events (Below Calendar) */}
        {viewMode === 'calendar' && (
          <div className="mt-8 md:mt-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm md:text-base font-black text-stone-900 dark:text-stone-100 uppercase tracking-widest flex items-center gap-2">
                <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                接下來的活動
              </h3>
              <span className="text-[10px] font-bold text-stone-400 dark:text-stone-500 bg-stone-100 dark:bg-stone-800 px-2 py-1 rounded-lg">
                近期 {upcomingEvents.length} 個活動
              </span>
            </div>
            
            <div className="flex overflow-x-auto gap-4 pb-6 -mx-4 px-4 md:mx-0 md:px-0 snap-x no-scrollbar">
              {upcomingEvents.length === 0 ? (
                <div className="w-full bg-white dark:bg-stone-900 border border-dashed border-stone-200 dark:border-stone-800 rounded-2xl p-8 text-center shadow-sm">
                  <div className="w-12 h-12 bg-stone-50 dark:bg-stone-800 rounded-full flex items-center justify-center mx-auto mb-3 text-stone-300 dark:text-stone-600">
                    <CalendarIcon size={24} />
                  </div>
                  <p className="text-stone-400 dark:text-stone-500 text-sm font-bold">目前沒有即將到來的活動</p>
                </div>
              ) : (
                upcomingEvents.map(event => (
                  <div key={event.id} className="snap-center shrink-0 w-[260px] md:w-[300px] bg-white dark:bg-stone-900 rounded-2xl p-5 shadow-sm border border-stone-100 dark:border-stone-800 flex flex-col gap-3 hover:shadow-md transition-all">
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
                      <span className="text-xs font-bold text-stone-400 dark:text-stone-500">
                        {format(safeParseISO(event.start_date), 'MM/dd')}
                        {event.start_date !== event.end_date && ` - ${format(safeParseISO(event.end_date), 'MM/dd')}`}
                      </span>
                    </div>
                    <h4 className="font-black text-stone-900 dark:text-stone-100 text-base truncate">{event.title}</h4>
                    <div className="flex items-center gap-3 mt-auto pt-2">
                      {event.time && (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20 px-2 py-1 rounded-lg">
                          <Clock size={14} />
                          {formatTimeDisplay(event.time)}
                        </div>
                      )}
                      {event.description && (
                        <div className="flex items-center gap-1.5 text-xs font-medium text-stone-500 dark:text-stone-400 truncate">
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
                  <h3 className="text-xs font-black text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-3 sticky top-[56px] md:top-[72px] bg-stone-50/95 dark:bg-stone-950/95 backdrop-blur-sm py-2 z-10">
                    {format(safeParseISO(date), 'MM月dd日 EEEE')}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredEvents
                      .filter(e => e.start_date === date)
                      .map(event => (
                        <div key={event.id} className="bg-white dark:bg-stone-900 rounded-xl p-4 shadow-sm border border-stone-100 dark:border-stone-800 flex items-start gap-4">
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
                                  className="p-1 text-stone-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                >
                                  <Edit size={16} />
                                </button>
                                <button 
                                  onClick={() => handleDeleteEvent(event)}
                                  className="p-1 text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                            <h4 className="font-bold text-stone-900 dark:text-stone-100">{event.title}</h4>
                            <div className="flex items-center gap-2 mt-1">
                              {event.time && (
                                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                                  <Clock size={10} /> {formatTimeDisplay(event.time)}
                                </span>
                              )}
                              {event.description && <p className="text-xs text-stone-500 dark:text-stone-400">{event.description}</p>}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            {filteredEvents.filter(e => isSameMonth(safeParseISO(e.start_date), currentDate)).length === 0 && (
              <div className="bg-white dark:bg-stone-900 border border-dashed border-stone-200 dark:border-stone-800 rounded-2xl p-12 text-center">
                <CalendarIcon size={48} className="mx-auto text-stone-200 dark:text-stone-800 mb-4" />
                <p className="text-stone-400 dark:text-stone-500 font-medium">本月尚無活動紀錄</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bottom Navigation Bar for Mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 px-6 py-3 flex items-center justify-between z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <button 
          onClick={() => setViewMode('calendar')}
          className={cn(
            "flex flex-col items-center gap-1 transition-all",
            viewMode === 'calendar' ? "text-indigo-600 dark:text-indigo-400" : "text-stone-400 dark:text-stone-500"
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
          className="w-14 h-14 bg-indigo-600 text-white rounded-full shadow-xl flex items-center justify-center -translate-y-8 border-4 border-stone-50 dark:border-stone-950 active:scale-90 transition-all"
        >
          <Plus size={28} />
        </button>

        <button 
          onClick={() => setViewMode('list')}
          className={cn(
            "flex flex-col items-center gap-1 transition-all",
            viewMode === 'list' ? "text-indigo-600 dark:text-indigo-400" : "text-stone-400 dark:text-stone-500"
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
          <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl w-full max-w-[280px] overflow-hidden animate-in zoom-in duration-200 border border-stone-100 dark:border-stone-800">
            <div className="p-5 text-center">
              <div className="w-12 h-12 bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center mx-auto mb-3 text-rose-600 dark:text-rose-400">
                <Trash2 size={24} />
              </div>
              <h3 className="text-base font-black text-stone-900 dark:text-stone-100 mb-1">確定要刪除嗎？</h3>
              <p className="text-stone-500 dark:text-stone-400 text-[11px] font-medium mb-5">此操作將無法復原。</p>
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 px-3 py-2 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-stone-200 dark:hover:bg-stone-700 transition-all"
                >
                  取消
                </button>
                <button 
                  onClick={executeDelete}
                  className="flex-1 px-3 py-2 bg-rose-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-700 transition-all shadow-lg shadow-rose-200 dark:shadow-none"
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
          <div className="bg-white dark:bg-stone-900 rounded-t-3xl md:rounded-2xl shadow-2xl w-full md:max-w-md overflow-hidden animate-in slide-in-from-bottom md:zoom-in duration-300 max-h-[90vh] flex flex-col border-t md:border border-stone-100 dark:border-stone-800">
            <div className="px-5 py-4 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between bg-stone-50/50 dark:bg-stone-800/50 shrink-0">
              <div className="flex flex-col">
                <h2 className="text-base md:text-lg font-black tracking-tight text-stone-900 dark:text-stone-100">{editingEventId ? '編輯活動' : '新增活動'}</h2>
                {editingEventId && (
                  <span className="text-[10px] text-stone-400 dark:text-stone-500 font-medium mt-0.5">
                    原始日期: {newEvent.start_date}
                  </span>
                )}
              </div>
              <button 
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingEventId(null);
                }} 
                className="w-8 h-8 flex items-center justify-center bg-stone-200 dark:bg-stone-800 rounded-full text-stone-600 dark:text-stone-400 hover:bg-stone-300 dark:hover:bg-stone-700 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="overflow-y-auto p-5">
              <form onSubmit={handleAddEvent} className="space-y-4">
                <div>
                  <label className="block text-xs font-black text-stone-500 dark:text-stone-400 uppercase tracking-widest mb-1.5">活動名稱</label>
                  <input 
                    required
                    type="text" 
                    value={newEvent.title || ''}
                    onChange={e => setNewEvent({...newEvent, title: e.target.value})}
                    className="w-full px-4 py-2.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm font-medium text-stone-900 dark:text-stone-100"
                    placeholder="例如：家族聚餐"
                  />
                </div>

                <div className={cn("grid gap-3", !['請假', '排休', '特休', '補休', '公休'].includes(newEvent.title || '') ? "grid-cols-2" : "grid-cols-1")}>
                  <div>
                    <label className="block text-xs font-black text-stone-500 dark:text-stone-400 uppercase tracking-widest mb-1.5">日期</label>
                    <input 
                      required
                      type="date" 
                      value={newEvent.start_date || ''}
                      onChange={e => setNewEvent({...newEvent, start_date: e.target.value, end_date: e.target.value})}
                      className="w-full px-4 py-2.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm font-medium text-stone-900 dark:text-stone-100"
                    />
                  </div>
                  {!['請假', '排休', '特休', '補休', '公休'].includes(newEvent.title || '') && (
                    <div>
                      <label className="block text-xs font-black text-stone-500 dark:text-stone-400 uppercase tracking-widest mb-1.5">結束日期</label>
                      <input 
                        required
                        type="date" 
                        value={newEvent.end_date || ''}
                        onChange={e => setNewEvent({...newEvent, end_date: e.target.value})}
                        className="w-full px-4 py-2.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm font-medium text-stone-900 dark:text-stone-100"
                      />
                    </div>
                  )}
                </div>

                {!['請假', '排休', '特休', '補休', '公休'].includes(newEvent.title || '') && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-black text-stone-500 dark:text-stone-400 uppercase tracking-widest mb-1.5">開始時間 (選填)</label>
                      <input 
                        type="time" 
                        value={newEvent.start_time || ''}
                        onChange={e => setNewEvent({...newEvent, start_time: e.target.value})}
                        className="w-full px-4 py-2.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm font-medium text-stone-900 dark:text-stone-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-stone-500 dark:text-stone-400 uppercase tracking-widest mb-1.5">結束時間 (選填)</label>
                      <input 
                        type="time" 
                        value={newEvent.end_time || ''}
                        onChange={e => setNewEvent({...newEvent, end_time: e.target.value})}
                        className="w-full px-4 py-2.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm font-medium text-stone-900 dark:text-stone-100"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-black text-stone-500 dark:text-stone-400 uppercase tracking-widest mb-1.5">參與成員</label>
                  <div className="flex flex-wrap gap-2">
                    {FAMILY_MEMBERS.map(member => (
                      <button
                        key={member}
                        type="button"
                        onClick={() => setNewEvent({...newEvent, member_name: member, color: MEMBER_COLORS[member] || '#4F46E5'})}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 border",
                          newEvent.member_name === member
                            ? "bg-stone-800 dark:bg-stone-100 text-white dark:text-stone-900 border-stone-800 dark:border-stone-100 shadow-sm"
                            : "bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700"
                        )}
                      >
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: MEMBER_COLORS[member] || '#4F46E5' }} />
                        {member}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-stone-500 dark:text-stone-400 uppercase tracking-widest mb-1.5">隨行人員 (選填)</label>
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
                              ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 shadow-sm"
                              : "bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700"
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
                  <label className="block text-xs font-black text-stone-500 dark:text-stone-400 uppercase tracking-widest mb-1.5">備註 (選填)</label>
                  <textarea 
                    value={newEvent.description || ''}
                    onChange={e => setNewEvent({...newEvent, description: e.target.value})}
                    className="w-full px-4 py-2.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all min-h-[80px] text-sm font-medium resize-none text-stone-900 dark:text-stone-100"
                    placeholder="活動細節..."
                  />
                </div>

                <div className="pt-2 pb-6 md:pb-2">
                  <button 
                    type="submit"
                    className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
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
            className="bg-white dark:bg-stone-900 w-full md:w-full md:max-w-sm rounded-t-3xl md:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-full md:slide-in-from-bottom-10 md:fade-in duration-300 max-h-[80vh] flex flex-col border-t md:border border-stone-100 dark:border-stone-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between sticky top-0 bg-white dark:bg-stone-900 z-10">
              <h3 className="text-base font-black text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <div className="w-1.5 h-4 bg-indigo-600 rounded-full" />
                {format(selectedDay, 'MM月dd日')} 活動
              </h3>
              <button 
                onClick={() => setIsDayModalOpen(false)}
                className="w-7 h-7 flex items-center justify-center bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 rounded-full hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto space-y-3">
              {selectedDayEvents.length === 0 ? (
                <div className="bg-stone-50 dark:bg-stone-800/50 border border-dashed border-stone-200 dark:border-stone-700 rounded-2xl p-10 text-center">
                  <div className="w-12 h-12 bg-white dark:bg-stone-800 rounded-full flex items-center justify-center mx-auto mb-3 text-stone-300 dark:text-stone-600 shadow-sm">
                    <CalendarIcon size={24} />
                  </div>
                  <p className="text-stone-400 dark:text-stone-500 text-sm font-bold">這天沒有安排活動</p>
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
                    className="mt-4 text-xs font-black text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    + 點擊新增活動
                  </button>
                </div>
              ) : (
                <>
                  {selectedDayEvents.map(event => (
                    <div key={event.id} className="bg-white dark:bg-stone-800 rounded-2xl p-4 shadow-sm border border-stone-100 dark:border-stone-700 flex items-start gap-4">
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
