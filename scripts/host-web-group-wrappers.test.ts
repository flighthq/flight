import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import * as hostWebContract from '../packages/host-web/src/contract.ts';
import * as hostWebPublic from '../packages/host-web/src/index.ts';

const root = process.cwd();
const GROUP_MODULES = [
  { file: 'webAccessibilityHost.ts', group: 'accessibility', name: 'webHostAccessibilityGroup' },
  { file: 'webAppHost.ts', group: 'app', name: 'webHostApp' },
  { file: 'webAudioHost.ts', group: 'audio', name: 'webHostAudioGroup' },
  { file: 'webBitmapHost.ts', group: 'bitmap', name: 'webHostBitmap' },
  { file: 'webCanvasHost.ts', group: 'canvas', name: 'webHostCanvasGroup' },
  { file: 'webClipboardHost.ts', group: 'clipboard', name: 'webHostClipboard' },
  { file: 'webConnectivityHost.ts', group: 'connectivity', name: 'webHostConnectivity' },
  { file: 'webDeviceHost.ts', group: 'device', name: 'webHostDeviceGroup' },
  { file: 'webDialogHost.ts', group: 'dialog', name: 'webHostDialog' },
  { file: 'webFileSystemHost.ts', group: 'fileSystem', name: 'webHostFileSystemGroup' },
  { file: 'webFontHost.ts', group: 'font', name: 'webHostFont' },
  { file: 'webFullscreenHost.ts', group: 'fullscreen', name: 'webHostFullscreenGroup' },
  { file: 'webGeolocationHost.ts', group: 'geolocation', name: 'webHostGeolocationGroup' },
  { file: 'webGlHost.ts', group: 'gl', name: 'webHostGlGroup' },
  { file: 'webGlyphHost.ts', group: 'glyph', name: 'webHostGlyph' },
  { file: 'webHapticsHost.ts', group: 'haptics', name: 'webHostHapticsGroup' },
  { file: 'webImageHost.ts', group: 'image', name: 'webHostImageGroup' },
  { file: 'webInputHost.ts', group: 'input', name: 'webHostInput' },
  { file: 'webLifecycleHost.ts', group: 'lifecycle', name: 'webHostLifecycleGroup' },
  { file: 'webMediaSessionHost.ts', group: 'mediaSession', name: 'webHostMediaSessionGroup' },
  { file: 'webMenuHost.ts', group: 'menu', name: 'webHostMenu' },
  { file: 'webNetHost.ts', group: 'net', name: 'webHostNetGroup' },
  { file: 'webNotificationHost.ts', group: 'notification', name: 'webHostNotification' },
  { file: 'webPermissionsHost.ts', group: 'permissions', name: 'webHostPermissionsGroup' },
  { file: 'webPlatformHost.ts', group: 'platform', name: 'webHostPlatformGroup' },
  { file: 'webPowerHost.ts', group: 'power', name: 'webHostPower' },
  { file: 'webPreferencesHost.ts', group: 'preferences', name: 'webHostPreferences' },
  { file: 'webProtocolHost.ts', group: 'protocol', name: 'webHostProtocol' },
  { file: 'webScreenHost.ts', group: 'screen', name: 'webHostScreen' },
  { file: 'webSensorsHost.ts', group: 'sensors', name: 'webHostSensorsGroup' },
  { file: 'webShareHost.ts', group: 'share', name: 'webHostShare' },
  { file: 'webShellHost.ts', group: 'shell', name: 'webHostShell' },
  { file: 'webSocketHost.ts', group: 'socket', name: 'webHostSocketGroup' },
  { file: 'webSoftKeyboardHost.ts', group: 'softKeyboard', name: 'webHostSoftKeyboard' },
  { file: 'webStatusBarHost.ts', group: 'statusBar', name: 'webHostStatusBar' },
  { file: 'webSurfaceHost.ts', group: 'surface', name: 'webHostSurfaceGroup' },
  { file: 'webVideoHost.ts', group: 'video', name: 'webHostVideoGroup' },
  { file: 'webWindowHost.ts', group: 'window', name: 'webHostWindow' },
] as const;

describe('host-Web canonical group boundaries', () => {
  it.each(GROUP_MODULES)('$name is the public group identity composed by webHost', (spec) => {
    const group = requiredValue<Record<string, unknown>>(hostWebContract, spec.name);

    expect(Reflect.get(hostWebPublic, spec.name)).toBe(group);
    expect(requiredValue<Record<string, unknown>>(hostWebContract, 'webHost')[spec.group]).toBe(group);
    expect(Object.keys(group).length).toBeGreaterThan(0);
  });

  it.each(GROUP_MODULES)('$file declares a group without constructing a partial Host', (spec) => {
    const path = resolve(root, 'packages/host-web/src', spec.file);
    expect(existsSync(path), `${spec.file} source`).toBe(true);
    if (!existsSync(path)) return;
    const source = readFileSync(path, 'utf8');

    expect(source).toContain(`export const ${spec.name} = {`);
    expect(source).not.toContain('createHost');
    expect(source).not.toMatch(/^export const web(?!Host)[A-Z]\w*Host\b/mu);
  });
});

function requiredValue<Type>(module: object, name: string): Type {
  const value = Reflect.get(module, name);
  expect(value, `${name} export`).not.toBeUndefined();
  return value as Type;
}
