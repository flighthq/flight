import type { HostFileSystemCapabilities } from '@flighthq/host/contract';

import { webHostFileSystem } from './webFilesystem.ts';

export const webHostFileSystemGroup = {
  access: webHostFileSystem,
} satisfies HostFileSystemCapabilities;
