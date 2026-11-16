import { api } from './api.js';
import { icons } from './icons.js';
import { qs, esc, toast, setBusy, renderErrorState, renderState, formatDateTime } from './ui.js';
import { requireUser } from './auth.js';
import { getWorkflow, setWorkflow, renderStepper, subjectLabel } from './workflow.js';
import { getCalibration, saveCalibration, CARD_WIDTH_MM, EYE_TH } from './vision-tests/common.js';
import * as acuity from './vision-tests/acuity.js';
import * as color from './vision-tests/color.js';
import * as amsler from './vision-tests/amsler.js';
import * as field from './vision-tests/field.js';
import * as near from './vision-tests/near.js';
import * as contrast from './vision-tests/contrast.js';

const TESTS = [acuity, color, amsler, field, near, contrast];
const root = () => qs('#page-root');
const results = {}; // key → { right, left }
let calib = getCalibration();
let wf;

const statusText = (r) => {
  if (!r) return '<span class="badge badge-muted">ยังไม่ทดสอบ</span>';
  const part = (e) => (r[e]?.status === 'completed' ? '✓' : r[e]?.status === 'skipped' ? 'ข้าม' : '-');
  return `<span class="badge badge-primary">ขวา ${part('right')} · ซ้าย ${part('left')}</span>`;
};

export async function init() {
  let user;
  try { user = await requireUser(); } catch (err) { renderErrorState(root(), err); return; }
  wf = getWorkflow();

  root().innerHTML = `
    <div class="page-head"><h1>ทดสอบการมองเห็น</h1>
      <p>ทดสอบตาขวาและตาซ้ายแยกกัน ผลจะถูกนำไปประกอบการประเมินความเสี่ยงร่วมกับผลวิเคราะห์ภาพ</p></div>
    <div id="stepper"></div>
    <div class="alert alert-warning mb-4" role="note">${icons.alert}<div><strong>ข้อควรทราบ</strong>
      การทดสอบผ่านหน้าจอ<u>ไม่ใช่</u>การตรวจสายตามาตรฐานโดยผู้เชี่ยวชาญ ผลขึ้นกับขนาดหน้าจอ ความสว่าง ระยะห่าง และการปรับเทียบ ใช้เพื่อการคัดกรองเบื้องต้นเท่านั้น</div></div>
    <div id="vt-pre"></div>
    <div id="vt-main"></div>`;
  renderStepper(qs('#stepper'), 'vision');

  if (!wf.historyId || (user.account_type === 'staff' && wf.subject?.type !== 'patient')) {
    qs('#vt-pre').innerHTML = `<div class="alert alert-info mb-4">${icons.info}<div><strong>ยังไม่ได้ซักประวัติ</strong> กรุณาซักประวัติผู้เข้ารับการตรวจก่อน เพื่อให้ระบบบันทึกผลทดสอบให้ถูกบุคคล
      <div class="mt-2"><a class="btn btn-primary btn-sm" href="/pages/medical-history.html">ไปที่ซักประวัติ</a></div></div></div>`;
    return;
  }
  qs('#vt-pre').innerHTML = `<p class="mb-4"><span class="source-tag">ผู้เข้ารับการตรวจ</span><br><strong>${esc(subjectLabel(wf))}</strong></p>`;
  renderOverview();
}

