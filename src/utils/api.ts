export const FAMILY_KEY_STORAGE = 'familyAccessKey';

export function getFamilyKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(FAMILY_KEY_STORAGE) || '';
}

/**
 * 所有 /api 請求都透過這個包裝送出，自動帶上通行碼標頭；
 * 若收到 401（密碼錯誤或失效）就清掉本機密碼並通知 App 重新顯示登入畫面。
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  headers.set('x-family-key', getFamilyKey());
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401 && typeof window !== 'undefined') {
    localStorage.removeItem(FAMILY_KEY_STORAGE);
    window.dispatchEvent(new CustomEvent('family-auth-required'));
  }
  return res;
}
