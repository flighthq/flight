import type { ElectronApi } from '@flighthq/types/contract';

import {
  electronHostAccessibilityGroup,
  electronHostConnectivity,
  electronHostGraphics,
  electronHostInput,
  electronHostMedia,
  electronHostMidi,
  electronHostNetGroup,
  electronHostShare,
  electronHostText,
  electronHostUi,
} from './electronDefaultHostGroups';

const electron = {} as ElectronApi;

function emptyGroup(factory: () => object): () => void {
  return () => {
    it('constructs an exact empty capability group', () => {
      expect(factory()).toEqual({});
    });
  };
}

const accessibilityGroup = emptyGroup(() => electronHostAccessibilityGroup(electron));
const connectivityGroup = emptyGroup(() => electronHostConnectivity(electron));
const graphicsGroup = emptyGroup(() => electronHostGraphics(electron));
const inputGroup = emptyGroup(() => electronHostInput(electron));
const mediaGroup = emptyGroup(() => electronHostMedia(electron));
const midiGroup = emptyGroup(() => electronHostMidi(electron));
const netGroup = emptyGroup(() => electronHostNetGroup(electron));
const shareGroup = emptyGroup(() => electronHostShare(electron));
const textGroup = emptyGroup(() => electronHostText(electron));
const uiGroup = emptyGroup(() => electronHostUi(electron));

describe('electronHostAccessibilityGroup', accessibilityGroup);
describe('electronHostConnectivity', connectivityGroup);
describe('electronHostGraphics', graphicsGroup);
describe('electronHostInput', inputGroup);
describe('electronHostMedia', mediaGroup);
describe('electronHostMidi', midiGroup);
describe('electronHostNetGroup', netGroup);
describe('electronHostShare', shareGroup);
describe('electronHostText', textGroup);
describe('electronHostUi', uiGroup);