function renderOverview() {
  const main = qs('#vt-main');
  const anyDone = Object.keys(results).length > 0;
  main.innerHTML = `
    <section class="card mb-4" aria-labelledby="h-cal">
      <div class="card-title"><div class="icon-bubble">${icons.settings}</div><h2 id="h-cal">ปรับเทียบหน้าจอ</h2></div>
      ${calib ? `<p class="mb-3">ปรับเทียบแล้ว: ${calib.pxPerMm.toFixed(2)} px/มม. · ระยะทดสอบสายตาระยะไกล ${calib.distanceCm} ซม.</p>` : '<p class="mb-3 text-2">เพื่อให้ขนาดตัวอักษรถูกต้อง กรุณาปรับเทียบขนาดหน้าจอด้วยบัตรขนาดมาตรฐาน (เช่น บัตรประชาชน/บัตร ATM)</p>'}
      <button class="btn" type="button" id="btn-cal">${calib ? 'ปรับเทียบใหม่' : 'เริ่มปรับเทียบ'}</button>
    </section>
    <section aria-labelledby="h-tests">
      <div class="row-between mb-3"><h2 id="h-tests" class="mb-0">รายการทดสอบ</h2>
        <button class="btn btn-primary" type="button" id="btn-all">${icons.play}ทดสอบทั้งหมดตามลำดับ</button></div>
      <div class="vt-list">
        ${TESTS.map((t, i) => `<article class="card">
          <div class="vt-item"><div class="icon-bubble">${i + 1}</div><div><h3 class="mb-0">${t.meta.title}</h3><p class="small text-2 mb-0">${t.meta.description}</p></div></div>
          <div class="row-between mt-3">${statusText(results[t.meta.key])}<button class="btn btn-sm" data-run="${t.meta.key}">${results[t.meta.key] ? 'ทดสอบใหม่' : 'เริ่ม'}</button></div>
        </article>`).join('')}
        <article class="card card-muted"><div class="vt-item"><div class="icon-bubble accent">${icons.eye}</div><div><h3 class="mb-0">ทดสอบตาซ้ายและตาขวาแยกกัน</h3>
          <p class="small text-2 mb-0">ทุกการทดสอบจะทำกับตาขวาก่อนแล้วจึงตาซ้าย และบันทึกผลแยกกัน</p></div></div></article>
      </div>
    </section>
    <section class="card mt-5" id="vt-summary-box" aria-labelledby="h-vsum">
      <h2 id="h-vsum">บันทึกผลและไปขั้นตอนถัดไป</h2>
      <p class="text-2">${anyDone ? 'บันทึกผลการทดสอบที่ทำแล้ว (การทดสอบที่ไม่ได้ทำจะถูกบันทึกว่า "ไม่ได้ทดสอบ")' : 'ยังไม่ได้ทดสอบ คุณสามารถข้ามขั้นตอนนี้ได้ แต่ระบบจะประเมินความเสี่ยงได้ไม่ครบถ้วน'}</p>
      <div class="row">
        <button class="btn btn-primary btn-lg" type="button" id="btn-save" ${anyDone ? '' : 'disabled'}>${icons.save}บันทึกผลการทดสอบ</button>
        <button class="btn" type="button" id="btn-skip">ข้ามการทดสอบการมองเห็น</button>
      </div>
    </section>
    <section class="mt-5" aria-labelledby="h-past"><h2 id="h-past">ผลการทดสอบย้อนหลัง</h2><div id="vt-past"></div></section>`;

  qs('#btn-cal').addEventListener('click', runCalibration);
  qs('#btn-all').addEventListener('click', async () => { for (const t of TESTS) { const ok = await runTest(t); if (!ok) break; } renderOverview(); });
  // assigned (not added) so re-rendering never stacks duplicate handlers
  main.onclick = async (e) => {
    const key = e.target.closest('[data-run]')?.dataset.run;
    if (!key) return;
    await runTest(TESTS.find((t) => t.meta.key === key));
    renderOverview();
  };
  qs('#btn-save').addEventListener('click', save);
  qs('#btn-skip').addEventListener('click', () => { setWorkflow({ visionSkipped: true, visionTestId: null }); location.href = '/pages/scan.html'; });
  loadPast();
}

async function loadPast() {
  const box = qs('#vt-past');
  renderState(box, { type: 'loading' });
  try {
    const rows = await api.get('/vision-tests', wf.subject?.type === 'patient' ? { patient_id: wf.subject.id } : null);
    if (!rows.length) { renderState(box, { type: 'empty', message: 'ยังไม่มีผลการทดสอบที่บันทึกไว้' }); return; }
    box.innerHTML = `<div class="table-wrap"><table class="table stack-sm"><thead><tr><th>วันที่และเวลา</th><th>จำนวนการทดสอบ</th><th>ผลที่เกินเกณฑ์คัดกรอง</th></tr></thead><tbody>
      ${rows.slice(0, 10).map((r) => `<tr><td data-label="วันที่">${formatDateTime(r.created_at)}</td><td data-label="จำนวน">${esc(r.summary?.tested_count ?? 0)} รายการ</td>
        <td data-label="เกินเกณฑ์">${r.summary?.abnormal_tests?.length ? r.summary.abnormal_tests.map((k) => `<span class="badge badge-warning">${esc(TESTS.find((t) => t.meta.key === k)?.meta.title.split(' (')[0] ?? k)}</span>`).join(' ') : '<span class="badge badge-success">ไม่พบ</span>'}</td></tr>`).join('')}
      </tbody></table></div>`;
  } catch (err) { renderErrorState(box, err, loadPast); }
}

