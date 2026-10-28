import type { HslColorRaw, HsvColorRaw, LinearColorRaw } from '@flighthq/color/contract';
import {
  HslColor as ColorHslColor,
  HsvColor as ColorHsvColor,
  LinearColor as ColorLinearColor,
} from '@flighthq/color/contract';

import {
  HslColor as ContractHslColor,
  HsvColor as ContractHsvColor,
  LinearColor as ContractLinearColor,
} from './contract.ts';
import { HslColor, HsvColor, LinearColor } from './index.ts';

type IsExact<Left, Right> =
  (<Type>() => Type extends Left ? 1 : 2) extends <Type>() => Type extends Right ? 1 : 2 ? true : false;
type Assert<Condition extends true> = Condition;

const rootHsl: HslColor = new HslColor();
const rootHsv: HsvColor = new HsvColor();
const rootLinear: LinearColor = new LinearColor();
const contractHsl: ContractHslColor = new ContractHslColor();
const contractHsv: ContractHsvColor = new ContractHsvColor();
const contractLinear: ContractLinearColor = new ContractLinearColor();

type _RootHslRawIsNarrowed = Assert<IsExact<typeof rootHsl.raw, HslColorRaw>>;
type _RootHsvRawIsNarrowed = Assert<IsExact<typeof rootHsv.raw, HsvColorRaw>>;
type _RootLinearRawIsNarrowed = Assert<IsExact<typeof rootLinear.raw, LinearColorRaw>>;
type _ContractHslRawIsNarrowed = Assert<IsExact<typeof contractHsl.raw, HslColorRaw>>;
type _ContractHsvRawIsNarrowed = Assert<IsExact<typeof contractHsv.raw, HsvColorRaw>>;
type _ContractLinearRawIsNarrowed = Assert<IsExact<typeof contractLinear.raw, LinearColorRaw>>;

describe('Color SDK ownership', () => {
  it('prefers Color wrapper values in both SDK lanes', () => {
    expect(rootHsl).toBeInstanceOf(ColorHslColor);
    expect(rootHsv).toBeInstanceOf(ColorHsvColor);
    expect(rootLinear).toBeInstanceOf(ColorLinearColor);
    expect(contractHsl).toBeInstanceOf(ColorHslColor);
    expect(contractHsv).toBeInstanceOf(ColorHsvColor);
    expect(contractLinear).toBeInstanceOf(ColorLinearColor);
  });
});
