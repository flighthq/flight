import {
  tauriHostAccessibility,
  tauriHostConnectivity,
  tauriHostGraphics,
  tauriHostInput,
  tauriHostIpc,
  tauriHostMedia,
  tauriHostMidi,
  tauriHostNet,
  tauriHostPower,
  tauriHostProtocol,
  tauriHostScreen,
  tauriHostShare,
  tauriHostStorage,
  tauriHostText,
  tauriHostUi,
  tauriHostUpdater,
} from './tauriUnsupportedHostGroups';

function returnsEmptyGroup(constructor: () => object): () => void {
  return () => {
    it('constructs an explicit empty capability group', () => expect(constructor()).toEqual({}));
  };
}

describe('tauriHostAccessibility', returnsEmptyGroup(tauriHostAccessibility));
describe('tauriHostConnectivity', returnsEmptyGroup(tauriHostConnectivity));
describe('tauriHostGraphics', returnsEmptyGroup(tauriHostGraphics));
describe('tauriHostInput', returnsEmptyGroup(tauriHostInput));
describe('tauriHostIpc', returnsEmptyGroup(tauriHostIpc));
describe('tauriHostMedia', returnsEmptyGroup(tauriHostMedia));
describe('tauriHostMidi', returnsEmptyGroup(tauriHostMidi));
describe('tauriHostNet', returnsEmptyGroup(tauriHostNet));
describe('tauriHostPower', returnsEmptyGroup(tauriHostPower));
describe('tauriHostProtocol', returnsEmptyGroup(tauriHostProtocol));
describe('tauriHostScreen', returnsEmptyGroup(tauriHostScreen));
describe('tauriHostShare', returnsEmptyGroup(tauriHostShare));
describe('tauriHostStorage', returnsEmptyGroup(tauriHostStorage));
describe('tauriHostText', returnsEmptyGroup(tauriHostText));
describe('tauriHostUi', returnsEmptyGroup(tauriHostUi));
describe('tauriHostUpdater', returnsEmptyGroup(tauriHostUpdater));
