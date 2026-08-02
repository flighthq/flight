import { readdirSync, readFileSync } from 'node:fs';

import { parseRiveDocument } from './riveDocument';

const DIR = process.env.RIV_DIR ?? '';

describe('rotation units', () => {
  it('measures the distribution of rotation values in real files', () => {
    const vals: number[] = [];
    for (const f of readdirSync(DIR).filter((n) => n.endsWith('.riv'))) {
      const doc = parseRiveDocument(new Uint8Array(readFileSync(`${DIR}/${f}`)));
      if (doc === null) continue;
      for (const o of doc.objects) {
        for (const p of o.properties) if (p.key === 15) vals.push(p.value as number);
      }
    }
    const nz = vals.filter((v) => v !== 0).map(Math.abs);
    nz.sort((a, b) => a - b);
    const over2pi = nz.filter((v) => v > Math.PI * 2).length;
    const over7 = nz.filter((v) => v > 7).length;
    console.log(`rotation samples ${vals.length} nonzero ${nz.length}`);
    console.log(`max ${nz[nz.length - 1]} median ${nz[Math.floor(nz.length / 2)]}`);
    console.log(`|v| > 2PI : ${over2pi} (${((over2pi / nz.length) * 100).toFixed(1)}%)  |v| > 7 : ${over7}`);
    console.log('largest 8:', JSON.stringify(nz.slice(-8)));
  });
});
