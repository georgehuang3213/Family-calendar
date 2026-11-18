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
  startOfDay,
} from 'date-fns';
import { zhTW } from 'date-fns/locale';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  User,
  Clock,
  Filter,
  AlertCircle,
  Edit,
  Trash2,
  Zap,
  CheckCircle2,
  Info,
  Sun,
  Moon,
  AlertTriangle,
  Coffee,
  Car,
  Star,
  Cloud,
  CloudRain,
  MapPin,
  Megaphone,
  Settings,
  Sparkles,
} from 'lucide-react';
import {
  FAMILY_MEMBERS,
  MEMBER_COLORS,
  DEFAULT_QUICK_ADD_PRESETS,
} from '../shared/constants';
import type {
  CalendarEvent,
  EventFormState,
  QuickAddPreset,
  DayWeather,
  CurrentWeather,
  ChatMessage,
  ToastState,
} from './types';
import { FAMILY_KEY_STORAGE, getFamilyKey, apiFetch } from './utils/api';
import {
  cn,
  HOLIDAYS_2026,
  WEATHER_DESCRIPTIONS,
  safeParseISO,
  getEventDayBounds,
  isEventOnDate,
  countEventDaysInMonth,
  formatTimeDisplay,
  parseEventTimeRange,
  normalizeDateForInput,
  getLunarDate,
  formatCalendarBadgeTitle,
  createEmptyEventForm,
  buildCleanEventPayload,
} from './utils/calendar';
import { WEATHER_ICONS, getEventIcon } from './utils/icons';
import { AuthGate } from './components/AuthGate';
import { ChatDrawer } from './components/ChatDrawer';
import { DebugPanel } from './components/DebugPanel';
import { EventModal } from './components/EventModal';
import { DayEventsModal } from './components/DayEventsModal';
import { QuickSelectModal } from './components/QuickSelectModal';
import { ManagePresetsModal } from './components/ManagePresetsModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';

const INITIAL_CHAT_MESSAGE: ChatMessage = {
  role: 'assistant',
  content:
    '您好！我是您的 ChatGPT 智慧小幫手。🙋‍♂️✨\n您可以問我任何問題、請我幫忙查詢行程、或者是直接命令我幫您進行行事曆排程！\n\n💡 *您可以試著這樣對我說*：\n1. 「幫我查下星期江雪卿哪天排休？」\n2. 「幫黃喬裕新增明天上午十點開會，備註是在會議室」\n3. 「下星期全家有什麼行程？」\n\n我會自動讀取最新的資料庫，並直接幫您在雲端行事曆做排定與操作喔！😊',
};

