import type { Entity } from './Entity';
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
export interface ProtocolHandler extends Entity {
  onOpenUrl: Signal<(url: string) => void>;
}

export interface HostProtocolDefaultCapability extends Entity {
  isDefault(scheme: string): boolean;
  removeAsDefault(scheme: string): boolean;
  setAsDefault(scheme: string): boolean;
}

export interface HostProtocolLaunchCapability extends Entity {
  getLaunchUrl(): string | null;
}

export interface HostProtocolOpenCapability extends Entity {
  subscribe(listener: (url: string) => void): () => void;
}

export interface HostProtocolRegistrationCapability extends Entity {
  getRegisteredSchemes(): readonly string[];
  register(scheme: string): boolean;
}

export interface HostProtocolRegistrationQueryCapability extends Entity {
  isRegistered(scheme: string): boolean;
}

export interface HostProtocolUnregistrationCapability extends Entity {
  unregister(scheme: string): boolean;
}