// ---------------- calibration ----------------
function runCalibration() {
  const main = qs('#vt-main');
  const startPx = calib ? calib.pxPerMm * CARD_WIDTH_MM : 324;
  main.innerHTML = `
    <section class="card" aria-labelledby="h-c">
      <h2 id="h-c">ปรับเทียบหน้าจอ</h2>
      <ol><li>นำบัตรขนาดมาตรฐาน (บัตรประชาชน/บัตร ATM) วางทาบบนหน้าจอ</li><li>เลื่อนแถบปรับขนาดจนกรอบด้านล่างกว้างเท่ากับบัตรพอดี</li><li>ระบุระยะห่างระหว่างดวงตากับหน้าจอที่จะใช้ทดสอบสายตาระยะไกล</li></ol>
      <div class="vt-stage" style="min-height:260px"><div id="cal-card" class="calib-card" style="width:${startPx}px;height:${startPx * 0.6306}px">ขนาดบัตร</div></div>
      <div class="form-grid mt-4">
        <div class="field"><label for="cal-size">ขนาดกรอบ</label><input type="range" id="cal-size" min="150" max="700" step="1" value="${Math.round(startPx)}"></div>
        <div class="field"><label for="cal-dist">ระยะห่างจากหน้าจอ (ซม.)</label><input class="input" id="cal-dist" type="number" min="50" max="600" value="${calib?.distanceCm ?? 100}"><span class="hint">แนะนำ 100–300 ซม. ยิ่งไกล ผลยิ่งแม่นยำ</span></div>
      </div>
      <div class="row mt-4"><button class="btn btn-primary" id="cal-save">บันทึกการปรับเทียบ</button><button class="btn" id="cal-cancel">ยกเลิก</button></div>
    </section>`;
  const card = qs('#cal-card');
  qs('#cal-size').addEventListener('input', (e) => { const w = Number(e.target.value); card.style.width = `${w}px`; card.style.height = `${w * 0.6306}px`; });
  qs('#cal-cancel').addEventListener('click', renderOverview);
  qs('#cal-save').addEventListener('click', () => {
    const d = Number(qs('#cal-dist').value);
    if (!(d >= 50 && d <= 600)) { toast('ระยะห่างต้องอยู่ระหว่าง 50–600 ซม.', 'warning'); return; }
    calib = { pxPerMm: Number(qs('#cal-size').value) / CARD_WIDTH_MM, distanceCm: d, at: Date.now() };
    saveCalibration(calib);
    toast('บันทึกการปรับเทียบแล้ว', 'success');
    renderOverview();
  });
}

