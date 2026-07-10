/**
 * Location acquisition seam.
 *
 * The web widget is the single source of truth for the collect UI across every
 * platform. In a plain browser it reads `navigator.geolocation` directly. Inside
 * a native webview shell (iOS/Android/RN/Flutter) the shell OWNS the Always +
 * Precise permission prompt and the fix — so it injects its own provider and the
 * widget never touches the browser geolocation API. This interface is that seam.
 */
export interface LocationFix {
  lat: number;
  lon: number;
  /** Horizontal accuracy in metres, if the source reports it. */
  accuracy?: number;
}

export type LocationPermission = 'granted' | 'denied' | 'prompt' | 'unknown';

export interface LocationProvider {
  /** Resolve a single current-position fix, or reject if unavailable/denied. */
  getCurrentPosition(): Promise<LocationFix>;
  /**
   * Best-effort current permission state. Native shells report the real
   * Always/Precise status here; the browser default can only guess via the
   * Permissions API, so callers must treat 'unknown' as "just try".
   */
  getPermissionStatus?(): Promise<LocationPermission>;
  /**
   * Ask the host to run its Always + Precise permission prompt. Called from the
   * "Verify where you currently live" screen so the OS dialog appears there (as
   * in the reference flow). Resolves with the resulting grant so the flow can
   * block progress until precise foreground location is allowed. A plain browser
   * has no such prompt and omits this method.
   */
  requestPermission?(): Promise<PermissionGrant>;
  /**
   * Read the current grant WITHOUT prompting. Used by the "Location permission"
   * Settings screen to re-detect state when the app returns to the foreground,
   * so the button can flip to "Continue" once Always + Precise is on.
   */
  getPermissionState?(): Promise<PermissionGrant>;
  /** Open the host app's OS settings page so the user can toggle Always/Precise. */
  openSettings?(): Promise<void>;
}

/**
 * Result of a native permission prompt. `foreground` is true only when PRECISE
 * foreground location is granted (Android FINE / iOS whenInUse+fullAccuracy) —
 * approximate-only or denied is false. `background` is the Always grant.
 */
export interface PermissionGrant {
  foreground: boolean;
  background: boolean;
}

/**
 * Provider that delegates to the native shell over the host bridge. Native runs
 * the Always/Precise prompt and returns the fix, so the widget never calls the
 * browser geolocation API when hosted.
 */
export class BridgeLocationProvider implements LocationProvider {
  constructor(private readonly bridge: { request<T>(action: string, payload?: unknown): Promise<T> }) {}

  getCurrentPosition(): Promise<LocationFix> {
    return this.bridge.request<LocationFix>('getLocation');
  }

  getPermissionStatus(): Promise<LocationPermission> {
    return this.bridge.request<LocationPermission>('getPermissionStatus');
  }

  requestPermission(): Promise<PermissionGrant> {
    return this.bridge.request<PermissionGrant>('requestPermission');
  }

  getPermissionState(): Promise<PermissionGrant> {
    return this.bridge.request<PermissionGrant>('getPermissionState');
  }

  async openSettings(): Promise<void> {
    await this.bridge.request<unknown>('openSettings');
  }
}

/** Default provider backed by the browser Geolocation API. */
export class BrowserLocationProvider implements LocationProvider {
  getCurrentPosition(): Promise<LocationFix> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not available in this browser'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
        (err) => reject(new Error(err.message || 'Failed to get current location')),
        { enableHighAccuracy: true, timeout: 15000 },
      );
    });
  }

  async getPermissionStatus(): Promise<LocationPermission> {
    try {
      const perms = (navigator as unknown as { permissions?: { query: (d: { name: string }) => Promise<{ state: string }> } }).permissions;
      if (!perms?.query) return 'unknown';
      const status = await perms.query({ name: 'geolocation' });
      if (status.state === 'granted' || status.state === 'denied' || status.state === 'prompt') {
        return status.state;
      }
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }
}
