export interface HostAppExitCapability {
  subscribe(listener: () => void): () => void;
}
