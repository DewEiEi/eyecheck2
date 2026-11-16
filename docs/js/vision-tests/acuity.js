/**
 * Visual acuity — tumbling "E" optotype, logMAR 1.0 → 0.0 in 0.1 steps.
 * 3 presentations per line; a line is passed with ≥ 2 correct.
 */
import { optotypePx, snellen, pick, coverText, waitChoice, EYE_TH } from './common.js';

export const meta = {
  key: 'visual_acuity',
  title: 'ความคมชัดของสายตา (Visual Acuity)',
  description: 'บอกทิศทางขาของตัว E ที่เล็กลงเรื่อย ๆ เพื่อประมาณความคมชัดของการมองเห็นระยะไกล',
  instructions: ['นั่งห่างจากหน้าจอตามระยะที่ตั้งไว้ในการปรับเทียบ', 'สวมแว่นสายตาหรือคอนแทคเลนส์ที่ใช้เป็นประจำ', 'กดปุ่มลูกศร (หรือปุ่มบนคีย์บอร์ด) ตามทิศทางที่ขาของตัว E ชี้ไป', 'หากมองไม่เห็น ให้กด "มองไม่เห็น"'],
};

const LEVELS = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.0];
const DIRS = ['up', 'down', 'left', 'right'];
const ROT = { right: 0, down: 90, left: 180, up: 270 };

function drawE(canvas, sizePx, dir) {
  const s = Math.max(5, Math.round(sizePx));
  const unit = s / 5;
  canvas.width = s + 4;
  canvas.height = s + 4;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((ROT[dir] * Math.PI) / 180);
  ctx.translate(-s / 2, -s / 2);
  ctx.fillStyle = '#000';
  // E opening to the right: vertical bar + 3 arms
  ctx.fillRect(0, 0, unit, s);
  ctx.fillRect(0, 0, s, unit);
  ctx.fillRect(0, 2 * unit, s, unit);
  ctx.fillRect(0, 4 * unit, s, unit);
  ctx.restore();
  canvas.style.width = `${canvas.width / devicePixelRatio}px`;
  canvas.style.height = `${canvas.height / devicePixelRatio}px`;
}

export async function run(stage, { eye, calib }) {
  const distance = calib?.distanceCm ?? 100;
  const maxPx = Math.min(window.innerHeight * 0.45, 420) * devicePixelRatio;
  let best = null;
  let trials = 0;
  for (const L of LEVELS) {
    const px = optotypePx(L, distance, calib) * devicePixelRatio;
    if (px > maxPx) continue; // too big for this screen at this distance
    if (px < 5) break; // screen cannot render smaller reliably
    let correct = 0;
    for (let t = 0; t < 3; t++) {
      const dir = pick(DIRS);
      stage.innerHTML = `
        <span class="vt-eye-banner">${EYE_TH[eye]} · บรรทัด logMAR ${L.toFixed(1)} (${t + 1}/3)</span>
        <p class="small muted mb-0">${coverText(eye)}</p>
        <canvas aria-label="ตัว E สำหรับทดสอบ"></canvas>
        <div class="vt-arrows" role="group" aria-label="เลือกทิศทาง">
          <button class="btn up" data-dir="up" aria-label="ขึ้น">↑</button>
          <button class="btn left" data-dir="left" aria-label="ซ้าย">←</button>
          <button class="btn right" data-dir="right" aria-label="ขวา">→</button>
          <button class="btn down" data-dir="down" aria-label="ลง">↓</button>
        </div>
        <button class="btn btn-ghost" data-dir="none">มองไม่เห็น</button>`;
      drawE(stage.querySelector('canvas'), px, dir);
      const ans = await waitChoice(stage, '[data-dir]');
      trials++;
      if (ans.dir === dir) correct++;
      const wrong = t + 1 - correct;
      if (correct >= 2 || wrong >= 2) break; // outcome of this line is decided
    }
    if (correct >= 2) best = L;
    else break;
  }
  const logmar = best ?? 1.1; // 1.1 = worse than the largest line shown
  return {
    status: 'completed',
    logmar,
    snellen: best === null ? '< 6/60' : snellen(best),
    trials,
  };
}
