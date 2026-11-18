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
      try {
        const cfgRes = await apiFetch('/api/config/weather');
        if (cfgRes.ok) {
          const cfg = await cfgRes.json();
          weatherAlreadyConfigured = Boolean(cfg.configured);
        }
      } catch {
        // Ignore config check error
      }

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
            fetchWeather();
          },
          { timeout: 10000, maximumAge: 60000 }
        );
      } else {
        fetchWeather();
      }
    };
    initLocationAndWeather();

    fetchHolidays(currentDate.getFullYear());
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
          setEvents(processDatabaseEvents(data.events));
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
    fetchHolidays(currentDate.getFullYear());
  }, [authed, currentDate.getFullYear()]);

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
      (e) => e.member_name === member && e.start_date === dateStr && e.title === preset.title
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
        setEvents((prev) => prev.map((e) => (String(e.id) === tempId ? { ...e, id: result.id, syncing: false } : e)));
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
        setEvents((prev) => prev.map((e) => (String(e.id) === tempId ? { ...e, id: result.id } : e)));
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
        setEvents((prev) =>
          prev.map((ev) => (ev.id === optimisticEvent.id || String(ev.id) === serverEvent.id ? serverEvent : ev))
        );
      } else if (!isEditing && result.id) {
        setEvents((prev) => prev.map((ev) => (ev.id === optimisticEvent.id ? { ...ev, id: result.id } : ev)));
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
      <header className="bg-[#8A3A24] dark:bg-stone-900/95 backdrop-blur-md border-b border-stone-200 dark:border-stone-800 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-8 h-8 md:w-10 md:h-10 bg-orange-600 rounded-lg md:rounded-xl flex items-center justify-center text-white shadow-lg shadow-orange-200 flex-shrink-0">
            <CalendarIcon size={16} className="md:hidden" />
            <CalendarIcon size={24} className="hidden md:block" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-sm md:text-xl font-black tracking-tight truncate text-[#FDEDD3] dark:text-stone-100">
              家庭行事曆
            </h1>
            <div className="flex items-center gap-1">
              <div
                className={cn(
                  'w-1 h-1 rounded-full',
                  storageSource === 'local' ? 'bg-amber-500' : 'bg-emerald-500'
                )}
              />
              <span className="text-[9px] font-bold text-orange-200 dark:text-stone-400 uppercase tracking-tighter">
                {storageSource === 'local' ? '本地' : '雲端'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 md:gap-4">
          <button
            onClick={() => fetchEvents(true)}
            className="p-2 text-stone-500 hover:text-orange-600 dark:text-stone-400 dark:hover:text-orange-400 transition-colors bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg shadow-sm"
            title="重新整理"
          >
            <Zap size={16} className={cn(loading && 'animate-pulse text-orange-500')} />
          </button>

          <div className="flex items-center bg-stone-100 dark:bg-stone-800 rounded-lg p-0.5 md:p-1">
            <button
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
              className="p-1 hover:bg-white dark:hover:bg-stone-700 hover:shadow-sm rounded-md transition-all"
              title="上個月"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="px-1.5 md:px-4 font-bold text-xs md:text-base min-w-[70px] md:min-w-[120px] text-center">
              {format(currentDate, 'yyyy/MM')}
            </span>
            <button
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
              className="p-1 hover:bg-white dark:hover:bg-stone-700 hover:shadow-sm rounded-md transition-all"
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
            className="flex items-center justify-center bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 px-2 md:px-3 py-1.5 md:py-2 rounded-lg text-[11px] md:text-xs font-bold text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors shadow-sm"
          >
            今天
          </button>

          <button
            onClick={() => setIsElderlyMode(!isElderlyMode)}
            className={cn(
              'flex items-center justify-center px-2 md:px-3 py-1.5 md:py-2 rounded-lg text-[11px] md:text-xs font-bold transition-colors shadow-sm border',
              isElderlyMode
                ? 'bg-amber-500 text-white border-amber-600'
                : 'bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700'
            )}
            title="長輩友善模式"
          >
            長輩模式
          </button>

          <button
            onClick={() => openCreateModal(new Date())}
            className="hidden md:flex bg-orange-600 text-white px-4 py-2 rounded-lg font-bold items-center gap-2 hover:bg-orange-700 transition-colors shadow-sm"
          >
            <Plus size={20} />
            <span>新增活動</span>
          </button>
        </div>
      </header>

      <main className="p-4 md:p-6 max-w-7xl mx-auto">
        {/* 置頂重要公告 */}
        {upcomingImportantEvents.length > 0 && (
          <div className="mb-6">
            <div
              className={cn(
                'bg-amber-50/50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-700/30 rounded-xl shadow-sm overflow-hidden',
                isElderlyMode ? 'p-5 md:p-6' : 'p-3 md:p-4'
              )}
            >
              <div className="flex items-center justify-between mb-3 md:mb-4">
                <div
                  className={cn(
                    'flex items-center gap-2 text-amber-700 dark:text-amber-400 font-black tracking-[0.2em] uppercase',
                    isElderlyMode ? 'text-xl' : 'text-[11px] md:text-xs'
                  )}
                >
                  <Megaphone size={isElderlyMode ? 28 : 14} />
                  <span>置頂重要公告</span>
                </div>
                <span
                  className={cn(
                    'font-bold text-amber-600/60 dark:text-amber-500/40 bg-amber-100/50 dark:bg-amber-900/40 rounded-full',
                    isElderlyMode ? 'px-4 py-1 text-lg' : 'px-2 py-0.5 text-[11px]'
                  )}
                >
                  {upcomingImportantEvents.length} 則
                </span>
              </div>
              <div
                className={cn(
                  'grid gap-3',
                  isElderlyMode ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
                  upcomingImportantEvents.length > 4 && 'max-h-[320px] md:max-h-[500px] overflow-y-auto pr-1 custom-scrollbar'
                )}
              >
                {upcomingImportantEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className={cn(
                      'flex flex-col bg-white/80 dark:bg-stone-800/80 backdrop-blur-sm rounded-xl border border-amber-100/50 dark:border-amber-900/30 shadow-sm transition-all hover:shadow-md group',
                      isElderlyMode ? 'p-6' : 'p-3'
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={cn(
                          'text-amber-600 dark:text-amber-500 font-bold flex items-center gap-1.5',
                          isElderlyMode ? 'text-xl' : 'text-[11px]'
                        )}
                      >
                        <Star size={isElderlyMode ? 22 : 12} className="fill-amber-500" />
                        {format(safeParseISO(evt.start_date), 'MM/dd')}
                      </span>
                      <span
                        className={cn(
                          'font-bold text-stone-400 dark:text-stone-500 group-hover:text-amber-600 transition-colors bg-stone-100 dark:bg-stone-900/50 px-2 py-0.5 rounded-lg',
                          isElderlyMode ? 'text-xl' : 'text-[11px]'
                        )}
                      >
                        {evt.member_name}
                      </span>
                    </div>
                    <div
                      className={cn(
                        'font-black text-stone-800 dark:text-stone-100 line-clamp-2 mb-2',
                        isElderlyMode ? 'text-3xl leading-tight' : 'text-sm'
                      )}
                    >
                      {evt.title}
                    </div>
                    {evt.time && formatTimeDisplay(evt.time) && (
                      <div className="flex items-center gap-1.5 mt-auto pt-2 border-t border-amber-100/30 dark:border-amber-900/20">
                        <Clock size={isElderlyMode ? 20 : 12} className="text-stone-400" />
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
          <div className="space-y-8 pb-20">
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
                    border: 'border-orange-100 dark:border-orange-900',
                    text: 'text-orange-700 dark:text-orange-400',
                    accent: 'text-orange-600 dark:text-orange-400',
                  }
                : isTomorrow
                  ? {
                      border: 'border-emerald-100 dark:border-emerald-900',
                      text: 'text-emerald-700 dark:text-emerald-400',
                      accent: 'text-emerald-600 dark:text-emerald-400',
                    }
                  : {
                      border: 'border-stone-100 dark:border-stone-800',
                      text: 'text-stone-700 dark:text-stone-300',
                      accent: 'text-stone-600 dark:text-stone-400',
                    };

              const dayEvents = events.filter((e) => isEventOnDate(e, day));

              return (
                <div
                  key={dateKey}
                  className={cn('bg-white dark:bg-stone-900 rounded-3xl p-6 shadow-md border-4', dayTheme.border)}
                >
                  <div className={cn('mb-6 border-b-4 pb-4', dayTheme.border)}>
                    <div className="flex flex-wrap items-center gap-4 mb-3">
                      <h2 className={cn('text-4xl font-black', dayTheme.text)}>{dayLabel}</h2>
                      {allHolidays[dateKey] && (
                        <span className="bg-rose-100 text-rose-700 px-4 py-1.5 rounded-xl text-2xl font-bold">
                          {allHolidays[dateKey]}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-2xl font-bold text-stone-600 dark:text-stone-400">
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
                      <p className="text-3xl text-stone-500 font-bold py-8 text-center">這天沒有活動</p>
                    ) : (
                      dayEvents.map((event) => (
                        <div
                          key={event.id}
                          className="bg-stone-50 dark:bg-stone-800 rounded-2xl p-6 border-2 border-stone-200 dark:border-stone-700 flex flex-col gap-4"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                              <span
                                className="text-2xl font-black px-4 py-2 rounded-xl text-white"
                                style={{ backgroundColor: event.color || '#4F46E5' }}
                              >
                                {event.member_name}
                              </span>
                              {event.time && (
                                <span className={cn('text-3xl font-bold', dayTheme.accent)}>
                                  {formatTimeDisplay(event.time)}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => handleEditClick(event)}
                                className="p-3 bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300 rounded-xl hover:bg-stone-300 dark:hover:bg-stone-600 transition-colors"
                              >
                                <Edit size={28} />
                              </button>
                              <button
                                onClick={() => handleDeleteEvent(event)}
                                className="p-3 bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-xl hover:bg-rose-200 dark:hover:bg-rose-900/50 transition-colors"
                              >
                                <Trash2 size={28} />
                              </button>
                            </div>
                          </div>
                          <h3 className="text-4xl font-black text-stone-900 dark:text-stone-100">{event.title}</h3>
                          {event.description && (
                            <p className="text-2xl text-stone-600 dark:text-stone-400">{event.description}</p>
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
              className="w-full bg-orange-600 text-white py-6 rounded-3xl font-black text-3xl flex items-center justify-center gap-4 shadow-xl active:scale-95 transition-transform"
            >
              <Plus size={40} />
              新增活動
            </button>
          </div>
        ) : (
          <>
            {/* Today's Weather Overview (Mobile Only) */}
            {currentWeather && (
              <div className="md:hidden bg-gradient-to-br from-orange-600 to-violet-700 rounded-2xl p-5 mb-6 text-white shadow-lg shadow-orange-200 dark:shadow-none relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Cloud size={120} />
                </div>
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md">
                        <MapPin size={16} />
                      </div>
                      <span className="text-sm font-bold tracking-wide">{locationName}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {userCoords && (
                        <button
                          onClick={handleSaveCurrentLocationForLine}
                          className="text-[10px] font-bold bg-white/20 hover:bg-white/30 px-2 py-1 rounded-lg backdrop-blur-md transition-colors"
                          title="將此位置設為每日 LINE 推播的天氣地點"
                        >
                          設為推播地點
                        </button>
                      )}
                      <span className="text-[11px] font-black uppercase tracking-widest bg-white/20 px-2 py-1 rounded-lg backdrop-blur-md">
                        即時天氣
                      </span>
                    </div>
                  </div>

                  <div className="flex items-end justify-between">
                    <div className="flex items-center gap-4">
                      <span className="text-5xl font-black tracking-tighter">
                        {Math.round(currentWeather.temp)}°
                      </span>
                      <div className="flex flex-col">
                        <span className="text-lg font-bold flex items-center gap-2">
                          {WEATHER_ICONS[currentWeather.code]}
                          {WEATHER_DESCRIPTIONS[currentWeather.code]}
                        </span>
                        <span className="text-xs font-medium opacity-80">
                          濕度 {currentWeather.humidity}% | 風速 {currentWeather.wind} km/h
                        </span>
                      </div>
                    </div>

                    {weatherData?.[format(new Date(), 'yyyy-MM-dd')] && (
                      <div className="text-right">
                        <div className="text-[11px] font-black uppercase tracking-widest opacity-60 mb-1">
                          今日預估
                        </div>
                        <div className="text-sm font-bold">
                          {Math.round(weatherData[format(new Date(), 'yyyy-MM-dd')].min)}° ~{' '}
                          {Math.round(weatherData[format(new Date(), 'yyyy-MM-dd')].max)}°
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Desktop View Toggle */}
            <div className="hidden md:flex bg-stone-200 dark:bg-stone-800 p-1 rounded-xl mb-6 w-fit">
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

            {/* Filters & Settings */}
            <div className="mb-4 md:mb-6 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-stone-500">
                  <Filter size={14} />
                  <span className="text-[11px] font-black uppercase tracking-widest">篩選成員</span>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
                  <div className="relative flex-shrink-0">
                    <select
                      value={activeQuickAddId || 'none'}
                      onChange={(e) => setActiveQuickAddId(e.target.value === 'none' ? null : e.target.value)}
                      className={cn(
                        'appearance-none pl-4 pr-9 py-1.5 rounded-full text-[13px] font-black uppercase tracking-widest transition-all border outline-none cursor-pointer',
                        activeQuickAddId
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 shadow-sm'
                          : 'bg-white dark:bg-stone-800 text-stone-500 dark:text-stone-400 border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700'
                      )}
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 12px center',
                        backgroundSize: '10px',
                      }}
                    >
                      <option value="none">⚡ 一鍵新增</option>
                      {quickAddPresets.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={() => setIsManagePresetsOpen(true)}
                    className="flex-shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[13px] font-black uppercase tracking-widest transition-all border bg-white dark:bg-stone-800 text-stone-500 dark:text-stone-400 border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700"
                    title="管理一鍵新增選項"
                  >
                    <Settings size={13} />
                    管理活動
                  </button>

                  <div className="w-px h-4 bg-stone-200 dark:bg-stone-700 flex-shrink-0 mx-1" />

                  <div className="relative flex-shrink-0">
                    <select
                      value={filterMember}
                      onChange={(e) => setFilterMember(e.target.value)}
                      className={cn(
                        'appearance-none pl-4 pr-10 py-1.5 rounded-full text-xs font-bold transition-all border bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-stone-300 dark:hover:border-stone-600 outline-none cursor-pointer shadow-sm',
                        filterMember !== '全部' &&
                          'border-stone-800 dark:border-stone-100 ring-1 ring-stone-800 dark:ring-stone-100'
                      )}
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 12px center',
                        backgroundSize: '12px',
                      }}
                    >
                      <option value="全部">全部成員</option>
                      {FAMILY_MEMBERS.map((member) => (
                        <option key={member} value={member}>
                          {member}
                        </option>
                      ))}
                    </select>
                    {filterMember !== '全部' && (
                      <div
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full pointer-events-none"
                        style={{ backgroundColor: MEMBER_COLORS[filterMember] || '#4F46E5' }}
                      />
                    )}
                  </div>
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

                  <button
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    className="p-1.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
                    title={isDarkMode ? '切換為淺色模式' : '切換為深色模式'}
                  >
                    {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
                  </button>
                </div>

                <div className="md:hidden">
                  <div className="flex bg-stone-100 dark:bg-stone-800 p-0.5 rounded-lg">
                    <button
                      onClick={() => setViewMode('calendar')}
                      className={cn(
                        'px-3 py-1 rounded-md text-[11px] font-bold transition-all',
                        viewMode === 'calendar'
                          ? 'bg-white dark:bg-stone-700 shadow-sm text-orange-600 dark:text-orange-400'
                          : 'text-stone-500 dark:text-stone-400'
                      )}
                    >
                      月曆
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={cn(
                        'px-3 py-1 rounded-md text-[11px] font-bold transition-all',
                        viewMode === 'list'
                          ? 'bg-white dark:bg-stone-700 shadow-sm text-orange-600 dark:text-orange-400'
                          : 'text-stone-500 dark:text-stone-400'
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
                  <div className="ml-8 p-3 bg-white/50 dark:bg-stone-900/50 rounded-lg text-[11px] font-mono space-y-1">
                    <p>
                      Firebase 資料庫:{' '}
                      {configStatus.firebase ? `✅ 已設定 (${configStatus.firebaseKeyLength} 字元)` : '❌ 未設定'}
                    </p>
                    <p>
                      OpenAI 金鑰:{' '}
                      {configStatus.openai ? `✅ 已設定 (${configStatus.openaiKeyLength} 字元)` : '❌ 未設定'}
                    </p>
                    <p>
                      LINE 推播: {configStatus.line ? '✅ 已設定' : '❌ 未設定'} (Token{' '}
                      {configStatus.lineAccessToken ? '✅' : '❌'} / Secret{' '}
                      {configStatus.lineChannelSecret ? '✅' : '❌'} / GroupID{' '}
                      {configStatus.lineGroupId ? '✅' : '❌'})
                    </p>
                    <p>
                      環境: {configStatus.env?.VERCEL ? 'Vercel' : 'Local/Dev'} ({configStatus.env?.NODE_ENV})
                    </p>
                    {configStatus.lineSecretWarning && (
                      <p className="mt-1 text-amber-600">{configStatus.lineSecretWarning}</p>
                    )}
                    <p className="mt-2 text-stone-400 dark:text-stone-500">
                      提示：請在 Vercel 專案設定 → Environment Variables 中設定這些變數。
                    </p>
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
              <div className="bg-white dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-200 dark:border-stone-800">
                <div className="grid grid-cols-7 border-b border-stone-100 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-800/80 backdrop-blur-md sticky top-[56px] md:top-[72px] z-30 rounded-t-2xl">
                  {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
                    <div
                      key={day}
                      className="py-2 md:py-3 text-center text-[11px] md:text-xs font-black text-stone-400 dark:text-stone-500 uppercase tracking-widest"
                    >
                      {day}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 relative rounded-b-2xl overflow-hidden">
                  {calendarDays.map((day) => {
                    const dayEvents = filteredEvents.filter((e) => isEventOnDate(e, day));

                    const maxDisplaySlots = 4;
                    const daySlots: Array<CalendarEvent | null> = new Array(maxDisplaySlots).fill(null);
                    const dayOverflow: CalendarEvent[] = [];

                    dayEvents.forEach((event) => {
                      const lane = eventLanes[event.id] ?? 999;
                      if (lane < maxDisplaySlots) {
                        daySlots[lane] = event;
                      } else {
                        dayOverflow.push(event);
                      }
                    });

                    const maxMobileSlots = 3;
                    const mobileSlots: Array<CalendarEvent | null> = new Array(maxMobileSlots).fill(null);
                    const mobileOverflow: CalendarEvent[] = [];
                    dayEvents.forEach((event) => {
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
                          'min-h-[80px] md:min-h-[140px] p-1 md:p-2 border-r border-b border-stone-50 dark:border-stone-800 last:border-r-0 transition-all cursor-pointer relative',
                          !isCurrentMonth && 'bg-stone-50/30 dark:bg-stone-800/30',
                          isSelected && 'bg-orange-50/50 dark:bg-orange-900/20 ring-2 ring-inset ring-orange-400 z-10',
                          isHoliday && 'bg-rose-50/30 dark:bg-rose-900/10',
                          makeupWorkdayName && 'bg-stone-100/50 dark:bg-stone-800/50'
                        )}
                      >
                        <div className="flex flex-col md:flex-row md:items-center justify-between mb-1 md:mb-2 gap-1">
                          <div className="flex items-center gap-1">
                            <span
                              className={cn(
                                'w-7 h-7 md:w-8 md:h-8 flex items-center justify-center rounded-full text-xs md:text-sm font-bold',
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
                            <span className="text-[10px] md:text-[11px] text-stone-400 dark:text-stone-500 font-medium">
                              {getLunarDate(day)}
                            </span>
                            {weather && (
                              <div className="flex items-center gap-0.5 group relative">
                                {WEATHER_ICONS[weather.code]}
                                <div className="hidden md:flex flex-col items-start -space-y-0.5">
                                  <span className="text-[9px] text-stone-400 font-medium">
                                    {Math.round(weather.min)}°~{Math.round(weather.max)}°
                                  </span>
                                  {weather.pop !== undefined && (
                                    <span className="text-[9px] text-blue-500 dark:text-blue-400 font-bold flex items-center gap-0.5">
                                      <CloudRain size={8} /> {weather.pop}%
                                    </span>
                                  )}
                                </div>
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-stone-900/95 dark:bg-stone-800/95 text-white text-[11px] py-1.5 px-2.5 rounded-lg shadow-xl backdrop-blur-sm border border-white/10 whitespace-nowrap z-50 animate-in fade-in zoom-in duration-200">
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
                              <span className="text-[9px] md:text-[11px] font-black text-rose-500 dark:text-rose-400 truncate bg-rose-50 dark:bg-rose-900/30 px-1.5 py-0.5 rounded border border-rose-100 dark:border-rose-900/50">
                                {holidayName}
                              </span>
                            )}
                            {makeupWorkdayName && (
                              <span className="text-[9px] md:text-[11px] font-black text-stone-500 dark:text-stone-400 truncate bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded border border-stone-200 dark:border-stone-700">
                                {makeupWorkdayName}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col gap-0.5 md:gap-1 relative z-20">
                          {/* Desktop View */}
                          <div className="hidden md:flex flex-col gap-1">
                            {daySlots.map((event, slotIndex) => {
                              if (!event) {
                                return <div key={`empty-${slotIndex}`} className="h-[22px] invisible" />;
                              }
                              const eventTitle = String(event.title || '無標題');
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
                                  <span className="truncate">{eventTitle}</span>
                                </div>
                              );
                            })}
                            {dayOverflow.length > 0 && (
                              <div className="text-[10px] text-stone-400 font-black pl-1 flex items-center gap-1">
                                <Plus size={8} /> {dayOverflow.length} 更多
                              </div>
                            )}
                          </div>

                          {/* Mobile View */}
                          <div className="md:hidden flex flex-col gap-0.5">
                            {mobileSlots.map((event, slotIndex) => {
                              if (!event) {
                                return <div key={`empty-mobile-${slotIndex}`} className="h-[16px] invisible" />;
                              }
                              const eventTitle = String(event.title || '無標題');
                              const icon = getEventIcon(eventTitle, 8);
                              const { start, end } = getEventDayBounds(event);
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
                                    'py-0.5 text-[9px] font-bold truncate h-[16px] flex items-center gap-0.5',
                                    event.syncing && 'opacity-50 animate-pulse'
                                  )}
                                >
                                  {event.is_important && <span className="shrink-0 text-amber-500">⭐</span>}
                                  {icon && <span className="shrink-0">{icon}</span>}
                                  <span className="truncate">{eventTitle}</span>
                                </div>
                              );
                            })}
                            {mobileOverflow.length > 0 && (
                              <div className="text-[8px] text-stone-400 font-black pl-0.5">
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

            {/* Dashboard Statistics */}
            {viewMode === 'calendar' && (
              <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-stone-900 rounded-2xl p-5 shadow-sm border border-stone-100 dark:border-stone-800 flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
                    <Car size={24} />
                  </div>
                  <div>
                    <p className="text-[11px] font-black text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-1">
                      本月全家出遊
                    </p>
                    <p className="text-2xl font-black text-stone-900 dark:text-stone-100">
                      {monthlyStats.familyOutings}{' '}
                      <span className="text-sm font-bold text-stone-400 dark:text-stone-500">次</span>
                    </p>
                  </div>
                </div>

                <div className="bg-white dark:bg-stone-900 rounded-2xl p-5 shadow-sm border border-stone-100 dark:border-stone-800 flex items-center gap-4">
                  <div className="w-12 h-12 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-xl flex items-center justify-center shrink-0">
                    <Coffee size={24} />
                  </div>
                  <div>
                    <p className="text-[11px] font-black text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-1">
                      本月排休總計
                    </p>
                    <p className="text-2xl font-black text-stone-900 dark:text-stone-100">
                      {monthlyStats.totalLeaveDays}{' '}
                      <span className="text-sm font-bold text-stone-400 dark:text-stone-500">天</span>
                    </p>
                  </div>
                </div>

                <div className="bg-white dark:bg-stone-900 rounded-2xl p-5 shadow-sm border border-stone-100 dark:border-stone-800 flex flex-col justify-center">
                  <p className="text-[11px] font-black text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-3">
                    各成員排休天數
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {FAMILY_MEMBERS.filter((m) => m !== '全家').map((member) => {
                      const leaveCount = monthlyStats.memberLeaveDays[member] || 0;
                      if (leaveCount === 0) return null;

                      return (
                        <div
                          key={member}
                          className="flex items-center gap-1.5 bg-stone-50 dark:bg-stone-800 px-2 py-1 rounded-lg border border-stone-100 dark:border-stone-700"
                        >
                          <div
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: MEMBER_COLORS[member] || '#4F46E5' }}
                          />
                          <span className="text-[11px] font-bold text-stone-600 dark:text-stone-300">{member}</span>
                          <span className="text-[11px] font-black text-stone-900 dark:text-stone-100">
                            {leaveCount}
                          </span>
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
              <div className="mt-8 md:mt-10">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm md:text-base font-black text-stone-900 dark:text-stone-100 uppercase tracking-widest flex items-center gap-2">
                    <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                    接下來的活動
                  </h3>
                  <span className="text-[11px] font-bold text-stone-400 dark:text-stone-500 bg-stone-100 dark:bg-stone-800 px-2 py-1 rounded-lg">
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
                    upcomingEvents.map((event) => (
                      <div
                        key={event.id}
                        className="snap-center shrink-0 w-[260px] md:w-[300px] bg-white dark:bg-stone-900 rounded-2xl p-5 shadow-sm border border-stone-100 dark:border-stone-800 flex flex-col gap-3 hover:shadow-md transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center"
                              style={{
                                backgroundColor: `${event.color || '#4F46E5'}15`,
                                color: event.color || '#4F46E5',
                              }}
                            >
                              {getEventIcon(event.title || '', 16) || <User size={16} />}
                            </div>
                            <span
                              className="text-[11px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg flex items-center gap-1.5"
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
                        <h4 className="font-black text-stone-900 dark:text-stone-100 text-base truncate">{event.title}</h4>
                        <div className="flex items-center gap-3 mt-auto pt-2">
                          {event.time && (
                            <div className="flex items-center gap-1.5 text-xs font-bold text-orange-600 dark:text-orange-400 bg-orange-50/50 dark:bg-orange-900/20 px-2 py-1 rounded-lg">
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
                {listViewDays.map(({ day, dateKey, dayEvents }) => {
                  const weather = weatherData?.[dateKey];
                  return (
                    <div key={dateKey}>
                      <h3 className="text-xs font-black text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-3 sticky top-[56px] md:top-[72px] bg-stone-50/95 dark:bg-stone-950/95 backdrop-blur-sm py-2 z-10 flex items-center justify-between">
                        <span>
                          {format(day, 'MM月dd日 EEEE', { locale: zhTW })}{' '}
                          <span className="text-stone-400 dark:text-stone-600 font-medium ml-2">
                            農曆 {getLunarDate(day)}
                          </span>
                        </span>
                        {weather && (
                          <div className="flex items-center gap-2 text-[11px] normal-case tracking-normal font-bold">
                            <span className="flex items-center gap-1 text-stone-500 dark:text-stone-400">
                              {WEATHER_ICONS[weather.code]}
                              {WEATHER_DESCRIPTIONS[weather.code]}
                            </span>
                            <span className="text-stone-300 dark:text-stone-700">|</span>
                            <span className="text-stone-500 dark:text-stone-400">
                              {Math.round(weather.min)}°~{Math.round(weather.max)}°
                            </span>
                            {weather.pop !== undefined && (
                              <>
                                <span className="text-stone-300 dark:text-stone-700">|</span>
                                <span className="text-blue-500 dark:text-blue-400 flex items-center gap-1">
                                  <CloudRain size={10} /> {weather.pop}%
                                </span>
                              </>
                            )}
                          </div>
                        )}
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {dayEvents.map((event) => (
                          <div
                            key={`${dateKey}-${event.id}`}
                            className="bg-white dark:bg-stone-900 rounded-xl p-4 shadow-sm border border-stone-100 dark:border-stone-800 flex items-start gap-4"
                          >
                            <div
                              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
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
                                  <div
                                    className="w-1.5 h-1.5 rounded-full"
                                    style={{ backgroundColor: event.color || '#4F46E5' }}
                                  />
                                  {event.member_name}
                                </span>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleEditClick(event)}
                                    className="p-1 text-stone-400 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
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
                                  <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                                    <Clock size={10} /> {formatTimeDisplay(event.time)}
                                  </span>
                                )}
                                {event.description && (
                                  <p className="text-xs text-stone-500 dark:text-stone-400">{event.description}</p>
                                )}
                              </div>
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

      {/* Bottom Navigation Bar for Mobile */}
      {!isElderlyMode && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 px-6 py-3 flex items-center justify-between z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
          <button
            onClick={() => setViewMode('calendar')}
            className={cn(
              'flex flex-col items-center gap-1 transition-all',
              viewMode === 'calendar' ? 'text-orange-600 dark:text-orange-400' : 'text-stone-400 dark:text-stone-500'
            )}
          >
            <CalendarIcon size={20} />
            <span className="text-[11px] font-black uppercase tracking-widest">月曆</span>
          </button>

          <button
            onClick={() => openCreateModal(new Date())}
            className="w-14 h-14 bg-orange-600 text-white rounded-full shadow-xl flex items-center justify-center -translate-y-8 border-4 border-stone-50 dark:border-stone-950 active:scale-90 transition-all"
          >
            <Plus size={28} />
          </button>

          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'flex flex-col items-center gap-1 transition-all',
              viewMode === 'list' ? 'text-orange-600 dark:text-orange-400' : 'text-stone-400 dark:text-stone-500'
            )}
          >
            <Clock size={20} />
            <span className="text-[11px] font-black uppercase tracking-widest">列表</span>
          </button>
        </nav>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={cn(
            'fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300',
            toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
          )}
        >
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="text-sm font-black tracking-tight">{toast.message}</span>
          {toast.action && (
            <button
              onClick={() => {
                const a = toast.action!;
                setToast(null);
                a.onClick();
              }}
              className="ml-2 px-2.5 py-1 rounded-lg bg-white/25 hover:bg-white/40 text-xs font-black tracking-tight transition-colors"
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
        <div className="fixed bottom-24 md:bottom-6 right-24 md:right-24 bg-white dark:bg-stone-800 px-4 py-2 rounded-full shadow-lg border border-stone-100 dark:border-stone-700 flex items-center gap-2 animate-pulse z-20">
          <Clock size={16} className="text-orange-600 animate-spin" />
          <span className="text-xs font-bold text-stone-600 dark:text-stone-400 uppercase tracking-wider">同步中</span>
        </div>
      )}
    </div>
  );
}
