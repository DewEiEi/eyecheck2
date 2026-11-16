/**
 * Near vision at ~40 cm: read random 3-digit numbers of decreasing size.
 */
import { optotypePx, coverText, EYE_TH } from './common.js';

export const meta = {
  key: 'near_vision',
  title: 'การมองเห็นระยะใกล้ (Near Vision)',
  description: 'อ่านตัวเลขที่มีขนาดเล็กลงเรื่อย ๆ ที่ระยะประมาณ 40 เซนติเมตร (ระยะอ่านหนังสือ)',
  instructions: ['ถือโทรศัพท์หรือนั่งห่างจากหน้าจอประมาณ 40 ซม. (ประมาณหนึ่งช่วงแขนงอ)', 'สวมแว่นอ่านหนังสือหากใช้เป็นประจำ', 'พิมพ์ตัวเลขที่เห็นแล้วกด "ตอบ"', 'หากอ่านไม่ออก ให้กด "อ่านไม่ออก"'],
};

const LEVELS = [1.0, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.0];
const DISTANCE_CM = 40;

function ask(stage, eye, L, px, attempt) {
  const num = String(Math.floor(100 + Math.random() * 900));
  stage.innerHTML = `
    <span class="vt-eye-banner">${EYE_TH[eye]} · logMAR ${L.toFixed(1)} (ครั้งที่ ${attempt})</span>
    <p class="small muted mb-0">${coverText(eye)} · ระยะ 40 ซม.</p>
    <div class="vt-optotype" style="font-size:${px}px;letter-spacing:${px * 0.3}px" aria-hidden="true">${num}</div>
    <form class="row" style="justify-content:center" novalidate>
      <label class="sr-only" for="near-input">ตัวเลขที่เห็น</label>
      <input class="input" id="near-input" inputmode="numeric" maxlength="3" style="width:140px;text-align:center;font-size:1.3rem" autocomplete="off">
      <button class="btn btn-primary" type="submit">ตอบ</button>
      <button class="btn btn-ghost" type="button" data-skip>อ่านไม่ออก</button>
    </form>`;
  const form = stage.querySelector('form');
  const input = stage.querySelector('input');
  input.focus();
  return new Promise((resolve) => {
    form.addEventListener('submit', (e) => { e.preventDefault(); resolve(input.value.trim() === num); });
    stage.querySelector('[data-skip]').addEventListener('click', () => resolve(false));
  });
}

export async function run(stage, { eye, calib }) {
  let best = null;
  let smallest = null;
  for (const L of LEVELS) {
    // font-size ≈ cap height / 0.72 for digits
    const px = optotypePx(L, DISTANCE_CM, calib) / 0.72;
    if (px > 260) continue;
    if (px < 4) break;
    let ok = await ask(stage, eye, L, px, 1);
    if (!ok) ok = await ask(stage, eye, L, px, 2);
    if (!ok) break;
    best = L;
    smallest = (px * 0.72) / (calib?.pxPerMm ?? 96 / 25.4);
  }
  return { status: 'completed', logmar: best ?? 1.1, smallest_size_mm: smallest === null ? null : Math.round(smallest * 100) / 100 };
}

export const distanceCm = DISTANCE_CM;
