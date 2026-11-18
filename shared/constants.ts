export const FAMILY_MEMBERS = [
  '全家',
  '江雪卿',
  '黃喬裕',
  '陳愉婷',
  '黃宣綾',
  '黃宣綸',
  '黃郁婷',
  '郭力維',
  '黃郁慈',
  '郭品佑',
  '郭品彤',
] as const;

export type FamilyMember = (typeof FAMILY_MEMBERS)[number];

export const MEMBER_COLORS: Record<string, string> = {
  '全家': '#111827',
  '江雪卿': '#E11D48',
  '黃喬裕': '#2563EB',
  '陳愉婷': '#059669',
  '黃宣綾': '#D97706',
  '黃宣綸': '#7C3AED',
  '黃郁婷': '#DB2777',
  '郭力維': '#4B5563',
  '黃郁慈': '#EA580C',
  '郭品佑': '#84CC16',
  '郭品彤': '#06B6D4',
};

export const LEAVE_TITLES = ['請假', '排休', '特休', '補休', '公休'] as const;

export const DEFAULT_QUICK_ADD_PRESETS = [
  { id: 'leave', title: '排休' },
  { id: 'work', title: '上班' },
];
