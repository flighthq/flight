// App-owned host exit scheduling contract.
export interface HostAppExitCapability {
  subscribe(listener: () => void): () => void;
}
