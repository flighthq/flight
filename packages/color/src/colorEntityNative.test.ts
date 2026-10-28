import type { HslColorRaw, HsvColorRaw, LinearColorRaw } from './contract.ts';
import { HslColor, HsvColor, LinearColor } from './index.ts';

type IsExact<Left, Right> =
  (<Type>() => Type extends Left ? 1 : 2) extends <Type>() => Type extends Right ? 1 : 2 ? true : false;
type Assert<Condition extends true> = Condition;

const hsl: HslColor = new HslColor();
const hsv: HsvColor = new HsvColor();
const linear: LinearColor = new LinearColor();

type _HslRawIsNarrowed = Assert<IsExact<typeof hsl.raw, HslColorRaw>>;
type _HsvRawIsNarrowed = Assert<IsExact<typeof hsv.raw, HsvColorRaw>>;
type _LinearRawIsNarrowed = Assert<IsExact<typeof linear.raw, LinearColorRaw>>;

describe('Color Entity wrappers', () => {
  it('constructs typed wrapper values with stable Raw identity', () => {
    expect(HslColor.from(hsl.raw)).toBe(hsl);
    expect(HsvColor.from(hsv.raw)).toBe(hsv);
    expect(LinearColor.from(linear.raw)).toBe(linear);
  });
});
