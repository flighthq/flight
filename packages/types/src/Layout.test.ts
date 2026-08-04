import { AnchorLayoutKind, FlexLayoutKind, GridLayoutKind, LayoutResolutionFailureKind } from './Layout';

describe('layout header', () => {
  it('publishes stable built-in registry keys', () => {
    expect([AnchorLayoutKind, FlexLayoutKind, GridLayoutKind]).toEqual(['AnchorLayout', 'FlexLayout', 'GridLayout']);
  });

  it('publishes the complete resolution sentinel vocabulary', () => {
    expect(Object.values(LayoutResolutionFailureKind)).toEqual([
      'IntrinsicSizesTooSmall',
      'InvalidContainerStyle',
      'InvalidHierarchy',
      'InvalidItemStyle',
      'OutputTooSmall',
      'UnregisteredKind',
    ]);
  });
});