// ---------------- run a test (right then left) ----------------
async function runTest(test) {
  const main = qs('#vt-main');
  const res = {};
  for (const eye of ['right', 'left']) {
    main.innerHTML = `
      <section class="card" aria-live="polite">
        <div class="row-between mb-3"><h2 class="mb-0">${test.meta.title}</h2><button class="btn btn-ghost" data-abort>ออกจากการทดสอบ</button></div>
        <div class="alert alert-info mb-4">${icons.info}<div><strong>คำแนะนำก่อนเริ่ม (${EYE_TH[eye]})</strong><ul class="mb-0">${test.meta.instructions.map((s) => `<li>${s}</li>`).join('')}</ul></div></div>
        <div class="vt-stage" id="vt-stage">
          <span class="vt-eye-banner">${icons.eye.replace('<svg', '<svg width="18" height="18"')} ทดสอบ${EYE_TH[eye]}</span>
          <p>กรุณาปิด${eye === 'right' ? 'ตาซ้าย' : 'ตาขวา'}ด้วยฝ่ามือ แล้วกดเริ่ม</p>
          <div class="row" style="justify-content:center"><button class="btn btn-primary btn-lg" data-go>เริ่มทดสอบ${EYE_TH[eye]}</button><button class="btn" data-skip-eye>ข้าม${EYE_TH[eye]}</button></div>
        </div>
      </section>`;
    const stage = qs('#vt-stage');
    const action = await new Promise((resolve) => {
      main.addEventListener('click', function h(e) {
        const t = e.target.closest('[data-go],[data-skip-eye],[data-abort]');
        if (!t) return;
        main.removeEventListener('click', h);
        resolve(t.hasAttribute('data-go') ? 'go' : t.hasAttribute('data-skip-eye') ? 'skip' : 'abort');
      });
    });
    if (action === 'abort') return false;
    if (action === 'skip') { res[eye] = { status: 'skipped' }; continue; }
    const abortP = new Promise((resolve) => main.querySelector('[data-abort]').addEventListener('click', () => resolve('abort'), { once: true }));
    const r = await Promise.race([test.run(stage, { eye, calib }), abortP]);
    if (r === 'abort') return false;
    res[eye] = r;
  }
  const extra = {};
  if (test.meta.key === 'visual_acuity') Object.assign(extra, { distance_cm: calib?.distanceCm ?? 100, calibrated: Boolean(calib), px_per_mm: calib ? Math.round(calib.pxPerMm * 1000) / 1000 : null });
  if (test.meta.key === 'near_vision') extra.distance_cm = near.distanceCm;
  results[test.meta.key] = { ...res, ...extra };
  toast(`บันทึกผล ${test.meta.title.split(' (')[0]} ชั่วคราวแล้ว`, 'success', 2500);
  return true;
}

// ---------------- save ----------------
async function save() {
  const btn = qs('#btn-save');
  setBusy(btn, true);
  const payload = { ...(wf.subject?.type === 'patient' ? { patient_id: wf.subject.id } : {}) };
  for (const t of TESTS) {
    const r = results[t.meta.key];
    payload[t.meta.key] = r ? { right: r.right ?? { status: 'not_tested' }, left: r.left ?? { status: 'not_tested' }, ...Object.fromEntries(Object.entries(r).filter(([k]) => !['right', 'left'].includes(k))) } : null;
  }
  try {
    const saved = await api.post('/vision-tests', payload);
    setWorkflow({ visionTestId: saved.id, visionSkipped: false });
    renderStepper(qs('#stepper'), 'vision');
    const s = saved.summary;
    qs('#vt-main').innerHTML = `
      <section class="card fade-up" aria-labelledby="h-done">
        <div class="card-title"><div class="icon-bubble accent">${icons.checkCircle}</div><h2 id="h-done">บันทึกผลการทดสอบการมองเห็นแล้ว</h2></div>
        <p class="small muted">บันทึกเมื่อ ${formatDateTime(saved.created_at)} · เกณฑ์ ${esc(s.criteria_version)}</p>
        <div class="table-wrap"><table class="table stack-sm"><thead><tr><th>การทดสอบ</th><th>ตาขวา</th><th>ตาซ้าย</th></tr></thead><tbody>
          ${Object.values(s.tests).map((t) => `<tr><td data-label="การทดสอบ">${esc(t.label)}</td>
            ${['right', 'left'].map((e) => `<td data-label="${EYE_TH[e]}">${t[e].abnormal === true ? '<span class="badge badge-warning">เกินเกณฑ์</span> ' : t[e].abnormal === false ? '<span class="badge badge-success">ผ่านเกณฑ์</span> ' : ''}${esc(t[e].text)}</td>`).join('')}</tr>`).join('')}
        </tbody></table></div>
        <div class="row mt-5"><a class="btn btn-primary btn-lg" href="/pages/scan.html">ไปขั้นตอนถัดไป: สแกนดวงตา</a></div>
      </section>`;
  } catch (err) {
    toast(err.message, 'error');
    setBusy(btn, false);
  }
}
