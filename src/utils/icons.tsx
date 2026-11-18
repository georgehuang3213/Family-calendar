import React from 'react';
import {
  Sun,
  Cloud,
  CloudRain,
  CloudSun,
  CloudLightning,
  Snowflake,
  Wind,
  Utensils,
  Coffee,
  Briefcase,
  ShoppingCart,
  Car,
  Heart,
  Star,
  Plane,
  Music,
} from 'lucide-react';

export const WEATHER_ICONS: Record<number, React.ReactNode> = {
  0: <Sun size={14} className="text-amber-500" />,
  1: <CloudSun size={14} className="text-amber-400" />,
  2: <CloudSun size={14} className="text-stone-400" />,
  3: <Cloud size={14} className="text-stone-500" />,
  45: <Wind size={14} className="text-stone-400" />,
  48: <Wind size={14} className="text-stone-400" />,
  51: <CloudRain size={14} className="text-blue-400" />,
  53: <CloudRain size={14} className="text-blue-500" />,
  55: <CloudRain size={14} className="text-blue-600" />,
  61: <CloudRain size={14} className="text-blue-500" />,
  63: <CloudRain size={14} className="text-blue-600" />,
  65: <CloudRain size={14} className="text-blue-700" />,
  71: <Snowflake size={14} className="text-blue-200" />,
  73: <Snowflake size={14} className="text-blue-300" />,
  75: <Snowflake size={14} className="text-blue-400" />,
  80: <CloudRain size={14} className="text-blue-500" />,
  81: <CloudRain size={14} className="text-blue-600" />,
  82: <CloudRain size={14} className="text-blue-700" />,
  95: <CloudLightning size={14} className="text-orange-500" />,
  96: <CloudLightning size={14} className="text-orange-600" />,
  99: <CloudLightning size={14} className="text-orange-700" />,
};

export function getEventIcon(title: string | undefined | null, size: number = 10): React.ReactNode {
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
}
