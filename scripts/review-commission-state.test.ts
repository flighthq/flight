import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { reviewMissingReferenceMessage } from '../tools/review/src/commissionState';

describe('reviewMissingReferenceMessage', () => {
  it('distinguishes a pending request from a cell that was never commissioned', () => {
    expect(reviewMissingReferenceMessage('requested')).toBe('Request pending — no blessed reference image yet');
    expect(reviewMissingReferenceMessage('not-commissioned')).toBe(
      'No reference image — this cell is not commissioned',
    );
  });

  it.each(['included', 'differs'] as const)('directs a locked %s cell to fetch its pack', (state) => {
    expect(reviewMissingReferenceMessage(state)).toContain('npm run reference-image:fetch');
  });

  it('drives the production missing-reference pane', () => {
    const mainSource = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'review', 'src', 'main.ts'),
      'utf8',
    );

    expect(mainSource).toContain('placeholder.textContent = reviewMissingReferenceMessage(cell.commissionState);');
  });
});
