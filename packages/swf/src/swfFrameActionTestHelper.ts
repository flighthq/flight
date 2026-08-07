// Builds a minimal AVM2 container whose class constructor calls addFrameScript(0, this.frame1). Shared
// because a wire can only be shown to fire from a REAL import path if the full path has a valid payload
// to carry, and building one by hand in each test file is how two tests end up proving different things.
// `handlerNameIndex` selects the name the handler body calls: 3 is `stop`, which the importer obeys;
// anything else parses and is then declined.
export function buildFrameScriptAbc(handlerNameIndex = 3): Uint8Array {
  const bytes: number[] = [];
  const u8 = (v: number): void => void bytes.push(v & 0xff);
  const u16 = (v: number): void => {
    u8(v);
    u8(v >> 8);
  };
  const u30 = (v: number): void => {
    let r = v;
    do {
      const b = r % 0x80;
      r = Math.floor(r / 0x80);
      u8(r > 0 ? b | 0x80 : b);
    } while (r > 0);
  };
  const str = (v: string): void => {
    const e = new TextEncoder().encode(v);
    u30(e.length);
    for (const b of e) u8(b);
  };

  u16(16);
  u16(46);
  u30(1); // no integers
  u30(1); // no unsigned integers
  u30(1); // no doubles
  u30(6); // strings: Main, addFrameScript, stop, frame1, ''
  str('Main');
  str('addFrameScript');
  str('stop');
  str('frame1');
  str('');
  u30(2); // one namespace: public, named by the empty string
  u8(0x16);
  u30(5);
  u30(1); // no namespace sets
  u30(5); // four qualified names, one per string above
  for (let i = 1; i <= 4; i++) {
    u8(0x07);
    u30(1);
    u30(i);
  }

  u30(2); // two methods: the constructor and frame1
  for (let i = 0; i < 2; i++) {
    u30(0);
    u30(0);
    u30(0);
    u8(0);
  }
  u30(0); // no metadata

  u30(1); // one class
  u30(1); // instance name -> Main
  u30(1); // super name
  u8(0);
  u30(0); // no interfaces
  u30(0); // instance initializer is method 0
  u30(1); // one trait: the frame1 method
  u30(4);
  u8(0x01); // method trait
  u30(0); // dispatch id
  u30(1); // method index
  u30(0); // class initializer
  u30(0); // no class traits

  u30(1); // one script
  u30(0);
  u30(0);

  u30(2); // two method bodies
  // The constructor: addFrameScript(0, this.frame1)
  const constructorCode = [0xd0, 0x30, 0x5d, 0x02, 0x24, 0x00, 0xd0, 0x66, 0x04, 0x4f, 0x02, 0x02, 0x47];
  u30(0);
  u30(3);
  u30(1);
  u30(1);
  u30(2);
  u30(constructorCode.length);
  for (const b of constructorCode) u8(b);
  u30(0);
  u30(0);
  // frame1: stop()
  const handlerCode = [0xd0, 0x30, 0x5d, handlerNameIndex, 0x4f, handlerNameIndex, 0x00, 0x47];
  u30(1);
  u30(2);
  u30(1);
  u30(1);
  u30(2);
  u30(handlerCode.length);
  for (const b of handlerCode) u8(b);
  u30(0);
  u30(0);

  return new Uint8Array(bytes);
}
