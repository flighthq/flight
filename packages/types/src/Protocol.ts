import type { Signal } from './Signal';

// A deep-link URL decomposed into its parts. query values are percent-decoded; an absent query
// yields an empty record. Round-trips with createProtocolUrl/parseProtocolUrl for well-formed inputs.
export interface ParsedProtocolUrl {
  scheme: string;
  host: string;
  path: string;
  query: Record<string, string>;
}

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
  // Lists the custom URI schemes this app has registered; [] where the host cannot enumerate them.
  getRegisteredSchemes(): readonly string[];
  setAsDefault(scheme: string): boolean;
  isDefault(scheme: string): boolean;
  removeAsDefault(scheme: string): boolean;
  // The cold-start launch URL the app was opened with, or null when not launched via a deep link.
  getLaunchUrl(): string | null;
  // Drains URLs buffered before the first attach (pre-attach burst), emptying the buffer.
  drainPendingUrls(): readonly string[];
  // Registers a listener invoked when a deep-link URL is opened; returns an unsubscribe function.
  subscribe(listener: (url: string) => void): () => void;
}
