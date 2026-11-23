/**
 * =============================================================================
 * CENTRAL APPLICATION CONFIGURATION - SINGLE SOURCE OF TRUTH FOR API URL
 * =============================================================================
 * 
 * To change the backend API URL for the ENTIRE application, change it in ONE place:
 * 
 * 1. In `frontend/.env` (Recommended):
 *    VITE_API_BASE_URL=http://localhost:8000
 *    (or https://your-tunnel.trycloudflare.com, https://api.yourdomain.com)
 * 
 * 2. Or directly update `DEFAULT_API_URL` below.
 * 
 * 3. Runtime browser override (Optional, for quick testing without rebuild):
 *    localStorage.setItem('siddhi_api_base_url', 'https://your-tunnel.trycloudflare.com')
 * 
 * All API clients (Axios), Vite dev server proxy, and Webhook references
 * automatically read from here.
 */

export const DEFAULT_API_URL = 'https://bucks-shared-poor-showcase.trycloudflare.com'; // || 'http://localhost:8000';

export function getApiBaseUrl(): string {
  // 1. Runtime override check (from browser localStorage or window global)
  if (typeof window !== 'undefined') {
    const runtimeOverride =
      (window as any).__API_BASE_URL__ ||
      localStorage.getItem('siddhi_api_base_url');
    if (runtimeOverride && typeof runtimeOverride === 'string' && runtimeOverride.trim()) {
      return runtimeOverride.trim().replace(/\/+$/, '');
    }
  }

  // 2. Build-time / environment variable from frontend/.env
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }

  // 3. Fallback default
  return DEFAULT_API_URL;
}

export const API_BASE_URL = getApiBaseUrl();

/**
 * Returns the full webhook URL for Meta WhatsApp Cloud API configuration
 */
export function getWebhookCallbackUrl(): string {
  const base = getApiBaseUrl();
  if (base.startsWith('http://') || base.startsWith('https://')) {
    return `${base}/api/v1/webhook`;
  }
  if (typeof window !== 'undefined' && window.location.origin) {
    return `${window.location.origin}/api/v1/webhook`;
  }
  return `${DEFAULT_API_URL}/api/v1/webhook`;
}
