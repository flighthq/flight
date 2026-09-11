import { EntityRuntimeKey } from '@flighthq/types/contract';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import {
  webHostAudio,
  webHostAudioDevice,
  webHostMedia,
  webHostMediaSession,
  webHostMediaSessionAction,
  webHostVideo,
  webMediaHost,
} from './index';

describe('webMediaHost', () => {
  it('is an Entity compatible with the exact Web Media capabilities', () => {
    expect(EntityRuntimeKey in webMediaHost).toBe(true);
    expect(webMediaHost.media).toBe(webHostMedia);
    expect(Object.keys(webHostMedia).sort()).toEqual([
      'audioCodec',
      'audioDevice',
      'session',
      'sessionAction',
      'video',
    ]);
    expect(webHostMedia.audioCodec).toBe(webHostAudio);
    expect(webHostMedia.audioDevice).toBe(webHostAudioDevice);
    expect(webMediaHost.media.session).toBe(webHostMediaSession);
    expect(webMediaHost.media.sessionAction).toBe(webHostMediaSessionAction);
    expect(webHostMedia.video).toBe(webHostVideo);
  });

  it('is created in an isolated Media wrapper module', () => {
    const source = readFileSync(resolve(__dirname, 'webMediaHost.ts'), 'utf8');
    const relativeImports = [...source.matchAll(/from '(\.\/[^']+)'/g)].map((match) => match[1]);

    expect(relativeImports).toEqual(['./webAudio', './webAudioDevice', './webMediasession', './webVideoCapability']);
    expect(source).toMatch(/export const webMediaHost = (?:\/\* @__PURE__ \*\/ )?createHost\(/);
    expect(source).not.toContain('./webHost');
  });
});
