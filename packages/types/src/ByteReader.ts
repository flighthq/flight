// A minimal cursor over a byte buffer, shared by the container parsers in @flighthq/texture-formats.
// The value is a plain `{ view, offset }` pair with an advancing `offset`; the `read*`/`skip*` helpers
// in that package advance it, and `hasByteReaderBytes` guards a read so a truncated file returns a
// sentinel rather than throwing a `DataView` `RangeError`.
export interface ByteReader {
  readonly view: DataView;
  offset: number;
}
