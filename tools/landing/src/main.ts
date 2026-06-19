import { startOrbBackground } from './background-orbs';
import { startParticleBackground } from './background-particles';

// Rewrite the tool links to base-absolute URLs (`/flight/explorer/` in production, `/explorer/`
// in dev) so they resolve from the site root rather than the current path. Relative hrefs compound
// when the dev server falls back to serving this page for an unknown `/functional/` path — each
// click would append another segment. Base-absolute links never stack and stay correct under the
// deployed `/flight/` base.
const base = import.meta.env.BASE_URL;
for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-tool]')) {
  link.href = `${base}${link.dataset.tool}/`;
}

// Two Flight-rendered backgrounds, layered by default: the particle field fills the screen and the
// orbs drift over it (the orb canvas clears to transparent — see background-orbs.ts — so the
// particles show through). Append `?bg=orbs` or `?bg=particles` to isolate one for comparison.
// Orbs are started first so the later-prepended particle canvas sits behind them in the DOM.
// Backgrounds are progressive enhancement: the page is fully readable over the static dark
// background without them, so this is deliberately not wrapped in try/catch — if WebGL is
// unavailable (old hardware, headless capture) the error surfaces in the console and the static
// background simply remains.
const background = new URLSearchParams(window.location.search).get('bg');
if (background !== 'particles') startOrbBackground();
if (background !== 'orbs') startParticleBackground();
