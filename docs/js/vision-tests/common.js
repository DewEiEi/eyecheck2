/**
 * Shared helpers for on-screen vision tests.
 * Screen tests are approximations: they depend on calibration, viewing
 * distance and display quality — never a substitute for standard testing.
 */
const CAL_KEY = 'ec_vt_calibration';
export const CARD_WIDTH_MM = 85.6; // ISO/IEC 7810 ID-1 (credit card)
const ARCMIN = Math.PI / (180 * 60);

export function getCalibration() {
  try { return JSON.parse(localStorage.getItem(CAL_KEY)) ?? null; } catch { return null; }
}
export function saveCalibration(c) {
  try { localStorage.setItem(CAL_KEY, JSON.stringify(c)); } catch { /* ignore */ }
}

/** Fallback when the user skips calibration: CSS reference pixel ≈ 0.2646 mm */
export function pxPerMm(cal) {
  return cal?.pxPerMm ?? 96 / 25.4;
}

/** Letter height (px) for a given logMAR at distance (cm): optotype = 5 arcmin × MAR */
export function optotypePx(logmar, distanceCm, cal) {
  const mm = distanceCm * 10 * Math.tan(5 * ARCMIN * 10 ** logmar);
  return mm * pxPerMm(cal);
}

export function snellen(logmar) {
  return `6/${Math.round(6 * 10 ** logmar)}`;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export function shuffle(a) {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

export const EYE_TH = { right: 'ตาขวา', left: 'ตาซ้าย' };
export const coverText = (eye) => `กรุณาปิด${eye === 'right' ? 'ตาซ้าย' : 'ตาขวา'}ด้วยฝ่ามือ (ไม่กดลูกตา) แล้วทดสอบด้วย${EYE_TH[eye]}`;

/** Wait for one click on an element matching `selector` inside root; resolves its dataset. */
export function waitChoice(root, selector) {
  return new Promise((resolve) => {
    const onClick = (e) => {
      const b = e.target.closest(selector);
      if (!b || !root.contains(b)) return;
      root.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
      resolve({ ...b.dataset });
    };
    const onKey = (e) => {
      const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
      const dir = map[e.key];
      const b = dir ? root.querySelector(`${selector}[data-dir="${dir}"]`) : null;
      if (b) { e.preventDefault(); b.click(); }
    };
    root.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
  });
}
