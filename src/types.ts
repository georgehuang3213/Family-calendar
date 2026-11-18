export interface CalendarEvent {
  id: string | number;
  uuid?: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  time?: string;
  member_name: string;
  color: string;
  companions?: string;
  is_important?: boolean;
  syncing?: boolean;
}

export interface EventFormState {
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  time: string;
  start_time: string;
  end_time: string;
  member_name: string;
  color: string;
  companions: string;
  is_important: boolean;
}

export interface QuickAddPreset {
  id: string;
  title: string;
}

export interface DayWeather {
  code: number;
  max: number;
  min: number;
  pop?: number;
}

export interface CurrentWeather {
  temp: number;
  humidity: number;
  code: number;
  wind: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ToastState {
  message: string;
  type: 'success' | 'error';
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number;
}
