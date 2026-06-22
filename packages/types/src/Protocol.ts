import type { Signal } from './Signal';

// Deep-link event entity. Enable delivery with attachProtocolHandler; the signal stays inert until then.
export interface ProtocolHandler {
  onOpenUrl: Signal<(url: string) => void>;
}

// Event and control seam for custom URI scheme registration and deep-link delivery. The web backend
// wraps navigator.registerProtocolHandler; a native host registers schemes and drives the callback.
export interface ProtocolBackend {
  register(scheme: string): boolean;
  unregister(scheme: string): boolean;
  isRegistered(scheme: string): boolean;
  setAsDefault(scheme: string): boolean;
  // Registers a listener invoked when a deep-link URL is opened; returns an unsubscribe function.
  subscribe(listener: (url: string) => void): () => void;
}
