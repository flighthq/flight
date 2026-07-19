import { CompositeOperator } from '@flighthq/types';

import { getCompositeOperatorFactors } from './compositeOperatorMath';

function factors(operator: CompositeOperator, as: number, ab: number): [number, number] {
  const out: [number, number] = [0, 0];
  getCompositeOperatorFactors(operator, as, ab, out);
  return out;
}

describe('getCompositeOperatorFactors', () => {
  it('gives source-over its canonical [1, 1 - as]', () => {
    expect(factors(CompositeOperator.SourceOver, 0.6, 0.4)).toEqual([1, 1 - 0.6]);
  });

  it('erases (DestinationOut) by keeping only the backdrop scaled by 1 - as', () => {
    expect(factors(CompositeOperator.DestinationOut, 0.75, 1)).toEqual([0, 1 - 0.75]);
  });

  it('masks (DestinationIn) by keeping only the backdrop scaled by as', () => {
    expect(factors(CompositeOperator.DestinationIn, 0.75, 1)).toEqual([0, 0.75]);
  });

  it('copies the source and drops the backdrop', () => {
    expect(factors(CompositeOperator.Copy, 0.3, 0.9)).toEqual([1, 0]);
  });

  it('clears both contributions', () => {
    expect(factors(CompositeOperator.Clear, 0.3, 0.9)).toEqual([0, 0]);
  });

  it('xors to the mutually-uncovered regions', () => {
    expect(factors(CompositeOperator.Xor, 0.5, 0.25)).toEqual([1 - 0.25, 1 - 0.5]);
  });

  it('falls through to source-over for an unknown (vendor) operator', () => {
    expect(factors('acme.custom', 0.6, 0.4)).toEqual([1, 1 - 0.6]);
  });

  it('is alias-safe writing into a supplied out array', () => {
    const out: [number, number] = [9, 9];
    getCompositeOperatorFactors(CompositeOperator.DestinationOver, 0.2, 0.8, out);
    expect(out).toEqual([1 - 0.8, 1]);
  });
});
