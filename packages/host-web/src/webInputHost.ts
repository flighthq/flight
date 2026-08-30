import { createHost } from '@flighthq/entity/contract';
import type {
  HasInputDropFileSubscription,
  HasInputFocusSubscription,
  HasInputHaptics,
  HasInputPointerLock,
  HasInputTargetPreparation,
  HasSoftKeyboardChange,
  HasSoftKeyboardInfo,
  HasSoftKeyboardVisibility,
  Host,
} from '@flighthq/types/contract';

import { webHapticsBackend } from './webHaptics';
import {
  webInputDropFileBackend,
  webInputFocusBackend,
  webInputPointerLockBackend,
  webInputTargetBackend,
} from './webInputTarget';
import {
  createWebSoftKeyboardChangeBackend,
  createWebSoftKeyboardInfoBackend,
  createWebSoftKeyboardVisibilityBackend,
} from './webKeyboard';

export const webInputHost: Host &
  HasInputDropFileSubscription &
  HasInputFocusSubscription &
  HasInputHaptics &
  HasInputPointerLock &
  HasInputTargetPreparation &
  HasSoftKeyboardChange &
  HasSoftKeyboardInfo &
  HasSoftKeyboardVisibility = createHost({
  input: {
    dropFile: webInputDropFileBackend,
    focus: webInputFocusBackend,
    haptics: webHapticsBackend,
    pointerLock: webInputPointerLockBackend,
    softKeyboardChange: createWebSoftKeyboardChangeBackend(),
    softKeyboardInfo: createWebSoftKeyboardInfoBackend(),
    softKeyboardVisibility: createWebSoftKeyboardVisibilityBackend(),
    target: webInputTargetBackend,
  },
});
