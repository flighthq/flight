// Generated from crates/flight-useragent/src/user_agent_truthy.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

function isTruthy(value?: unknown | undefined): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  {
    const $b = (($downcast: unknown): boolean | undefined => (typeof $downcast === 'boolean' ? $downcast : undefined))(
      value,
    );
    if ($b !== undefined) {
      const b = $b;
      return b;
    }
  }
  {
    const $s = (($downcast: unknown): string | undefined => (typeof $downcast === 'string' ? $downcast : undefined))(
      value,
    );
    if ($s !== undefined) {
      const s = $s;
      return s.length !== 0;
    }
  }
  {
    const $s = (($downcast: unknown): string | undefined => (typeof $downcast === 'string' ? $downcast : undefined))(
      value,
    );
    if ($s !== undefined) {
      const s = $s;
      return s.length !== 0;
    }
  }
  {
    const $n = (($downcast: unknown): number | undefined => (typeof $downcast === 'number' ? $downcast : undefined))(
      value,
    );
    if ($n !== undefined) {
      const n = $n;
      return n !== 0.0 && !Number.isNaN(n);
    }
  }
  {
    const $n = (($downcast: unknown): number | undefined => (typeof $downcast === 'number' ? $downcast : undefined))(
      value,
    );
    if ($n !== undefined) {
      const n = $n;
      return n !== 0.0 && !Number.isNaN(n);
    }
  }
  {
    const $n = (($downcast: unknown): number | undefined => (typeof $downcast === 'number' ? $downcast : undefined))(
      value,
    );
    if ($n !== undefined) {
      const n = $n;
      return n !== 0;
    }
  }
  {
    const $n = (($downcast: unknown): number | undefined => (typeof $downcast === 'number' ? $downcast : undefined))(
      value,
    );
    if ($n !== undefined) {
      const n = $n;
      return n !== 0;
    }
  }
  {
    const $n = (($downcast: unknown): number | undefined => (typeof $downcast === 'number' ? $downcast : undefined))(
      value,
    );
    if ($n !== undefined) {
      const n = $n;
      return n !== 0;
    }
  }
  {
    const $n = (($downcast: unknown): number | undefined => (typeof $downcast === 'number' ? $downcast : undefined))(
      value,
    );
    if ($n !== undefined) {
      const n = $n;
      return n !== 0;
    }
  }
  return true;
}

export { isTruthy };
