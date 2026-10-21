# flight-abc

Reads ActionScript byte code (ABC) containers into plain records and decodes method instruction streams.
Parsing never executes bytecode and reports malformed input with `None`.

## Precision

- `AbcConstantPool::doubles` and the private binary reader use `f64` because ABC double constants are stored as exact IEEE-754 binary64 values.
- `AbcInstruction::operands` uses `i64` because one flat TS `number[]` combines signed 24-bit branch offsets with unsigned variable integers; its declared range is -8,388,608 through 34,359,738,367, safely below 2^53.
