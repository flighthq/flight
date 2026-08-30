// Inter-process messaging. The domain is ONE capability: receiving messages on a named channel.
//
// ★ WHAT WAS DELETED AND WHY. The seam previously declared send / sendTo / invoke / invokeWithTimeout /
// handle / message-event operations, a capability struct, a target, a channel wrapper and an error
// family. No provider implemented any of them: the only host backend (Electron main) documents `send`
// as a no-op and `invoke` as resolving to `undefined`, and there was no second provider. They were
// operations the SDK offered and no host could perform.
//
// Named Electron gaps, recorded so an absence stays examined rather than forgotten. The platform
// genuinely supports all four; Flight has not built them:
//   • main→renderer send — needs a specific `webContents`, so it is a targeted operation, not a global one
//   • targeted send — same, addressed by window
//   • invoke — `ipcMain.handle` + `ipcRenderer.invoke`, a request/response pair
//   • handle — the main-side responder for invoke
// Building any of them means a new slot with a real provider behind it, not a member on this one.

// A channel is a plain string. The former `IpcChannel` wrapper carried a single `name` field and no
// behavior, so it was a value type standing between callers and the string they already had.
// Both the contract and its constructors carry Entity identity; exposing it only at runtime would deny
// consumers the identity the provider actually owns.
export interface IpcMessageBackend extends Entity {
  // Delivers messages arriving on `channel`, returning the unsubscribe for THAT subscription only.
  subscribe(channel: string, listener: (args: readonly unknown[]) => void): () => void;
}
import type { Entity } from './Entity';
