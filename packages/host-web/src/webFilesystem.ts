import { createWebFileSystemBackend, installFileSystemHostBackend } from '@flighthq/filesystem/contract';

export function enableHostWebFileSystem(): void {
  if (_enabled) return;
  _enabled = true;
  installFileSystemHostBackend(createWebFileSystemBackend());
}

export function resetHostWebFilesystemForTest(): void {
  _enabled = false;
}

let _enabled = false;
