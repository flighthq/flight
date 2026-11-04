import type { SvgPathDataFormatOptions as OwnedSvgPathDataFormatOptions } from '@flighthq/path-formats/contract';

import type { SvgPathDataFormatOptions as ContractSvgPathDataFormatOptions } from './contract.ts';
import type { SvgPathDataFormatOptions } from './index.ts';

type IsExact<Left, Right> =
  (<Type>() => Type extends Left ? 1 : 2) extends <Type>() => Type extends Right ? 1 : 2 ? true : false;
type Assert<Condition extends true> = Condition;

// @flighthq/types still carries a transitional copy of this record; both SDK lanes must select the
// declaration path-formats owns (generated from flight-path-formats), not an ambiguous star export.
type _RootSelectsPathFormatsOwner = Assert<IsExact<SvgPathDataFormatOptions, OwnedSvgPathDataFormatOptions>>;
type _ContractSelectsPathFormatsOwner = Assert<
  IsExact<ContractSvgPathDataFormatOptions, OwnedSvgPathDataFormatOptions>
>;

describe('Path formats SDK ownership', () => {
  it('exposes the path-formats SvgPathDataFormatOptions record in both SDK lanes', () => {
    const options: SvgPathDataFormatOptions = { precision: 2 };
    const contractOptions: ContractSvgPathDataFormatOptions = options;
    expect(contractOptions.precision).toBe(2);
  });
});
