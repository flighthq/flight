import type { HostFileSystemCapabilities } from '@flighthq/types/contract';

import { webHostFileSystem } from './webFilesystem.ts';

export const webHostFileSystemGroup = {
  access: webHostFileSystem,
} satisfies HostFileSystemCapabilities;
