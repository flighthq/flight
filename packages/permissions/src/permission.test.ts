import { describe, expect, it } from 'vitest';

import { getPermissionState, getPermissionStates, requestPermission } from './permission';

describe('getPermissionState', () => {
  it('remains a named export with its permanent behavior suite colocated', () => {
    expect(getPermissionState).toBeTypeOf('function');
  });
});

describe('getPermissionStates', () => {
  it('remains a named export with its permanent behavior suite colocated', () => {
    expect(getPermissionStates).toBeTypeOf('function');
  });
});

describe('requestPermission', () => {
  it('remains a named export with its permanent behavior suite colocated', () => {
    expect(requestPermission).toBeTypeOf('function');
  });
});
