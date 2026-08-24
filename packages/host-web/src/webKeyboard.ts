import { createWebSoftKeyboardBackend, installSoftKeyboardHostBackend } from '@flighthq/keyboard/contract';

export function enableHostWebSoftKeyboard(): void {
  if (_enabled) return;
  _enabled = true;
  installSoftKeyboardHostBackend(createWebSoftKeyboardBackend());
}

export function resetHostWebKeyboardForTest(): void {
  _enabled = false;
}

let _enabled = false;