export default function App() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [storageSource, setStorageSource] = useState<string>('local');
  const [warning] = useState<string | null>(null);
  const [configStatus, setConfigStatus] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filterMember, setFilterMember] = useState<string>('全部');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [editingEventId, setEditingEventId] = useState<string | number | null>(null);

  // 「一鍵新增」快速項目
  const [quickAddPresets, setQuickAddPresets] = useState<QuickAddPreset[]>(DEFAULT_QUICK_ADD_PRESETS);
  const [activeQuickAddId, setActiveQuickAddId] = useState<string | null>(null);
  const [isManagePresetsOpen, setIsManagePresetsOpen] = useState(false);
  const [newPresetTitle, setNewPresetTitle] = useState('');
  const [isSavingPresets, setIsSavingPresets] = useState(false);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [webhookLogs, setWebhookLogs] = useState<string>('載入中...');
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);
  const [eventToDelete, setEventToDelete] = useState<string | number | null>(null);
  const [eventToDeleteObj, setEventToDeleteObj] = useState<CalendarEvent | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isDayModalOpen, setIsDayModalOpen] = useState(false);
  const [isQuickSelectOpen, setIsQuickSelectOpen] = useState(false);
  const [quickSelectPresetId, setQuickSelectPresetId] = useState<string | null>(null);
  const pendingQuickAdds = useRef<Set<string>>(new Set());

  const [isElderlyMode, setIsElderlyMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('elderlyMode') === 'true';
    }
    return false;
  });
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark';
    }
    return false;
  });

  const [weatherData, setWeatherData] = useState<Record<string, DayWeather> | null>(null);
  const [currentWeather, setCurrentWeather] = useState<CurrentWeather | null>(null);
  const [locationName, setLocationName] = useState<string>('台中市 北屯區');
  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number; name: string } | null>(null);
  const [dynamicHolidays, setDynamicHolidays] = useState<Record<string, string>>({});
  const [makeupWorkdays, setMakeupWorkdays] = useState<Record<string, string>>({});

  // --- 登入閘門 (家庭通行碼) ---
  const [authed, setAuthed] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [keyInput, setKeyInput] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // ChatGPT AI Assistant States
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([INITIAL_CHAT_MESSAGE]);
  const [chatInput, setChatInput] = useState('');
  const [isAILoading, setIsAILoading] = useState(false);

  // Form state
  const [newEvent, setNewEvent] = useState<EventFormState>(() => createEmptyEventForm());

  const importanceLocker = useRef<Map<string, { is_important: boolean; timestamp: number }>>(new Map());
  const reloadEventsRef = useRef<() => void>(() => {});
  const eventsRevRef = useRef<number | null>(null);
  const pollCountRef = useRef(0);
  const eventsLengthRef = useRef(0);
  const fetchedHolidayYearsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    eventsLengthRef.current = events.length;
  }, [events.length]);

  const showToast = useCallback(
    (
      message: string,
      type: 'success' | 'error' = 'success',
      action?: { label: string; onClick: () => void },
      duration?: number
    ) => {
      setToast({ message, type, action, duration });
    },
    []
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.duration ?? 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Verify saved access key
  useEffect(() => {
    let cancelled = false;
    const verifySavedKey = async () => {
      if (!getFamilyKey()) {
        if (!cancelled) {
          setAuthed(false);
          setAuthChecking(false);
        }
        return;
      }
      try {
        const res = await apiFetch('/api/auth/verify');
        if (!cancelled) {
          setAuthed(res.ok);
          setAuthChecking(false);
        }
      } catch {
        if (!cancelled) {
          setAuthed(false);
          setAuthChecking(false);
        }
      }
    };
    verifySavedKey();
    const onAuthRequired = () => setAuthed(false);
    window.addEventListener('family-auth-required', onAuthRequired);
    return () => {
      cancelled = true;
      window.removeEventListener('family-auth-required', onAuthRequired);
    };
  }, []);

  const handleSubmitKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const k = keyInput.trim();
    if (!k) return;
    setKeyError(null);
    setAuthSubmitting(true);
    try {
      localStorage.setItem(FAMILY_KEY_STORAGE, k);
      const res = await fetch('/api/auth/verify', { headers: { 'x-family-key': k } });
      if (res.ok) {
        setAuthed(true);
        setKeyInput('');
      } else {
        localStorage.removeItem(FAMILY_KEY_STORAGE);
        setKeyError('通行碼錯誤，請再試一次。');
      }
    } catch {
      localStorage.removeItem(FAMILY_KEY_STORAGE);
      setKeyError('連線失敗，請稍後再試。');
    } finally {
      setAuthSubmitting(false);
    }
  };

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem('elderlyMode', isElderlyMode ? 'true' : 'false');
  }, [isElderlyMode]);

  const fetchWeather = async (targetLat?: number, targetLon?: number) => {
    try {
      const lat = targetLat ?? 24.18;
      const lon = targetLon ?? 120.697;

      let response: Response;
      try {
        response = await apiFetch(`/api/weather?latitude=${lat}&longitude=${lon}`);
        if (!response.ok) throw new Error('Local weather proxy error');
      } catch (proxyError) {
        console.warn('Weather proxy failed, trying direct Open-Meteo:', proxyError);
        response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTaipei&forecast_days=14`
        );
      }

      if (!response.ok) return;
      const text = await response.text();
      if (!text) return;
      const data = JSON.parse(text);

      if (data && data.current) {
        setCurrentWeather({
          temp: data.current.temperature_2m,
          humidity: data.current.relative_humidity_2m,
          code: data.current.weather_code,
          wind: data.current.wind_speed_10m,
        });
      }

      if (data && data.daily) {
        const mapped: Record<string, DayWeather> = {};
        data.daily.time.forEach((time: string, i: number) => {
          mapped[time] = {
            code: data.daily.weathercode[i],
            max: data.daily.temperature_2m_max[i],
            min: data.daily.temperature_2m_min[i],
            pop: data.daily.precipitation_probability_max[i],
          };
        });
        setWeatherData(mapped);
      }
    } catch (e) {
      console.error('Weather fetch error:', e);
    }
  };

  const fetchHolidays = async (year: number) => {
    if (fetchedHolidayYearsRef.current.has(year)) return;
    fetchedHolidayYearsRef.current.add(year);
    try {
      const response = await apiFetch(`/api/taiwan-calendar?year=${year}`);
      if (!response.ok) {
        const fallbackResponse = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/TW`);
        if (fallbackResponse.ok) {
          const text = await fallbackResponse.text();
          if (text) {
            const data = JSON.parse(text);
            const holidayMap: Record<string, string> = {};
            data.forEach((h: any) => {
              if (h.date) holidayMap[h.date] = h.localName || h.name;
            });
            setDynamicHolidays((prev) => ({ ...prev, ...holidayMap }));
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
        console.error('Failed to parse Taiwan calendar JSON:', parseError);
        return;
      }

      if (data.holidays) {
        setDynamicHolidays((prev) => ({ ...prev, ...data.holidays }));
      }
      if (data.makeupWorkdays) {
        setMakeupWorkdays((prev) => ({ ...prev, ...data.makeupWorkdays }));
      }
    } catch (e) {
      fetchedHolidayYearsRef.current.delete(year);
      console.error('Holiday fetch error:', e);
    }
  };

  const fetchConfigStatus = async () => {
    try {
      const res = await apiFetch('/api/config-status');
      if (res.ok) {
        const data = await res.json();
        setConfigStatus(data);
      }
    } catch {
      console.error('Failed to fetch config status');
    }
  };

  const fetchWebhookLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const res = await apiFetch('/api/webhook-logs');
      if (res.ok) {
        const data = await res.json();
        setWebhookLogs(data.logs);
      } else {
        setWebhookLogs('無法讀取日誌，伺服器返回錯誤。');
      }
    } catch (err: any) {
      setWebhookLogs(`載入日誌失敗: ${err.message}`);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const clearWebhookLogs = async () => {
    if (!window.confirm('確定要清空 Webhook 日誌嗎？')) return;
    try {
      const res = await apiFetch('/api/webhook-logs/clear', { method: 'POST' });
      if (res.ok) {
        setWebhookLogs('日誌已清空。');
      }
    } catch (err: any) {
      showToast(`清空日誌失敗: ${err.message}`, 'error');
    }
  };

  useEffect(() => {
    if (showDebug) {
      fetchWebhookLogs();
    }
  }, [showDebug]);

  // Initial load + polling when authenticated
  useEffect(() => {
    if (!authed) return;

    const initLocationAndWeather = async () => {
      let weatherAlreadyConfigured = false;
      let savedWeatherCfg: { lat?: number | null; lon?: number | null; locationName?: string } | null = null;
      try {
        const cfgRes = await apiFetch('/api/config/weather');
        if (cfgRes.ok) {
          const cfg = await cfgRes.json();
          weatherAlreadyConfigured = Boolean(cfg.configured);
          savedWeatherCfg = cfg;
          if (cfg.locationName) {
            setLocationName(cfg.locationName);
          }
        }
      } catch {
        // Ignore config check error
      }

      const fallbackWeather = () => {
        if (
          savedWeatherCfg &&
          typeof savedWeatherCfg.lat === 'number' &&
          typeof savedWeatherCfg.lon === 'number'
        ) {
          fetchWeather(savedWeatherCfg.lat, savedWeatherCfg.lon);
        } else {
          fetchWeather();
        }
      };

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            let locName = '';
            try {
              const geoRes = await fetch(
                `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=zh`
              );
              if (geoRes.ok) {
                const geoData = await geoRes.json();
                const city = geoData.city || geoData.principalSubdivision || '未知地區';
                const locality = geoData.locality || '';
                locName = `${city} ${locality}`.trim();
                setLocationName(locName);
                setUserCoords({ lat: latitude, lon: longitude, name: locName });

                // Only auto-save to shared family config if not yet configured,
                // so a traveling member's device doesn't overwrite the home LINE weather location.
                if (!weatherAlreadyConfigured) {
                  apiFetch('/api/config/weather', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lat: latitude, lon: longitude, locationName: locName }),
                  }).catch((e) => console.error(e));
                }
              }
            } catch (e) {
              console.error('Reverse geocode error', e);
            }
            fetchWeather(latitude, longitude);
          },
          (err) => {
            console.error('Geolocation error:', err);
            fallbackWeather();
          },
          { timeout: 10000, maximumAge: 60000 }
        );
      } else {
        fallbackWeather();
      }
    };
    initLocationAndWeather();

    fetchConfigStatus();

    apiFetch('/api/config/quick-add-presets')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.presets) && data.presets.length > 0) setQuickAddPresets(data.presets);
      })
      .catch((e) => console.error('載入一鍵新增選項失敗:', e));

    const processDatabaseEvents = (dbEvents: CalendarEvent[]) => {
      const now = Date.now();
      const LOCK_TTL = 300000;

      return dbEvents.map((event: CalendarEvent) => {
        let is_important = !!event.is_important;
        const idStr = String(event.id);
        const uuidStr = event.uuid ? String(event.uuid) : '';
        const signature = `${event.title}|${event.start_date}|${event.member_name}`.toLowerCase().trim();

        const lock =
          importanceLocker.current.get(idStr) ||
          (uuidStr ? importanceLocker.current.get(uuidStr) : null) ||
          importanceLocker.current.get(signature);

        if (lock && now - lock.timestamp < LOCK_TTL) {
          is_important = lock.is_important;
        }

        return {
          ...event,
          id: idStr,
          end_date: event.end_date || event.start_date,
          is_important,
        };
      });
    };

    const pollEvents = async (force = false) => {
      try {
        pollCountRef.current += 1;
        const forceFull = force || eventsRevRef.current === null || pollCountRef.current % 30 === 0;
        const url = forceFull ? '/api/events' : `/api/events?rev=${eventsRevRef.current}`;
        const res = await apiFetch(url);
        if (!res.ok) throw new Error(`API 回應錯誤 (${res.status})`);
        const data = await res.json();
        if (typeof data.rev === 'number') eventsRevRef.current = data.rev;
        if (data.changed === false) {
          setError(null);
          return;
        }
        if (data && Array.isArray(data.events)) {
          const processed = processDatabaseEvents(data.events);
          setEvents((prev) => {
            const pendingOptimistic = prev.filter(
              (e) =>
                String(e.id).startsWith('temp-') &&
                !processed.some(
                  (p) =>
                    p.title === e.title &&
                    p.start_date === e.start_date &&
                    p.member_name === e.member_name
                )
            );
            return pendingOptimistic.length > 0 ? [...processed, ...pendingOptimistic] : processed;
          });
          setStorageSource('firestore');
          setError(null);
        }
      } catch (e: any) {
        console.error('載入行程失敗:', e);
        if (eventsLengthRef.current === 0) {
          setError('資料載入失敗，將自動重試。');
        }
      } finally {
        setLoading(false);
      }
    };

    reloadEventsRef.current = () => pollEvents(true);
    pollEvents(true);

    let pollInterval: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (pollInterval) return;
      pollInterval = setInterval(() => pollEvents(), 45000);
    };
    const stopPolling = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        pollEvents();
        startPolling();
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    const startYear = startOfWeek(startOfMonth(currentDate)).getFullYear();
    const endYear = endOfWeek(endOfMonth(currentDate)).getFullYear();
    fetchHolidays(currentDate.getFullYear());
    if (startYear !== currentDate.getFullYear()) fetchHolidays(startYear);
    if (endYear !== currentDate.getFullYear()) fetchHolidays(endYear);
  }, [authed, currentDate.getFullYear(), currentDate.getMonth()]);

  const allHolidays = useMemo(() => {
    return { ...HOLIDAYS_2026, ...dynamicHolidays };
  }, [dynamicHolidays]);

  const fetchEvents = (showLoading = true) => {
    if (showLoading) setLoading(true);
    reloadEventsRef.current();
    fetchConfigStatus();
  };

  const handleSaveCurrentLocationForLine = async () => {
    if (!userCoords) return;
    try {
      const res = await apiFetch('/api/config/weather', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: userCoords.lat, lon: userCoords.lon, locationName: userCoords.name }),
      });
      if (!res.ok) throw new Error('更新失敗');
      showToast(`已將群組推播天氣地點設為「${userCoords.name}」`);
    } catch (err: any) {
      showToast(`更新天氣地點失敗: ${err.message}`, 'error');
    }
  };

  // ChatGPT message handler
  const handleSendChatMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || isAILoading) return;

    const userMsg = chatInput.trim();
    setChatInput('');

    const updatedMessages = [...chatMessages, { role: 'user' as const, content: userMsg }];
    setChatMessages(updatedMessages);
    setIsAILoading(true);

    try {
      const historyToSend = updatedMessages.slice(-6).map((m) => ({ role: m.role, content: m.content }));

      const res = await apiFetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          history: historyToSend,
        }),
      });

      if (!res.ok) {
        throw new Error(`伺服器連線失敗：狀態 ${res.status}`);
      }

      const data = await res.json();
      if (data.success) {
        setChatMessages((prev) => [...prev, { role: 'assistant' as const, content: data.reply }]);
        if (data.actionExecuted) {
          showToast(data.actionExecuted, 'success');
          // Immediately sync calendar after AI executes a create/update/delete action
          reloadEventsRef.current();
        }
      } else {
        throw new Error(data.error || '未知的 AI 回應錯誤');
      }
    } catch (err: any) {
      console.error('AI Chat Error:', err);
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant' as const,
          content: `❌ 抱歉，我現在大腦有一點卡住了：${err.message}\n金鑰剛設定時，通常需要重啟或等待一分鐘生效 😉`,
        },
      ]);
    } finally {
      setIsAILoading(false);
    }
  };

  // Drag & Drop handlers
  const handleDragStart = (e: React.DragEvent, eventId: string | number) => {
    if (String(eventId).startsWith('temp-')) {
      e.preventDefault();
      return;
    }
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

    const eventToMove = events.find((ev) => String(ev.id) === eventId);
    if (!eventToMove) return;

    const { start: oldStart, end: oldEnd } = getEventDayBounds(eventToMove);
    const duration = Math.round((oldEnd.getTime() - oldStart.getTime()) / 86400000);

    const newStart = startOfDay(targetDate);
    const newEnd = addDays(newStart, duration);

    const updatedEvent: CalendarEvent = {
      ...eventToMove,
      start_date: format(newStart, 'yyyy-MM-dd'),
      end_date: format(newEnd, 'yyyy-MM-dd'),
    };

    const previousEvents = [...events];
    setEvents(events.map((ev) => (String(ev.id) === eventId ? updatedEvent : ev)));
    showToast('行程已移動');

    try {
      const res = await apiFetch(`/api/events/${eventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildCleanEventPayload(updatedEvent)),
      });
      if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        throw new Error(result.error || '移動失敗');
      }
    } catch (err: any) {
      setEvents(previousEvents);
      showToast(`移動失敗: ${err.message}`, 'error');
    }
  };

  // Quick Add handler
  const handleQuickAdd = async (member: string, preset: QuickAddPreset) => {
    const dateStr = format(selectedDay, 'yyyy-MM-dd');
    const lockKey = `${preset.id}-${member}-${dateStr}`;

    if (pendingQuickAdds.current.has(lockKey)) return;

    const alreadyExists = events.some(
      (e) => e.member_name === member && e.title === preset.title && isEventOnDate(e, selectedDay)
    );
    if (alreadyExists) {
      showToast(`${member} 在 ${format(selectedDay, 'MM/dd')} 已經有${preset.title}了`, 'error');
      return;
    }

    pendingQuickAdds.current.add(lockKey);

    const eventColor = MEMBER_COLORS[member] || '#4F46E5';
    const quickPayload = buildCleanEventPayload({
      title: preset.title,
      description: '',
      start_date: dateStr,
      end_date: dateStr,
      time: '',
      member_name: member,
      color: eventColor,
      is_important: false,
    });

    const tempId = `temp-${preset.id}-${Date.now()}`;
    const optimisticEvent: CalendarEvent = { ...quickPayload, id: tempId, syncing: true };

    setEvents((prev) => [...prev, optimisticEvent]);
    showToast(`正在新增 ${member} ${preset.title}...`);
    setIsDayModalOpen(false);

    if (filterMember !== '全部' && filterMember !== member) {
      setFilterMember(member);
    }

    try {
      const res = await apiFetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quickPayload),
      });

      const contentType = res.headers.get('content-type');
      let result;
      if (contentType && contentType.includes('application/json')) {
        result = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`伺服器回應異常 (非 JSON): ${text.substring(0, 50)}...`);
      }

      if (!res.ok) throw new Error(result.error || `操作失敗 (${res.status})`);

      const lockData = { is_important: false, timestamp: Date.now() };
      const signature = `${quickPayload.title}|${quickPayload.start_date}|${quickPayload.member_name}`.toLowerCase().trim();
      importanceLocker.current.set(signature, lockData);

      showToast(`已成功新增 ${member} ${preset.title}`);

      if (result.id) {
        const realId = String(result.id);
        setEvents((prev) => {
          if (prev.some((e) => String(e.id) === realId)) {
            return prev.filter((e) => String(e.id) !== tempId);
          }
          return prev.map((e) => (String(e.id) === tempId ? { ...e, id: realId, syncing: false } : e));
        });
      }
    } catch (err: any) {
      console.error('Quick Add Error:', err);
      showToast(`新增失敗: ${err.message}`, 'error');
      setEvents((prev) => prev.filter((e) => String(e.id) !== tempId));
    } finally {
      pendingQuickAdds.current.delete(lockKey);
    }
  };

  // Preset management
  const addPreset = () => {
    const title = newPresetTitle.trim();
    if (!title) return;
    if (quickAddPresets.some((p) => p.title === title)) {
      showToast('已經有相同名稱的選項了', 'error');
      return;
    }
    setQuickAddPresets((prev) => [...prev, { id: `custom-${Date.now()}`, title }]);
    setNewPresetTitle('');
  };

  const removePreset = (id: string) => {
    setQuickAddPresets((prev) => prev.filter((p) => p.id !== id));
    if (activeQuickAddId === id) setActiveQuickAddId(null);
  };

  const savePresets = async () => {
    if (quickAddPresets.length === 0) {
      showToast('至少要保留一個選項', 'error');
      return;
    }
    setIsSavingPresets(true);
    try {
      const res = await apiFetch('/api/config/quick-add-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presets: quickAddPresets }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `儲存失敗 (${res.status})`);
      showToast('已儲存一鍵新增選項');
      setIsManagePresetsOpen(false);
    } catch (err: any) {
      console.error('Save Quick-Add Presets Error:', err);
      showToast(`儲存失敗: ${err.message}`, 'error');
    } finally {
      setIsSavingPresets(false);
    }
  };

  const openCreateModal = (date: Date = new Date()) => {
    setEditingEventId(null);
    setNewEvent(createEmptyEventForm(format(date, 'yyyy-MM-dd')));
    setIsModalOpen(true);
  };

  const handleEditClick = (event: CalendarEvent) => {
    if (String(event.id).startsWith('temp-')) {
      showToast('此活動正在同步中，請稍候再編輯', 'error');
      return;
    }
    setEditingEventId(event.id);
    const startDate = normalizeDateForInput(event.start_date);
    const endDate = normalizeDateForInput(event.end_date || event.start_date);
    const { startTime, endTime, displayTime } = parseEventTimeRange(event.time, event.start_date);

    setNewEvent({
      title: event.title || '',
      description: event.description || '',
      start_date: startDate,
      end_date: endDate || startDate,
      time: displayTime,
      start_time: startTime,
      end_time: endTime,
      member_name: event.member_name || FAMILY_MEMBERS[0],
      color: event.color || MEMBER_COLORS[event.member_name] || MEMBER_COLORS[FAMILY_MEMBERS[0]],
      companions: event.companions || '',
      is_important: Boolean(event.is_important),
    });
    setIsModalOpen(true);
  };

  const handleDeleteEvent = (event: CalendarEvent) => {
    if (String(event.id).startsWith('temp-')) {
      showToast('此活動正在同步中，請稍候再操作', 'error');
      return;
    }
    setEventToDelete(event.id);
    setEventToDeleteObj(event);
    setIsDeleteModalOpen(true);
  };

  const undoDelete = async (ev: CalendarEvent) => {
    const cleanPayload = buildCleanEventPayload(ev);
    const tempId = `temp-undo-${Date.now()}`;
    setEvents((prev) => [...prev, { ...cleanPayload, id: tempId }]);
    showToast('正在復原…');
    try {
      const res = await apiFetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanPayload),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || '復原失敗');
      if (result.id) {
        const realId = String(result.id);
        setEvents((prev) => {
          if (prev.some((e) => String(e.id) === realId)) {
            return prev.filter((e) => String(e.id) !== tempId);
          }
          return prev.map((e) => (String(e.id) === tempId ? { ...e, id: realId } : e));
        });
      }
      showToast('已復原行程');
    } catch (err: any) {
      setEvents((prev) => prev.filter((e) => String(e.id) !== tempId));
      showToast(`復原失敗: ${err.message}`, 'error');
    }
  };

  const executeDelete = async () => {
    if (!eventToDelete || !eventToDeleteObj) return;

    const deletedEvent = eventToDeleteObj;
    const previousEvents = [...events];
    setIsDeleteModalOpen(false);
    setEvents(events.filter((e) => e.id !== eventToDelete));

    try {
      const res = await apiFetch(`/api/events/${eventToDelete}`, {
        method: 'DELETE',
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || '刪除請求失敗');
      }
      showToast(`已刪除「${deletedEvent.title}」`, 'success', { label: '復原', onClick: () => undoDelete(deletedEvent) }, 6000);
    } catch (err: any) {
      setEvents(previousEvents);
      showToast(`刪除失敗: ${err.message}`, 'error');
    }
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newEvent.end_date && newEvent.start_date && newEvent.end_date < newEvent.start_date) {
      showToast('結束日期不能早於開始日期', 'error');
      return;
    }

    const eventColor = MEMBER_COLORS[newEvent.member_name] || '#4F46E5';
    const isEditing = !!editingEventId;

    let combinedTime = '';
    if (newEvent.start_time && newEvent.end_time) {
      combinedTime = `${newEvent.start_time} - ${newEvent.end_time}`;
    } else if (newEvent.start_time) {
      combinedTime = newEvent.start_time;
    } else if (newEvent.end_time) {
      combinedTime = ` - ${newEvent.end_time}`;
    } else if (isEditing && newEvent.time && !/^\d{1,2}:\d{2}/.test(newEvent.time)) {
      // Preserve non-HH:mm legacy/AI time text when time inputs weren't populated
      combinedTime = newEvent.time;
    }

    const payload = buildCleanEventPayload({
      ...newEvent,
      time: combinedTime,
      color: eventColor,
    });

    const optimisticEvent: CalendarEvent = {
      ...payload,
      id: isEditing ? editingEventId : `temp-${Date.now()}`,
    };

    const previousEvents = [...events];

    if (isEditing) {
      setEvents(events.map((ev) => (ev.id === editingEventId ? optimisticEvent : ev)));
    } else {
      setEvents([...events, optimisticEvent]);
    }

    try {
      const url = isEditing ? `/api/events/${editingEventId}` : '/api/events';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const contentType = res.headers.get('content-type');
      let result;
      if (contentType && contentType.includes('application/json')) {
        result = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`伺服器傳回非 JSON 回應: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
      }

      if (!res.ok) throw new Error(result.error || '儲存失敗');

      const lockData = { is_important: !!payload.is_important, timestamp: Date.now() };
      const signature = `${payload.title}|${payload.start_date}|${payload.member_name}`.toLowerCase().trim();
      importanceLocker.current.set(signature, lockData);
      if (editingEventId) importanceLocker.current.set(String(editingEventId), lockData);

      if (result.event) {
        const serverEvent = { ...result.event, id: String(result.event.id) };
        setEvents((prev) => {
          const alreadyHasReal = !isEditing && prev.some((ev) => String(ev.id) === serverEvent.id);
          if (alreadyHasReal) {
            return prev
              .filter((ev) => ev.id !== optimisticEvent.id)
              .map((ev) => (String(ev.id) === serverEvent.id ? serverEvent : ev));
          }
          return prev.map((ev) =>
            ev.id === optimisticEvent.id || String(ev.id) === serverEvent.id ? serverEvent : ev
          );
        });
      } else if (!isEditing && result.id) {
        const realId = String(result.id);
        setEvents((prev) => {
          if (prev.some((ev) => String(ev.id) === realId)) {
            return prev.filter((ev) => ev.id !== optimisticEvent.id);
          }
          return prev.map((ev) => (ev.id === optimisticEvent.id ? { ...ev, id: realId } : ev));
        });
      }

      setIsModalOpen(false);
      setEditingEventId(null);
      setNewEvent(createEmptyEventForm());
      showToast(isEditing ? '活動已更新' : '活動已儲存');
    } catch (err: any) {
      setEvents(previousEvents);
      showToast(`儲存失敗: ${err.message}`, 'error');
    }
  };

  // Calendar grid range
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const gridStartDate = startOfWeek(monthStart);
  const gridEndDate = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: gridStartDate, end: gridEndDate });

  const filteredEvents = useMemo(
    () => events.filter((event) => filterMember === '全部' || event.member_name === filterMember),
    [events, filterMember]
  );

  // Calculate lanes for multi-day events within the visible calendar grid (bounded O(42) per event)
  const gridStartMs = gridStartDate.getTime();
  const gridEndMs = gridEndDate.getTime();

  const eventLanes = useMemo(() => {
    const lanes: Record<string, number> = {};
    const occupiedSlots: Record<string, boolean[]> = {};
    const gridStart = new Date(gridStartMs);
    const gridEnd = new Date(gridEndMs);

    const sortedForLanes = [...filteredEvents].sort((a, b) => {
      const { start: startA, end: endA } = getEventDayBounds(a);
      const { start: startB, end: endB } = getEventDayBounds(b);

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

    sortedForLanes.forEach((event) => {
      const { start, end } = getEventDayBounds(event);
      if (end < gridStart || start > gridEnd) return;

      const clampedStart = start > gridStart ? start : gridStart;
      const clampedEnd = end < gridEnd ? end : gridEnd;

      let lane = 0;
      let foundLane = false;

      while (!foundLane) {
        let isLaneFree = true;
        let curr = new Date(clampedStart);
        while (curr <= clampedEnd) {
          const dateKey = format(curr, 'yyyy-MM-dd');
          if (occupiedSlots[dateKey] && occupiedSlots[dateKey][lane]) {
            isLaneFree = false;
            break;
          }
          curr = addDays(curr, 1);
        }

        if (isLaneFree) {
          lanes[event.id] = lane;
          let fillCurr = new Date(clampedStart);
          while (fillCurr <= clampedEnd) {
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
  }, [filteredEvents, gridStartMs, gridEndMs]);

  const selectedDayEvents = useMemo(
    () => filteredEvents.filter((e) => isEventOnDate(e, selectedDay)),
    [filteredEvents, selectedDay]
  );

  const upcomingEvents = useMemo(() => {
    const today = startOfDay(new Date());
    return filteredEvents
      .filter((e) => getEventDayBounds(e).end >= today)
      .sort((a, b) => {
        const dateA = safeParseISO(a.start_date).getTime();
        const dateB = safeParseISO(b.start_date).getTime();
        if (dateA !== dateB) return dateA - dateB;
        const aIsLeave = String(a.title || '').includes('休') || String(a.title || '').includes('假');
        const bIsLeave = String(b.title || '').includes('休') || String(b.title || '').includes('假');
        if (aIsLeave && !bIsLeave) return -1;
        if (!aIsLeave && bIsLeave) return 1;
        return 0;
      })
      .slice(0, 10);
  }, [filteredEvents]);

  const upcomingImportantEvents = useMemo(() => {
    const today = startOfDay(new Date());
    return events
      .filter((event) => event.is_important && getEventDayBounds(event).end >= today)
      .sort((a, b) => safeParseISO(a.start_date).getTime() - safeParseISO(b.start_date).getTime());
  }, [events]);

  // Dashboard stats (accurately counts overlapping days within current month)
  const monthlyStats = useMemo(() => {
    const familyOutings = events.filter(
      (e) => e.member_name === '全家' && countEventDaysInMonth(e, currentDate) > 0
    ).length;

    const isLeaveTitle = (t: string) => t.includes('休') || t.includes('假');
    let totalLeaveDays = 0;
    const memberLeaveDays: Record<string, number> = {};

    events.forEach((e) => {
      if (!isLeaveTitle(String(e.title || ''))) return;
      const days = countEventDaysInMonth(e, currentDate);
      if (days <= 0) return;
      totalLeaveDays += days;
      if (e.member_name && e.member_name !== '全家') {
        memberLeaveDays[e.member_name] = (memberLeaveDays[e.member_name] || 0) + days;
      }
    });

    return { familyOutings, totalLeaveDays, memberLeaveDays };
  }, [events, currentDate]);

  // List View days in current month that have at least one overlapping event
  const listViewDays = useMemo(() => {
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
    return daysInMonth
      .map((day) => ({
        day,
        dateKey: format(day, 'yyyy-MM-dd'),
        dayEvents: filteredEvents
          .filter((e) => isEventOnDate(e, day))
          .sort((a, b) => String(a.time || '').localeCompare(String(b.time || ''))),
      }))
      .filter((entry) => entry.dayEvents.length > 0);
  }, [filteredEvents, monthStart, monthEnd]);

  if (authChecking || !authed) {
    return (
      <AuthGate
        authChecking={authChecking}
        keyInput={keyInput}
        keyError={keyError}
        authSubmitting={authSubmitting}
        onKeyInputChange={setKeyInput}
        onSubmitKey={handleSubmitKey}
      />
    );
  }

  return (
    <div
      className={cn(
        'min-h-screen bg-orange-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 font-sans pb-24 md:pb-0 transition-colors duration-300',
        isDarkMode && 'dark'
      )}
    >
      {/* Header */}
      <header className="bg-[#8A3A24] dark:bg-stone-900/95 backdrop-blur-md border-b border-stone-200 dark:border-stone-800 px-3.5 md:px-6 h-14 md:h-[72px] flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-2.5 md:gap-3 min-w-0">
          <div className="w-8 h-8 md:w-10 md:h-10 bg-orange-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-orange-950/30 flex-shrink-0">
            <CalendarIcon size={17} className="md:hidden" />
            <CalendarIcon size={22} className="hidden md:block" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="text-base md:text-xl font-black tracking-tight truncate text-[#FDEDD3] dark:text-stone-100">
                家庭行事曆
              </h1>
              <span
                className={cn(
                  'w-2 h-2 rounded-full shrink-0',
                  storageSource === 'local' ? 'bg-amber-400' : 'bg-emerald-400'
                )}
                title={storageSource === 'local' ? '本地儲存' : '雲端同步'}
              />
            </div>
            <span className="hidden md:inline text-[10px] font-bold text-orange-200/90 dark:text-stone-400 uppercase tracking-wider">
              {storageSource === 'local' ? '本地模式' : '雲端同步'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 md:gap-3">
          {/* Desktop Month Switcher */}
          <div className="hidden md:flex items-center bg-stone-100 dark:bg-stone-800 rounded-xl p-1">
            <button
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
              className="p-1.5 hover:bg-white dark:hover:bg-stone-700 hover:shadow-sm rounded-lg transition-all"
              title="上個月"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="px-3 font-black text-sm min-w-[110px] text-center">
              {format(currentDate, 'yyyy年 MM月')}
            </span>
            <button
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
              className="p-1.5 hover:bg-white dark:hover:bg-stone-700 hover:shadow-sm rounded-lg transition-all"
              title="下個月"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <button
            onClick={() => {
              const now = new Date();
              setCurrentDate(now);
              setSelectedDay(now);
            }}
            className="hidden md:flex items-center justify-center bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 px-3 py-2 rounded-xl text-xs font-bold text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors shadow-sm"
          >
            今天
          </button>

          <button
            onClick={() => setIsElderlyMode(!isElderlyMode)}
            className={cn(
              'items-center justify-center px-2.5 md:px-3 py-1.5 md:py-2 rounded-xl text-xs font-extrabold transition-colors shadow-sm border',
              isElderlyMode
                ? 'flex bg-amber-500 text-white border-amber-400'
                : 'hidden md:flex bg-white/95 dark:bg-stone-800 text-stone-700 dark:text-stone-200 border-white/20 dark:border-stone-700 hover:bg-white dark:hover:bg-stone-700'
            )}
            title="長輩友善模式"
          >
            {isElderlyMode ? '退出長輩模式' : '長輩模式'}
          </button>

          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center text-orange-100 hover:text-white dark:text-stone-300 dark:hover:text-white bg-white/10 hover:bg-white/20 dark:bg-stone-800 dark:hover:bg-stone-700 rounded-xl transition-colors"
            title={isDarkMode ? '切換為淺色模式' : '切換為深色模式'}
          >
            {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <button
            onClick={() => fetchEvents(true)}
            className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center text-orange-100 hover:text-white dark:text-stone-300 dark:hover:text-white bg-white/10 hover:bg-white/20 dark:bg-stone-800 dark:hover:bg-stone-700 rounded-xl transition-colors"
            title="重新整理"
          >
            <Zap size={16} className={cn(loading && 'animate-pulse text-amber-300')} />
          </button>

          <button
            onClick={() => setShowDebug(!showDebug)}
            className={cn(
              'w-8 h-8 md:w-9 md:h-9 flex items-center justify-center rounded-xl transition-colors',
              showDebug
                ? 'bg-orange-500 text-white'
                : 'text-orange-100/80 hover:text-white dark:text-stone-400 dark:hover:text-white bg-white/10 hover:bg-white/20 dark:bg-stone-800 dark:hover:bg-stone-700'
            )}
            title="偵錯資訊"
          >
            <Info size={16} />
          </button>

          <button
            onClick={() => openCreateModal(new Date())}
            className="hidden md:flex bg-orange-600 text-white px-4 py-2 rounded-xl font-bold items-center gap-1.5 hover:bg-orange-700 transition-colors shadow-sm text-sm"
          >
            <Plus size={18} />
            <span>新增活動</span>
          </button>
        </div>
      </header>

      <main className="px-2.5 py-3 sm:p-4 md:p-6 max-w-7xl mx-auto">
        {/* 置頂重要公告 */}
        {upcomingImportantEvents.length > 0 && (
          <div className="mb-3.5 md:mb-6">
            <div
              className={cn(
                'bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200/70 dark:border-amber-800/40 rounded-2xl shadow-sm overflow-hidden',
                isElderlyMode ? 'p-5 md:p-6' : 'p-3 md:p-4'
              )}
            >
              <div className="flex items-center justify-between mb-2.5 md:mb-3">
                <div
                  className={cn(
                    'flex items-center gap-1.5 text-amber-800 dark:text-amber-400 font-black tracking-wider uppercase',
                    isElderlyMode ? 'text-xl' : 'text-xs'
                  )}
                >
                  <Megaphone size={isElderlyMode ? 26 : 14} />
                  <span>置頂重要公告</span>
                </div>
                <span
                  className={cn(
                    'font-bold text-amber-700 dark:text-amber-400 bg-amber-200/60 dark:bg-amber-900/50 rounded-full',
                    isElderlyMode ? 'px-4 py-1 text-lg' : 'px-2 py-0.5 text-[11px]'
                  )}
                >
                  {upcomingImportantEvents.length} 則
                </span>
              </div>
              <div
                className={cn(
                  isElderlyMode
                    ? 'grid grid-cols-1 gap-3'
                    : 'flex sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 md:gap-3 overflow-x-auto sm:overflow-visible snap-x no-scrollbar pb-0.5'
                )}
              >
                {upcomingImportantEvents.map((evt) => (
                  <div
                    key={evt.id}
                    onClick={() => handleEditClick(evt)}
                    className={cn(
                      'flex flex-col bg-white/90 dark:bg-stone-900/90 backdrop-blur-sm rounded-xl border border-amber-200/60 dark:border-amber-800/40 shadow-sm transition-all hover:shadow-md cursor-pointer group shrink-0',
                      isElderlyMode ? 'p-5' : 'w-[220px] sm:w-auto snap-start p-3'
                    )}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className={cn(
                          'text-amber-600 dark:text-amber-400 font-extrabold flex items-center gap-1',
                          isElderlyMode ? 'text-xl' : 'text-xs'
                        )}
                      >
                        <Star size={isElderlyMode ? 20 : 12} className="fill-amber-500 text-amber-500" />
                        {format(safeParseISO(evt.start_date), 'MM/dd')}
                      </span>
                      <span
                        className={cn(
                          'font-bold text-stone-600 dark:text-stone-300 bg-stone-100 dark:bg-stone-800 px-2 py-0.5 rounded-md',
                          isElderlyMode ? 'text-xl' : 'text-[11px]'
                        )}
                      >
                        {evt.member_name}
                      </span>
                    </div>
                    <div
                      className={cn(
                        'font-black text-stone-900 dark:text-stone-100 line-clamp-1 mb-1',
                        isElderlyMode ? 'text-3xl leading-tight line-clamp-2' : 'text-sm'
                      )}
                    >
                      {evt.title}
                    </div>
                    {evt.time && formatTimeDisplay(evt.time) && (
                      <div className="flex items-center gap-1 mt-auto pt-1.5 border-t border-amber-100/60 dark:border-amber-900/30">
                        <Clock size={isElderlyMode ? 18 : 11} className="text-orange-500" />
                        <span
                          className={cn(
                            'font-bold text-stone-500 dark:text-stone-400',
                            isElderlyMode ? 'text-xl' : 'text-[11px]'
                          )}
                        >
                          {formatTimeDisplay(evt.time)}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {isElderlyMode ? (
          <div className="space-y-6 pb-20">
            {Array.from({ length: 7 }).map((_, index) => {
              const day = addDays(new Date(), index);
              const dateKey = format(day, 'yyyy-MM-dd');
              const isToday = index === 0;
              const isTomorrow = index === 1;

              let dayLabel = format(day, 'MM/dd');
              if (isToday) dayLabel = `今天 (${dayLabel})`;
              else if (isTomorrow) dayLabel = `明天 (${dayLabel})`;
              else {
                const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
                dayLabel = `週${weekDays[day.getDay()]} (${dayLabel})`;
              }

              const dayTheme = isToday
                ? {
                    border: 'border-orange-200 dark:border-orange-900',
                    text: 'text-orange-700 dark:text-orange-400',
                    accent: 'text-orange-600 dark:text-orange-400',
                  }
                : isTomorrow
                  ? {
                      border: 'border-emerald-200 dark:border-emerald-900',
                      text: 'text-emerald-700 dark:text-emerald-400',
                      accent: 'text-emerald-600 dark:text-emerald-400',
                    }
                  : {
                      border: 'border-stone-200 dark:border-stone-800',
                      text: 'text-stone-700 dark:text-stone-300',
                      accent: 'text-stone-600 dark:text-stone-400',
                    };

              const dayEvents = events.filter((e) => isEventOnDate(e, day));

              return (
                <div
                  key={dateKey}
                  className={cn('bg-white dark:bg-stone-900 rounded-3xl p-5 md:p-6 shadow-md border-4', dayTheme.border)}
                >
                  <div className={cn('mb-5 border-b-4 pb-3.5', dayTheme.border)}>
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      <h2 className={cn('text-3xl md:text-4xl font-black', dayTheme.text)}>{dayLabel}</h2>
                      {allHolidays[dateKey] && (
                        <span className="bg-rose-100 text-rose-700 px-3.5 py-1 rounded-xl text-xl md:text-2xl font-bold">
                          {allHolidays[dateKey]}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xl md:text-2xl font-bold text-stone-600 dark:text-stone-400">
                      <span>農曆 {getLunarDate(day)}</span>
                      {weatherData?.[dateKey] && (
                        <span className="flex items-center gap-2">
                          | {WEATHER_ICONS[weatherData[dateKey].code]}{' '}
                          {WEATHER_DESCRIPTIONS[weatherData[dateKey].code]} {Math.round(weatherData[dateKey].min)}°~
                          {Math.round(weatherData[dateKey].max)}°
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-4">
                    {dayEvents.length === 0 ? (
                      <p className="text-2xl md:text-3xl text-stone-400 font-bold py-6 text-center">這天沒有活動</p>
                    ) : (
                      dayEvents.map((event) => (
                        <div
                          key={event.id}
                          className="bg-stone-50 dark:bg-stone-800 rounded-2xl p-5 border-2 border-stone-200 dark:border-stone-700 flex flex-col gap-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span
                                className="text-xl md:text-2xl font-black px-3.5 py-1.5 rounded-xl text-white"
                                style={{ backgroundColor: event.color || '#4F46E5' }}
                              >
                                {event.member_name}
                              </span>
                              {event.time && (
                                <span className={cn('text-2xl md:text-3xl font-bold', dayTheme.accent)}>
                                  {formatTimeDisplay(event.time)}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleEditClick(event)}
                                className="p-2.5 bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300 rounded-xl hover:bg-stone-300 dark:hover:bg-stone-600 transition-colors"
                              >
                                <Edit size={24} />
                              </button>
                              <button
                                onClick={() => handleDeleteEvent(event)}
                                className="p-2.5 bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-xl hover:bg-rose-200 dark:hover:bg-rose-900/50 transition-colors"
                              >
                                <Trash2 size={24} />
                              </button>
                            </div>
                          </div>
                          <h3 className="text-3xl md:text-4xl font-black text-stone-900 dark:text-stone-100">
                            {event.title}
                          </h3>
                          {event.description && (
                            <p className="text-xl md:text-2xl text-stone-600 dark:text-stone-400">{event.description}</p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}

            <button
              onClick={() => openCreateModal(new Date())}
              className="w-full bg-orange-600 text-white py-5 rounded-3xl font-black text-2xl md:text-3xl flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-transform"
            >
              <Plus size={34} />
              新增活動
            </button>
          </div>
        ) : (
          <>
            {/* Integrated Mobile Month Switcher + Weather Bar / Desktop View Toggle */}
            <div className="flex items-center justify-between gap-2 mb-2.5 md:mb-5">
              {/* Mobile Unified Bar: Month Navigation (Left) + Weather Pill & Today (Right) */}
              <div className="flex md:hidden items-center justify-between w-full bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 rounded-2xl px-1.5 py-1.5 shadow-sm gap-1 min-w-0">
                <div className="flex items-center min-w-0">
                  <button
                    onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 active:scale-95 transition-all shrink-0"
                    title="上個月"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="px-1 font-black text-sm min-[360px]:text-[15px] text-stone-900 dark:text-stone-100 tracking-tight whitespace-nowrap">
                    {format(currentDate, 'yyyy年 MM月')}
                  </span>
                  <button
                    onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 active:scale-95 transition-all shrink-0"
                    title="下個月"
                  >
                    <ChevronRight size={18} />
                  </button>
                  <button
                    onClick={() => {
                      const now = new Date();
                      setCurrentDate(now);
                      setSelectedDay(now);
                    }}
                    className="ml-0.5 px-2 py-0.5 rounded-lg bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border border-orange-200/60 dark:border-orange-800/50 text-[11px] font-extrabold active:scale-95 transition-all whitespace-nowrap shrink-0"
                  >
                    今天
                  </button>
                </div>

                {currentWeather && (
                  <button
                    type="button"
                    onClick={() => {
                      const todayRange = weatherData?.[format(new Date(), 'yyyy-MM-dd')];
                      const rangeStr = todayRange
                        ? ` (${Math.round(todayRange.min)}°~${Math.round(todayRange.max)}°C)`
                        : '';
                      if (userCoords) {
                        showToast(
                          `${locationName}：${WEATHER_DESCRIPTIONS[currentWeather.code] || ''} ${Math.round(currentWeather.temp)}°C${rangeStr} · 濕度 ${currentWeather.humidity}%`,
                          'success',
                          { label: '設為推播地點', onClick: handleSaveCurrentLocationForLine },
                          5000
                        );
                      } else {
                        showToast(
                          `${locationName}：${WEATHER_DESCRIPTIONS[currentWeather.code] || ''} ${Math.round(currentWeather.temp)}°C${rangeStr} · 濕度 ${currentWeather.humidity}%`
                        );
                      }
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-xl bg-gradient-to-r from-orange-600 to-violet-600 text-white text-xs font-extrabold shadow-xs active:scale-95 transition-transform min-w-0 shrink-0"
                    title="點擊查看詳細天氣或設為 LINE 推播地點"
                  >
                    <span className="shrink-0">{WEATHER_ICONS[currentWeather.code]}</span>
                    <span className="font-black">{Math.round(currentWeather.temp)}°</span>
                    <span className="hidden min-[360px]:inline text-[10px] font-bold text-orange-100 truncate max-w-[56px]">
                      {locationName.split(' ').pop() || locationName}
                    </span>
                  </button>
                )}
              </div>

              {/* Desktop View Toggle */}
              <div className="hidden md:flex bg-stone-200 dark:bg-stone-800 p-1 rounded-xl w-fit">
                <button
                  onClick={() => setViewMode('calendar')}
                  className={cn(
                    'px-6 py-2 rounded-lg text-sm font-bold transition-all',
                    viewMode === 'calendar'
                      ? 'bg-white dark:bg-stone-700 shadow-sm text-orange-600 dark:text-orange-400'
                      : 'text-stone-500 dark:text-stone-400'
                  )}
                >
                  月曆模式
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={cn(
                    'px-6 py-2 rounded-lg text-sm font-bold transition-all',
                    viewMode === 'list'
                      ? 'bg-white dark:bg-stone-700 shadow-sm text-orange-600 dark:text-orange-400'
                      : 'text-stone-500 dark:text-stone-400'
                  )}
                >
                  列表模式
                </button>
              </div>
            </div>

            {/* Compact Single-Row Filter & Quick-Add Bar */}
            <div className="mb-2.5 md:mb-5 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              {/* 成員篩選下拉選單 */}
              <div className="relative flex-shrink-0">
                <select
                  value={filterMember}
                  onChange={(e) => setFilterMember(e.target.value)}
                  className={cn(
                    'appearance-none pl-3.5 pr-8 py-1.5 rounded-full text-xs font-extrabold transition-all border bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 outline-none cursor-pointer shadow-sm',
                    filterMember !== '全部' &&
                      'pl-6 border-stone-800 dark:border-stone-200 ring-1 ring-stone-800 dark:ring-stone-200'
                  )}
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 10px center',
                    backgroundSize: '12px',
                  }}
                >
                  <option value="全部">👥 全部成員</option>
                  {FAMILY_MEMBERS.map((member) => (
                    <option key={member} value={member}>
                      {member}
                    </option>
                  ))}
                </select>
                {filterMember !== '全部' && (
                  <div
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full pointer-events-none"
                    style={{ backgroundColor: MEMBER_COLORS[filterMember] || '#4F46E5' }}
                  />
                )}
              </div>

              {/* 一鍵新增下拉選單 */}
              <div className="relative flex-shrink-0">
                <select
                  value={activeQuickAddId || 'none'}
                  onChange={(e) => setActiveQuickAddId(e.target.value === 'none' ? null : e.target.value)}
                  className={cn(
                    'appearance-none pl-3.5 pr-8 py-1.5 rounded-full text-xs font-extrabold transition-all border outline-none cursor-pointer shadow-sm',
                    activeQuickAddId
                      ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                      : 'bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700'
                  )}
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 10px center',
                    backgroundSize: '11px',
                  }}
                >
                  <option value="none">⚡ 一鍵新增</option>
                  {quickAddPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      ⚡ 點日期加：{preset.title}
                    </option>
                  ))}
                </select>
              </div>

              {activeQuickAddId && (
                <button
                  type="button"
                  onClick={() => setActiveQuickAddId(null)}
                  className="flex-shrink-0 px-2.5 py-1.5 rounded-full text-xs font-extrabold bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 hover:bg-rose-100 transition-colors"
                  title="結束一鍵新增模式"
                >
                  ✕ 結束一鍵
                </button>
              )}

              <button
                onClick={() => setIsManagePresetsOpen(true)}
                className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-extrabold transition-all border bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 shadow-sm"
                title="管理一鍵新增選項"
              >
                <Settings size={13} />
                <span>管理項目</span>
              </button>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 p-4 rounded-xl mb-4 flex flex-col gap-3">
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
              </div>
            )}

            {warning && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-amber-700 dark:text-amber-400 p-4 rounded-xl mb-4 flex items-center gap-3">
                <AlertTriangle size={20} className="text-amber-500" />
                <p className="text-sm font-medium">{warning}</p>
              </div>
            )}

            {showDebug && (
              <DebugPanel
                events={events}
                filteredEvents={filteredEvents}
                storageSource={storageSource}
                warning={warning}
                configStatus={configStatus}
                webhookLogs={webhookLogs}
                isLoadingLogs={isLoadingLogs}
                onRefreshEvents={() => fetchEvents(true)}
                onRefreshLogs={fetchWebhookLogs}
                onClearLogs={clearWebhookLogs}
                onClose={() => setShowDebug(false)}
              />
            )}

            {/* Calendar Grid */}
            {viewMode === 'calendar' && (
              <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-200/90 dark:border-stone-800">
                <div className="grid grid-cols-7 border-b border-stone-100 dark:border-stone-800 bg-stone-50/90 dark:bg-stone-800/90 backdrop-blur-md sticky top-14 md:top-[72px] z-30 rounded-t-2xl">
                  {['日', '一', '二', '三', '四', '五', '六'].map((day, idx) => (
                    <div
                      key={day}
                      className={cn(
                        'py-2 md:py-3 text-center text-xs font-black uppercase tracking-widest',
                        idx === 0 || idx === 6
                          ? 'text-rose-500/80 dark:text-rose-400/80'
                          : 'text-stone-500 dark:text-stone-400'
                      )}
                    >
                      {day}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 relative rounded-b-2xl overflow-hidden">
                  {calendarDays.map((day) => {
                    const dayEvents = filteredEvents.filter((e) => isEventOnDate(e, day));

                    const packDaySlots = (maxSlots: number) => {
                      const slots: Array<CalendarEvent | null> = new Array(maxSlots).fill(null);
                      const overflowCandidates: CalendarEvent[] = [];

                      dayEvents.forEach((event) => {
                        const lane = eventLanes[event.id] ?? 999;
                        if (lane < maxSlots && slots[lane] === null) {
                          slots[lane] = event;
                        } else {
                          overflowCandidates.push(event);
                        }
                      });

                      // Fill any free slots on this day so events never get pushed into "+N 則" on otherwise empty days
                      const remainingOverflow: CalendarEvent[] = [];
                      overflowCandidates.forEach((event) => {
                        const freeIdx = slots.findIndex((s) => s === null);
                        if (freeIdx !== -1) {
                          slots[freeIdx] = event;
                        } else {
                          remainingOverflow.push(event);
                        }
                      });

                      let lastUsed = -1;
                      for (let i = 0; i < slots.length; i++) {
                        if (slots[i] !== null) lastUsed = i;
                      }
                      return {
                        activeSlots: lastUsed >= 0 ? slots.slice(0, lastUsed + 1) : [],
                        overflow: remainingOverflow,
                      };
                    };

                    const { activeSlots: activeDaySlots, overflow: dayOverflow } = packDaySlots(4);
                    const { activeSlots: activeMobileSlots, overflow: mobileOverflow } = packDaySlots(3);

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
                        key={dateKey}
                        onClick={() => {
                          setSelectedDay(day);
                          const activePreset = activeQuickAddId
                            ? quickAddPresets.find((p) => p.id === activeQuickAddId)
                            : null;
                          if (activePreset) {
                            if (filterMember !== '全部') {
                              handleQuickAdd(filterMember, activePreset);
                            } else {
                              setQuickSelectPresetId(activePreset.id);
                              setIsQuickSelectOpen(true);
                            }
                          } else {
                            setIsDayModalOpen(true);
                          }
                        }}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, day)}
                        className={cn(
                          'min-h-[76px] sm:min-h-[98px] md:min-h-[130px] p-1 md:p-2 border-r border-b border-stone-100 dark:border-stone-800/80 last:border-r-0 transition-all cursor-pointer relative select-none',
                          !isCurrentMonth && 'bg-stone-50/70 dark:bg-stone-900/50',
                          isSelected && 'bg-orange-50/60 dark:bg-orange-900/20 ring-2 ring-inset ring-orange-400 z-10',
                          isHoliday && isCurrentMonth && 'bg-rose-50/30 dark:bg-rose-950/15',
                          makeupWorkdayName && isCurrentMonth && 'bg-stone-100/50 dark:bg-stone-800/50'
                        )}
                      >
                        {/* Mobile Cell Header: Clean 2-Line Stack (No Crowding) */}
                        <div className="md:hidden flex flex-col mb-1">
                          <div className="flex items-center justify-between px-0.5">
                            <span
                              className={cn(
                                'w-6 h-6 flex items-center justify-center rounded-full text-xs font-black leading-none',
                                isToday
                                  ? 'bg-orange-600 text-white shadow-sm'
                                  : isHoliday || isWeekend
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : isCurrentMonth
                                      ? 'text-stone-800 dark:text-stone-100'
                                      : 'text-stone-400 dark:text-stone-600'
                              )}
                            >
                              {format(day, 'd')}
                            </span>
                            {weather && (
                              <span className="scale-90 opacity-85 shrink-0">{WEATHER_ICONS[weather.code]}</span>
                            )}
                          </div>
                          <div className="px-0.5 mt-0.5 h-[13px] flex items-center">
                            {holidayName ? (
                              <span className="text-[10px] leading-none font-extrabold text-rose-500 dark:text-rose-400 truncate">
                                {holidayName}
                              </span>
                            ) : makeupWorkdayName ? (
                              <span className="text-[10px] leading-none font-bold text-stone-500 dark:text-stone-400 truncate">
                                補班
                              </span>
                            ) : (
                              <span className="text-[10px] leading-none font-medium text-stone-400 dark:text-stone-500 truncate">
                                {getLunarDate(day, true)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Desktop Cell Header */}
                        <div className="hidden md:flex items-center justify-between mb-2 gap-1">
                          <div className="flex items-center gap-1">
                            <span
                              className={cn(
                                'w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold',
                                isToday
                                  ? 'bg-orange-600 text-white shadow-md'
                                  : isHoliday || isWeekend
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : isCurrentMonth
                                      ? 'text-stone-900 dark:text-stone-100'
                                      : 'text-stone-300 dark:text-stone-600'
                              )}
                            >
                              {format(day, 'd')}
                            </span>
                            <span className="text-[11px] text-stone-400 dark:text-stone-500 font-medium">
                              {getLunarDate(day)}
                            </span>
                            {weather && (
                              <div className="flex items-center gap-0.5 group relative">
                                {WEATHER_ICONS[weather.code]}
                                <div className="flex flex-col items-start -space-y-0.5">
                                  <span className="text-[9px] text-stone-400 font-medium">
                                    {Math.round(weather.min)}°~{Math.round(weather.max)}°
                                  </span>
                                  {weather.pop !== undefined && (
                                    <span className="text-[9px] text-blue-500 dark:text-blue-400 font-bold flex items-center gap-0.5">
                                      <CloudRain size={8} /> {weather.pop}%
                                    </span>
                                  )}
                                </div>
                                <div
                                  className={cn(
                                    'absolute bottom-full mb-1 hidden group-hover:block bg-stone-900/95 dark:bg-stone-800/95 text-white text-[11px] py-1.5 px-2.5 rounded-lg shadow-xl backdrop-blur-sm border border-white/10 whitespace-nowrap z-50 animate-in fade-in zoom-in duration-200',
                                    dayOfWeek === 0 ? 'left-0' : dayOfWeek === 6 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                                  )}
                                >
                                  <div className="flex flex-col gap-0.5">
                                    <span className="font-bold text-amber-400">
                                      {WEATHER_DESCRIPTIONS[weather.code] || '未知天氣'}
                                    </span>
                                    <span className="opacity-90">
                                      {Math.round(weather.min)}°C ~ {Math.round(weather.max)}°C
                                    </span>
                                    {weather.pop !== undefined && (
                                      <span className="text-blue-300 font-medium flex items-center gap-1">
                                        <CloudRain size={10} /> 降雨機率: {weather.pop}%
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {holidayName && (
                              <span className="text-[11px] font-black text-rose-500 dark:text-rose-400 truncate bg-rose-50 dark:bg-rose-900/30 px-1.5 py-0.5 rounded border border-rose-100 dark:border-rose-900/50">
                                {holidayName}
                              </span>
                            )}
                            {makeupWorkdayName && (
                              <span className="text-[11px] font-black text-stone-500 dark:text-stone-400 truncate bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded border border-stone-200 dark:border-stone-700">
                                {makeupWorkdayName}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col gap-0.5 md:gap-1 relative z-20">
                          {/* Desktop Event Bars */}
                          <div className="hidden md:flex flex-col gap-1">
                            {activeDaySlots.map((event, slotIndex) => {
                              if (!event) {
                                return <div key={`empty-${slotIndex}`} className="h-[22px] invisible" />;
                              }
                              const eventTitle = String(event.title || '無標題');
                              const badgeLabel = formatCalendarBadgeTitle(event, filterMember);
                              const isLeave = eventTitle.includes('休') || eventTitle.includes('假');
                              const icon = getEventIcon(eventTitle, 10);
                              const { start, end } = getEventDayBounds(event);
                              const isMultiDay = start.getTime() !== end.getTime();
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
                                    backgroundColor: isLeave
                                      ? `${event.color || '#4F46E5'}25`
                                      : `${event.color || '#4F46E5'}15`,
                                    borderLeft: isStart || !isMultiDay ? `3px solid ${event.color || '#4F46E5'}` : 'none',
                                    color: event.color || '#4F46E5',
                                    borderTopLeftRadius: isStart || !isMultiDay ? '4px' : '0',
                                    borderBottomLeftRadius: isStart || !isMultiDay ? '4px' : '0',
                                    borderTopRightRadius: isEnd || !isMultiDay ? '4px' : '0',
                                    borderBottomRightRadius: isEnd || !isMultiDay ? '4px' : '0',
                                    marginLeft: isStart || !isMultiDay ? '0' : '-9px',
                                    marginRight: isEnd || !isMultiDay ? '0' : '-9px',
                                    paddingLeft: isStart || !isMultiDay ? '6px' : '10px',
                                    paddingRight: isEnd || !isMultiDay ? '6px' : '10px',
                                    zIndex: isMultiDay ? 10 : 1,
                                  }}
                                  className={cn(
                                    'py-0.5 text-[13px] font-bold truncate hover:brightness-95 transition-all flex items-center gap-1 cursor-grab active:cursor-grabbing h-[22px]',
                                    isLeave && 'ring-1 ring-inset ring-white/20',
                                    event.syncing && 'opacity-50 animate-pulse'
                                  )}
                                >
                                  {event.is_important && <span className="shrink-0 text-amber-500">⭐</span>}
                                  {icon && <span className="shrink-0">{icon}</span>}
                                  <span className="truncate">{badgeLabel}</span>
                                </div>
                              );
                            })}
                            {dayOverflow.length > 0 && (
                              <div className="text-[10px] text-stone-400 font-black pl-1 flex items-center gap-1">
                                <Plus size={8} /> {dayOverflow.length} 更多
                              </div>
                            )}
                          </div>

                          {/* Mobile Event Bars: Clean, Member-Prefixed & Legible */}
                          <div className="md:hidden flex flex-col gap-0.5">
                            {activeMobileSlots.map((event, slotIndex) => {
                              if (!event) {
                                return <div key={`empty-mobile-${slotIndex}`} className="h-[17px] invisible" />;
                              }
                              const badgeLabel = formatCalendarBadgeTitle(event, filterMember);
                              const { start, end } = getEventDayBounds(event);
                              const isMultiDay = start.getTime() !== end.getTime();
                              const isStart = isSameDay(day, start);
                              const isEnd = isSameDay(day, end);

                              return (
                                <div
                                  key={event.id}
                                  style={{
                                    backgroundColor: `${event.color || '#4F46E5'}18`,
                                    borderLeft: isStart || !isMultiDay ? `2.5px solid ${event.color || '#4F46E5'}` : 'none',
                                    color: event.color || '#4F46E5',
                                    borderTopLeftRadius: isStart || !isMultiDay ? '3px' : '0',
                                    borderBottomLeftRadius: isStart || !isMultiDay ? '3px' : '0',
                                    borderTopRightRadius: isEnd || !isMultiDay ? '3px' : '0',
                                    borderBottomRightRadius: isEnd || !isMultiDay ? '3px' : '0',
                                    marginLeft: isStart || !isMultiDay ? '0' : '-4px',
                                    marginRight: isEnd || !isMultiDay ? '0' : '-4px',
                                    paddingLeft: isStart || !isMultiDay ? '2.5px' : '4px',
                                    paddingRight: isEnd || !isMultiDay ? '2px' : '4px',
                                    zIndex: isMultiDay ? 10 : 1,
                                  }}
                                  className={cn(
                                    'text-[10px] tracking-tighter font-extrabold leading-none truncate h-[17px] flex items-center gap-0.5',
                                    event.syncing && 'opacity-50 animate-pulse'
                                  )}
                                >
                                  {event.is_important && <span className="shrink-0 text-[8px]">⭐</span>}
                                  <span className="truncate">{badgeLabel}</span>
                                </div>
                              );
                            })}
                            {mobileOverflow.length > 0 && (
                              <div className="text-[9px] leading-none text-stone-400 dark:text-stone-500 font-extrabold pl-0.5 pt-0.5">
                                +{mobileOverflow.length} 則
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

            {/* Dashboard Statistics: 2-Col on Mobile, 3-Col on Desktop */}
            {viewMode === 'calendar' && (
              <div className="mt-5 md:mt-8 grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                <div className="bg-white dark:bg-stone-900 rounded-2xl p-3.5 md:p-5 shadow-sm border border-stone-100 dark:border-stone-800 flex items-center gap-3 md:gap-4">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
                    <Car size={20} className="md:w-6 md:h-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] md:text-[11px] font-black text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-0.5 truncate">
                      本月全家出遊
                    </p>
                    <p className="text-xl md:text-2xl font-black text-stone-900 dark:text-stone-100">
                      {monthlyStats.familyOutings}{' '}
                      <span className="text-xs md:text-sm font-bold text-stone-400 dark:text-stone-500">次</span>
                    </p>
                  </div>
                </div>

                <div className="bg-white dark:bg-stone-900 rounded-2xl p-3.5 md:p-5 shadow-sm border border-stone-100 dark:border-stone-800 flex items-center gap-3 md:gap-4">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-xl flex items-center justify-center shrink-0">
                    <Coffee size={20} className="md:w-6 md:h-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] md:text-[11px] font-black text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-0.5 truncate">
                      本月排休總計
                    </p>
                    <p className="text-xl md:text-2xl font-black text-stone-900 dark:text-stone-100">
                      {monthlyStats.totalLeaveDays}{' '}
                      <span className="text-xs md:text-sm font-bold text-stone-400 dark:text-stone-500">天</span>
                    </p>
                  </div>
                </div>

                <div className="col-span-2 md:col-span-1 bg-white dark:bg-stone-900 rounded-2xl p-4 md:p-5 shadow-sm border border-stone-100 dark:border-stone-800 flex flex-col justify-center">
                  <p className="text-[11px] font-black text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-2.5">
                    各成員排休天數
                  </p>
                  <div className="flex flex-wrap gap-1.5 md:gap-2">
                    {FAMILY_MEMBERS.filter((m) => m !== '全家').map((member) => {
                      const leaveCount = monthlyStats.memberLeaveDays[member] || 0;
                      if (leaveCount === 0) return null;

                      return (
                        <div
                          key={member}
                          className="flex items-center gap-1.5 bg-stone-50 dark:bg-stone-800 px-2.5 py-1 rounded-lg border border-stone-100 dark:border-stone-700"
                        >
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: MEMBER_COLORS[member] || '#4F46E5' }}
                          />
                          <span className="text-xs font-bold text-stone-600 dark:text-stone-300">{member}</span>
                          <span className="text-xs font-black text-stone-900 dark:text-stone-100">{leaveCount}</span>
                        </div>
                      );
                    })}
                    {monthlyStats.totalLeaveDays === 0 && (
                      <span className="text-xs text-stone-400 dark:text-stone-500 font-medium">本月尚無排休紀錄</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Upcoming Events */}
            {viewMode === 'calendar' && (
              <div className="mt-6 md:mt-10">
                <div className="flex items-center justify-between mb-3 md:mb-4">
                  <h3 className="text-sm md:text-base font-black text-stone-900 dark:text-stone-100 uppercase tracking-widest flex items-center gap-2">
                    <div className="w-1 h-4 md:h-5 bg-emerald-500 rounded-full" />
                    接下來的活動
                  </h3>
                  <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400 bg-stone-200/70 dark:bg-stone-800 px-2.5 py-1 rounded-lg">
                    近期 {upcomingEvents.length} 筆
                  </span>
                </div>

                <div className="flex overflow-x-auto gap-3 md:gap-4 pb-4 -mx-2.5 px-2.5 md:mx-0 md:px-0 snap-x no-scrollbar">
                  {upcomingEvents.length === 0 ? (
                    <div className="w-full bg-white dark:bg-stone-900 border border-dashed border-stone-200 dark:border-stone-800 rounded-2xl p-8 text-center shadow-sm">
                      <div className="w-12 h-12 bg-stone-50 dark:bg-stone-800 rounded-full flex items-center justify-center mx-auto mb-3 text-stone-300 dark:text-stone-600">
                        <CalendarIcon size={24} />
                      </div>
                      <p className="text-stone-400 dark:text-stone-500 text-sm font-bold">目前沒有即將到來的活動</p>
                    </div>
                  ) : (
                    upcomingEvents.map((event) => (
                      <div
                        key={event.id}
                        onClick={() => handleEditClick(event)}
                        className="snap-start shrink-0 w-[240px] md:w-[290px] bg-white dark:bg-stone-900 rounded-2xl p-4 md:p-5 shadow-sm border border-stone-100 dark:border-stone-800 flex flex-col gap-2.5 hover:shadow-md transition-all cursor-pointer"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center"
                              style={{
                                backgroundColor: `${event.color || '#4F46E5'}15`,
                                color: event.color || '#4F46E5',
                              }}
                            >
                              {getEventIcon(event.title || '', 15) || <User size={15} />}
                            </div>
                            <span
                              className="text-xs font-black px-2 py-0.5 rounded-lg flex items-center gap-1.5"
                              style={{
                                backgroundColor: `${event.color || '#4F46E5'}15`,
                                color: event.color || '#4F46E5',
                              }}
                            >
                              <div
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: event.color || '#4F46E5' }}
                              />
                              {event.member_name}
                            </span>
                          </div>
                          <span className="text-xs font-bold text-stone-400 dark:text-stone-500">
                            {format(safeParseISO(event.start_date), 'MM/dd')}
                            {event.end_date &&
                              event.start_date !== event.end_date &&
                              ` - ${format(safeParseISO(event.end_date), 'MM/dd')}`}
                          </span>
                        </div>
                        <h4 className="font-black text-stone-900 dark:text-stone-100 text-sm md:text-base truncate">
                          {event.title}
                        </h4>
                        {(event.time || event.description) && (
                          <div className="flex items-center gap-2 mt-auto pt-1">
                            {event.time && (
                              <div className="flex items-center gap-1 text-xs font-bold text-orange-600 dark:text-orange-400 bg-orange-50/70 dark:bg-orange-900/20 px-2 py-0.5 rounded-md shrink-0">
                                <Clock size={12} />
                                {formatTimeDisplay(event.time)}
                              </div>
                            )}
                            {event.description && (
                              <span className="text-xs font-medium text-stone-500 dark:text-stone-400 truncate">
                                {event.description}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* List View Mode */}
            {viewMode === 'list' && (
              <div className="space-y-5">
                {listViewDays.map(({ day, dateKey, dayEvents }) => {
                  const weather = weatherData?.[dateKey];
                  return (
                    <div key={dateKey}>
                      <h3 className="text-xs font-black text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-2.5 sticky top-14 md:top-[72px] bg-orange-50/95 dark:bg-stone-950/95 backdrop-blur-sm py-2 z-10 flex items-center justify-between">
                        <span>
                          {format(day, 'MM月dd日 EEEE', { locale: zhTW })}{' '}
                          <span className="text-stone-400 dark:text-stone-500 font-medium ml-1.5">
                            農曆{getLunarDate(day)}
                          </span>
                        </span>
                        {weather && (
                          <div className="flex items-center gap-1.5 text-[11px] normal-case tracking-normal font-bold">
                            <span className="flex items-center gap-1 text-stone-500 dark:text-stone-400">
                              {WEATHER_ICONS[weather.code]}
                              <span className="hidden sm:inline">{WEATHER_DESCRIPTIONS[weather.code]}</span>
                            </span>
                            <span className="text-stone-500 dark:text-stone-400">
                              {Math.round(weather.min)}°~{Math.round(weather.max)}°
                            </span>
                            {weather.pop !== undefined && (
                              <span className="text-blue-500 dark:text-blue-400 flex items-center gap-0.5">
                                <CloudRain size={10} /> {weather.pop}%
                              </span>
                            )}
                          </div>
                        )}
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 md:gap-3">
                        {dayEvents.map((event) => (
                          <div
                            key={`${dateKey}-${event.id}`}
                            className="bg-white dark:bg-stone-900 rounded-2xl p-3.5 md:p-4 shadow-sm border border-stone-100 dark:border-stone-800 flex items-start gap-3.5"
                          >
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
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
                                  className="text-xs font-black px-2.5 py-0.5 rounded-lg flex items-center gap-1.5 w-fit"
                                  style={{
                                    backgroundColor: `${event.color || '#4F46E5'}15`,
                                    color: event.color || '#4F46E5',
                                  }}
                                >
                                  <div
                                    className="w-1.5 h-1.5 rounded-full"
                                    style={{ backgroundColor: event.color || '#4F46E5' }}
                                  />
                                  {event.member_name}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => handleEditClick(event)}
                                    className="p-1.5 text-stone-400 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                                  >
                                    <Edit size={16} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteEvent(event)}
                                    className="p-1.5 text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </div>
                              <h4 className="font-bold text-stone-900 dark:text-stone-100 text-sm md:text-base">
                                {event.title}
                              </h4>
                              {(event.time || event.description) && (
                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                  {event.time && (
                                    <span className="text-xs font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                                      <Clock size={11} /> {formatTimeDisplay(event.time)}
                                    </span>
                                  )}
                                  {event.description && (
                                    <p className="text-xs text-stone-500 dark:text-stone-400">{event.description}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {listViewDays.length === 0 && (
                  <div className="bg-white dark:bg-stone-900 border border-dashed border-stone-200 dark:border-stone-800 rounded-2xl p-12 text-center">
                    <CalendarIcon size={48} className="mx-auto text-stone-200 dark:text-stone-800 mb-4" />
                    <p className="text-stone-400 dark:text-stone-500 font-medium">本月尚無活動紀錄</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Bottom Navigation Bar for Mobile (5-Item Dock: Calendar | List | + | AI | Elderly) */}
      {!isElderlyMode && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-t border-stone-200/80 dark:border-stone-800 px-3 py-1.5 grid grid-cols-5 items-center z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          <button
            onClick={() => {
              setIsChatOpen(false);
              setViewMode('calendar');
            }}
            className={cn(
              'flex flex-col items-center gap-0.5 py-1 rounded-xl transition-all',
              viewMode === 'calendar' && !isChatOpen
                ? 'text-orange-600 dark:text-orange-400'
                : 'text-stone-400 dark:text-stone-500'
            )}
          >
            <CalendarIcon size={19} />
            <span className="text-[10px] font-extrabold">月曆</span>
          </button>

          <button
            onClick={() => {
              setIsChatOpen(false);
              setViewMode('list');
            }}
            className={cn(
              'flex flex-col items-center gap-0.5 py-1 rounded-xl transition-all',
              viewMode === 'list' && !isChatOpen
                ? 'text-orange-600 dark:text-orange-400'
                : 'text-stone-400 dark:text-stone-500'
            )}
          >
            <Clock size={19} />
            <span className="text-[10px] font-extrabold">列表</span>
          </button>

          <div className="flex justify-center">
            <button
              onClick={() => openCreateModal(selectedDay)}
              className="w-12 h-12 bg-orange-600 text-white rounded-full shadow-lg shadow-orange-600/30 flex items-center justify-center -translate-y-3.5 border-4 border-orange-50 dark:border-stone-950 active:scale-90 transition-all"
              title="新增活動"
            >
              <Plus size={24} />
            </button>
          </div>

          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={cn(
              'flex flex-col items-center gap-0.5 py-1 rounded-xl transition-all relative',
              isChatOpen ? 'text-violet-600 dark:text-violet-400' : 'text-stone-400 dark:text-stone-500'
            )}
          >
            <Sparkles size={19} />
            <span className="text-[10px] font-extrabold">AI 秘書</span>
          </button>

          <button
            onClick={() => {
              setIsChatOpen(false);
              setIsElderlyMode(true);
            }}
            className="flex flex-col items-center gap-0.5 py-1 rounded-xl text-stone-400 dark:text-stone-500 hover:text-amber-600 transition-all"
          >
            <User size={19} />
            <span className="text-[10px] font-extrabold">長輩版</span>
          </button>
        </nav>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={cn(
            'fixed top-5 left-1/2 -translate-x-1/2 z-[100] w-max max-w-[calc(100vw-24px)] sm:max-w-md px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 animate-in fade-in slide-in-from-top-4 duration-300',
            toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
          )}
        >
          <span className="shrink-0">
            {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          </span>
          <span className="text-xs sm:text-sm font-black tracking-tight leading-snug">{toast.message}</span>
          {toast.action && (
            <button
              onClick={() => {
                const a = toast.action!;
                setToast(null);
                a.onClick();
              }}
              className="ml-1 px-2.5 py-1 rounded-lg bg-white/25 hover:bg-white/40 text-xs font-black tracking-tight transition-colors shrink-0 whitespace-nowrap"
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}

      <QuickSelectModal
        preset={isQuickSelectOpen ? quickAddPresets.find((p) => p.id === quickSelectPresetId) ?? null : null}
        selectedDay={selectedDay}
        onSelectMember={(member, preset) => {
          handleQuickAdd(member, preset);
          setIsQuickSelectOpen(false);
        }}
        onClose={() => setIsQuickSelectOpen(false)}
      />

      <ManagePresetsModal
        isOpen={isManagePresetsOpen}
        presets={quickAddPresets}
        newPresetTitle={newPresetTitle}
        isSaving={isSavingPresets}
        onNewTitleChange={setNewPresetTitle}
        onAddPreset={addPreset}
        onRemovePreset={removePreset}
        onSave={savePresets}
        onClose={() => setIsManagePresetsOpen(false)}
      />

      <DeleteConfirmModal
        isOpen={isDeleteModalOpen}
        isElderlyMode={isElderlyMode}
        onCancel={() => setIsDeleteModalOpen(false)}
        onConfirm={executeDelete}
      />

      <EventModal
        isOpen={isModalOpen}
        isElderlyMode={isElderlyMode}
        editingEventId={editingEventId}
        newEvent={newEvent}
        onChange={setNewEvent}
        onSubmit={handleAddEvent}
        onClose={() => {
          setIsModalOpen(false);
          setEditingEventId(null);
        }}
      />

      <DayEventsModal
        isOpen={isDayModalOpen}
        selectedDay={selectedDay}
        events={selectedDayEvents}
        weather={weatherData?.[format(selectedDay, 'yyyy-MM-dd')]}
        onClose={() => setIsDayModalOpen(false)}
        onAddNew={() => {
          setIsDayModalOpen(false);
          openCreateModal(selectedDay);
        }}
        onEdit={(event) => {
          setIsDayModalOpen(false);
          handleEditClick(event);
        }}
        onDelete={(event) => {
          setIsDayModalOpen(false);
          handleDeleteEvent(event);
        }}
      />

      <ChatDrawer
        isOpen={isChatOpen}
        onOpen={() => setIsChatOpen(true)}
        onClose={() => setIsChatOpen(false)}
        messages={chatMessages}
        chatInput={chatInput}
        onChatInputChange={setChatInput}
        onSend={handleSendChatMessage}
        isAILoading={isAILoading}
        openaiConfigured={Boolean(configStatus?.openai)}
      />

      {loading && (
        <div className="hidden md:flex fixed bottom-6 right-24 bg-white dark:bg-stone-800 px-4 py-2 rounded-full shadow-lg border border-stone-100 dark:border-stone-700 items-center gap-2 animate-pulse z-20">
          <Clock size={16} className="text-orange-600 animate-spin" />
          <span className="text-xs font-bold text-stone-600 dark:text-stone-400 uppercase tracking-wider">同步中</span>
        </div>
      )}
    </div>
  );
}
