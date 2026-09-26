import {
  COLLADA_REQUIREMENT_KEY_NAMESPACE,
  MD2_REQUIREMENT_KEY_NAMESPACE,
  MD5_REQUIREMENT_KEY_NAMESPACE,
  OBJ_REQUIREMENT_KEY_NAMESPACE,
  THREE_DS_REQUIREMENT_KEY_NAMESPACE,
} from './scene3dFormatRequirements.ts';

describe('scene3dFormatRequirements', () => {
  it('uses distinct namespaces', () => {
    const namespaces = [
      COLLADA_REQUIREMENT_KEY_NAMESPACE,
      MD2_REQUIREMENT_KEY_NAMESPACE,
      MD5_REQUIREMENT_KEY_NAMESPACE,
      OBJ_REQUIREMENT_KEY_NAMESPACE,
      THREE_DS_REQUIREMENT_KEY_NAMESPACE,
    ];
    expect(new Set(namespaces).size).toBe(namespaces.length);
  });

  it('assigns the expected namespace values', () => {
    expect(COLLADA_REQUIREMENT_KEY_NAMESPACE).toBe('dae');
    expect(MD2_REQUIREMENT_KEY_NAMESPACE).toBe('md2');
    expect(MD5_REQUIREMENT_KEY_NAMESPACE).toBe('md5');
    expect(OBJ_REQUIREMENT_KEY_NAMESPACE).toBe('obj');
    expect(THREE_DS_REQUIREMENT_KEY_NAMESPACE).toBe('3ds');
  });
});
