// Reports a filter ID whose variable-width payload @flighthq/swf cannot skip safely. `filterIndex` is
// zero-based within the SURFACEFILTERLIST and lets diagnostics identify which entry ended the parse.
export type SwfFilterListGuard = (filterId: number, filterIndex: number) => void;
