import type { Entity } from './Entity';

// Metadata Electron's built-in Squirrel updater can prove at the downloaded boundary. A null field is
// unknown; providers must not fabricate a sentinel, default, or richer electron-updater-only fact.
export interface UpdateInfo {
  readonly downloadSizeBytes: number | null;
  readonly isMandatory: boolean | null;
  readonly minimumOsVersion: string | null;
  readonly notes: string | null;
  readonly releaseDate: string | null;
  readonly sha512: string | null;
  readonly version: string | null;
}

// A successful check's provider-pinned capability. Public install operations retain its exact origin
// out of band, so replacing the provider on Host cannot redirect an already-downloaded update.
export interface DownloadedUpdate extends Entity {
  readonly info: Readonly<UpdateInfo>;
}

export type AppUpdateCheckOutcome =
  | Readonly<{ reason: 'downloaded'; update: DownloadedUpdate }>
  | Readonly<{ reason: 'check-in-progress' | 'not-available' | 'operation-failed' }>;

export interface AppUpdateInstallOutcome {
  readonly reason: 'ok' | 'operation-failed';
}

// Squirrel auto-downloads during check. The awaited check is therefore the only download command;
// its native events are adapter-private transaction details rather than a second public event model.
export interface UpdaterCommandBackend extends Entity {
  check(): Promise<AppUpdateCheckOutcome>;
  destroy(): void;
  install(update: DownloadedUpdate): Promise<AppUpdateInstallOutcome>;
}
