import { CompositeOperator } from './CompositeOperator';

describe('CompositeOperator', () => {
  it('carries canonical PascalCase values equal to their keys', () => {
    expect(CompositeOperator.SourceOver).toBe('SourceOver');
    expect(CompositeOperator.DestinationOut).toBe('DestinationOut');
    expect(CompositeOperator.DestinationIn).toBe('DestinationIn');
    expect(CompositeOperator.Xor).toBe('Xor');
  });

  it('covers the full Porter-Duff set', () => {
    expect(Object.keys(CompositeOperator).sort()).toEqual(
      [
        'Clear',
        'Copy',
        'DestinationAtop',
        'DestinationIn',
        'DestinationOut',
        'DestinationOver',
        'SourceAtop',
        'SourceIn',
        'SourceOut',
        'SourceOver',
        'Xor',
      ].sort(),
    );
  });

  it('is a plain string a display node can hold as its composite intent', () => {
    const operator: CompositeOperator = CompositeOperator.DestinationOut;
    expect(operator).toBe('DestinationOut');
  });
});
