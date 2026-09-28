import { awd2CameraHandler } from './awd2CameraHandler.ts';
import { AWD2_BLOCK_CAMERA, AWD2_BUILD_PHASE_CAMERA } from './awd2Schema.ts';

describe('awd2CameraHandler', () => {
  it('claims the camera block type', () => {
    expect(awd2CameraHandler.blockTypes).toEqual([AWD2_BLOCK_CAMERA]);
  });

  it('has a parse function', () => {
    expect(typeof awd2CameraHandler.parse).toBe('function');
  });

  it('declares the camera build phase', () => {
    expect(awd2CameraHandler.buildPhase).toBe(AWD2_BUILD_PHASE_CAMERA);
    expect(typeof awd2CameraHandler.build).toBe('function');
  });
});
