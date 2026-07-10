/**
 * Native-shell transport.
 *
 * When the widget runs inside a native webview (iOS WKWebView, Android WebView,
 * React Native / Flutter), the JS callbacks (onAddressSelected / onError /
 * onClose / verificationStarted) must cross the JS↔native boundary, and the
 * widget must be able to ASK native to run things it cannot do itself — the
 * Always/Precise permission prompt and the resulting location fix.
 *
 * Protocol (JS → native), always a JSON object:
 *   { kind: 'event',   name, payload }                 // fire-and-forget
 *   { kind: 'request', id, action, payload }            // expects a reply
 *
 * Native replies by calling back into the page:
 *   window.AddressIQBridge.resolve(id, result)
 *   window.AddressIQBridge.reject(id, { code, message })
 *
 * In a plain browser there is no host, so `HostBridge.detect()` returns null and
 * the widget uses its in-page callbacks + BrowserLocationProvider instead.
 */

export type BridgeEvent = 'addressSelected' | 'error' | 'close' | 'verificationStarted';

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

type PostFn = (message: string) => void;

declare global {
  interface Window {
    webkit?: { messageHandlers?: Record<string, { postMessage: (m: unknown) => void }> };
    AddressIQAndroid?: { postMessage: (m: string) => void };
    AddressIQFlutter?: { postMessage: (m: string) => void };
    ReactNativeWebView?: { postMessage: (m: string) => void };
    AddressIQBridge?: {
      resolve: (id: string, result: unknown) => void;
      reject: (id: string, error: unknown) => void;
    };
  }
}

/** Locate a native message sink, or return null when running in a plain browser. */
function detectPost(): PostFn | null {
  if (typeof window === 'undefined') return null;
  const w = window;
  const iosHandler = w.webkit?.messageHandlers?.addressiq;
  if (iosHandler) {
    return (m) => iosHandler.postMessage(m);
  }
  if (w.AddressIQAndroid?.postMessage) {
    return (m) => w.AddressIQAndroid!.postMessage(m);
  }
  if (w.AddressIQFlutter?.postMessage) {
    return (m) => w.AddressIQFlutter!.postMessage(m);
  }
  if (w.ReactNativeWebView?.postMessage) {
    return (m) => w.ReactNativeWebView!.postMessage(m);
  }
  return null;
}

export class HostBridge {
  private readonly post: PostFn;
  private readonly pending = new Map<string, Pending>();
  private seq = 0;

  private constructor(post: PostFn) {
    this.post = post;
    // Expose the reply surface native calls into. Request ids correlate each
    // reply back to the promise that is awaiting it.
    window.AddressIQBridge = {
      resolve: (id, result) => this.settle(id, result, undefined),
      reject: (id, error) => this.settle(id, undefined, error ?? { code: 'BRIDGE_ERROR', message: 'Native rejected' }),
    };
  }

  /** Returns a bridge when hosted in a native webview, otherwise null. */
  static detect(): HostBridge | null {
    const post = detectPost();
    return post ? new HostBridge(post) : null;
  }

  /** Fire-and-forget event to the host (result handoff, close, etc.). */
  emit(name: BridgeEvent, payload?: unknown): void {
    this.post(JSON.stringify({ kind: 'event', name, payload }));
  }

  /** Ask native to run an action and await its reply (permission / location). */
  request<T = unknown>(action: string, payload?: unknown): Promise<T> {
    const id = `req_${++this.seq}`;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.post(JSON.stringify({ kind: 'request', id, action, payload }));
    });
  }

  private settle(id: string, result: unknown, error: unknown): void {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    if (error !== undefined) p.reject(error);
    else p.resolve(result);
  }
}
