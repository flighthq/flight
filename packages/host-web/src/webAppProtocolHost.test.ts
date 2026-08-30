import { describe, expect, it } from 'vitest';

import * as hostWebContract from './contract';
import { webHost } from './webHost';

describe('webHost app and protocol ownership', () => {
  it('publishes only genuine app capability slots', () => {
    expect(webHost.app).toHaveProperty('badge');
    expect(webHost.app).toHaveProperty('focus');
    expect(webHost.app).toHaveProperty('locale');
    expect(webHost.app).toHaveProperty('name');
    expect(webHost.app).toHaveProperty('quit');
    expect(webHost.app).toHaveProperty('ready');
    expect(webHost.app).toHaveProperty('relaunch');
    expect(webHost.app).not.toHaveProperty('dock');
    expect(webHost.app).not.toHaveProperty('singleInstance');
  });

  it('publishes protocol launch and registration without false native-only slots', () => {
    const protocol = Reflect.get(webHost, 'protocol');
    expect(protocol).toHaveProperty('launch');
    expect(protocol).toHaveProperty('registration');
    expect(protocol).not.toHaveProperty('default');
    expect(protocol).not.toHaveProperty('open');
    expect(protocol).not.toHaveProperty('registrationQuery');
    expect(protocol).not.toHaveProperty('unregistration');
  });

  it('does not export the deleted ambient enablers', () => {
    expect(hostWebContract).not.toHaveProperty('enableHostWebApp');
    expect(hostWebContract).not.toHaveProperty('enableHostWebProtocol');
  });
});
