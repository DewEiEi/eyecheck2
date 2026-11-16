/**
 * AI processing interface. Each stage reflects a real backend step:
 *  1. Uploading Image          — XHR upload progress
 *  2. Checking Image Quality   — server-side quality gate (POST /screenings)
 *  3. AI Analyzing             — Roboflow inference (POST /ai/analyze)
 *  4. Processing Complete      — only after the backend returned the model result
 */
import { api } from './api.js';
import { icons } from './icons.js';
import { qs, esc, renderErrorState } from './ui.js';
import { requireUser } from './auth.js';
import { getWorkflow, setWorkflow, renderStepper, getCapture, clearCapture, subjectLabel } from './workflow.js';
import { EYE_SIDES, AI_STATUS } from './constants.js';

const root = () => qs('#page-root');
const STAGES = [
  { key: 'upload', label: 'Uploading Image', th: 'กำลังอัปโหลดภาพ' },
  { key: 'quality', label: 'Checking Image Quality', th: 'กำลังตรวจสอบคุณภาพภาพ' },
  { key: 'ai', label: 'AI Analyzing', th: 'AI กำลังวิเคราะห์ภาพ' },
  { key: 'done', label: 'Processing Complete', th: 'ประมวลผลเสร็จสิ้น' },
];

function setStage(key, status, note = '') {
  const li = qs(`[data-stage="${key}"]`);
  if (!li) return;
  li.className = status;
  li.querySelector('.p-icon').innerHTML = status === 'done' ? icons.check : status === 'error' ? icons.x : '';
  li.querySelector('.p-note').textContent = note;
}

function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',');
  const mime = /data:(.*?);/.exec(head)?.[1] ?? 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export async function init() {
  try { await requireUser(); } catch (err) { renderErrorState(root(), err); return; }
  const wf = getWorkflow();
  const capture = getCapture();

  root().innerHTML = `
    <div class="page-head"><h1>วิเคราะห์ผลด้วย AI</h1><p>ระบบจะส่งภาพไปยัง Backend เพื่อตรวจสอบคุณภาพ แล้ววิเคราะห์ด้วยโมเดล Deep Learning บน Roboflow</p></div>
    <div id="stepper"></div>
    ${wf.historyEmergency ? `<div class="alert alert-urgent mb-4" role="alert">${icons.siren}<div><strong>พบอาการเตือนฉุกเฉินจากการซักประวัติ</strong>
      กรุณาไปพบจักษุแพทย์หรือห้องฉุกเฉินทันที ไม่ต้องรอผล AI — ผล AI ไม่สามารถลบล้างคำเตือนนี้ได้</div></div>` : ''}
    <div class="grid grid-2">
      <section class="card">
        <div class="scan-anim mb-4" aria-hidden="true">${icons.eye}</div>
        <ol class="process-list" aria-live="polite">
          ${STAGES.map((s) => `<li data-stage="${s.key}"><span class="p-icon"></span><div><strong>${s.label}</strong><br><span class="small">${s.th}</span> <span class="small muted p-note"></span></div></li>`).join('')}
        </ol>
        <div class="progress mt-4" aria-hidden="true"><span id="up-progress"></span></div>
      </section>
      <section class="card">
        <h2>ข้อมูลการตรวจ</h2>
        <dl class="kv">
          <dt>ผู้เข้ารับการตรวจ</dt><dd>${esc(subjectLabel(wf) ?? '-')}</dd>
          <dt>ตาข้างที่ตรวจ</dt><dd>${esc(EYE_SIDES[capture?.meta?.eyeSide ?? wf.eyeSide] ?? '-')}</dd>
          <dt>ทดสอบการมองเห็น</dt><dd>${wf.visionTestId ? 'บันทึกแล้ว' : 'ไม่ได้ทดสอบ'}</dd>
          <dt>ยินยอมใช้ภาพพัฒนา AI</dt><dd>${wf.datasetConsent ? 'ยินยอม' : 'ไม่ยินยอม'}</dd>
        </dl>
        ${capture ? `<img src="${capture.dataUrl}" alt="ภาพดวงตาที่จะวิเคราะห์" class="mt-4" style="border-radius:12px;max-height:240px;object-fit:contain;margin:16px auto 0">` : ''}
        <div id="analyze-msg" class="mt-4"></div>
      </section>
    </div>`;
  renderStepper(qs('#stepper'), 'analyze');

  if (!wf.historyId) {
    qs('#analyze-msg').innerHTML = `<div class="alert alert-info">${icons.info}<div>ยังไม่ได้ซักประวัติ <a href="/pages/medical-history.html">เริ่มที่ขั้นตอนแรก</a></div></div>`;
    return;
  }
  if (wf.screeningId) { await runAi(wf.screeningId); return; } // resume / retry AI step
  if (!capture) {
    qs('#analyze-msg').innerHTML = `<div class="alert alert-info">${icons.info}<div>ยังไม่มีภาพดวงตาสำหรับวิเคราะห์ <a class="btn btn-primary btn-sm mt-2" href="/pages/scan.html">ไปที่สแกนดวงตา</a></div></div>`;
    return;
  }
  await upload(wf, capture);
}

async function upload(wf, capture) {
  setStage('upload', 'active');
  const fd = new FormData();
  fd.append('image', dataUrlToBlob(capture.dataUrl), 'eye.jpg');
  fd.append('eye_side', capture.meta?.eyeSide ?? wf.eyeSide ?? 'right');
  fd.append('medical_history_id', wf.historyId);
  if (wf.subject?.type === 'patient') fd.append('patient_id', wf.subject.id);
  if (wf.visionTestId) fd.append('vision_test_id', wf.visionTestId);
  fd.append('dataset_consent', wf.datasetConsent ? 'true' : 'false');
  if (wf.consentVersion) fd.append('consent_version', wf.consentVersion);

  let res;
  try {
    res = await api.upload('/screenings', fd, {
      onProgress: (p) => { qs('#up-progress').style.width = `${Math.round(p * 100)}%`; setStage('upload', 'active', `${Math.round(p * 100)}%`); },
      onUploaded: () => { setStage('upload', 'done'); setStage('quality', 'active'); },
    });
  } catch (err) {
    const stage = qs('[data-stage="quality"]').className === 'active' ? 'quality' : 'upload';
    setStage(stage, 'error', err.message);
    if (err.code === 'IMAGE_QUALITY_FAILED' || err.code === 'INVALID_IMAGE' || err.code === 'UNSUPPORTED_FILE_TYPE') {
      const items = err.details?.checks?.filter((c) => !c.passed && c.severity === 'error') ?? [];
      qs('#analyze-msg').innerHTML = `<div class="alert alert-danger" role="alert">${icons.xCircle}<div><strong>${esc(err.message)}</strong>
        ${items.length ? `<ul class="mb-0">${items.map((c) => `<li>${esc(c.label)}: ${esc(c.message)}</li>`).join('')}</ul>` : ''}
        <a class="btn btn-primary btn-sm mt-2" href="/pages/scan.html">ถ่ายภาพใหม่</a></div></div>`;
      clearCapture();
    } else if (err.code === 'HISTORY_OUTDATED') {
      qs('#analyze-msg').innerHTML = `<div class="alert alert-warning" role="alert">${icons.alert}<div>${esc(err.message)} <a class="btn btn-primary btn-sm mt-2" href="/pages/medical-history.html">ซักประวัติใหม่</a></div></div>`;
    } else {
      showRetry(err.message, () => upload(wf, capture));
    }
    return;
  }
  setStage('upload', 'done');
  setStage('quality', 'done', res.quality?.warnings?.length ? `ข้อควรระวัง: ${res.quality.warnings.join(' ')}` : 'ผ่านเกณฑ์');
  setWorkflow({ screeningId: res.screening.id, screeningCode: res.screening.screening_code });
  clearCapture(); // the image now lives only in private server storage
  if (res.datasetWarning) qs('#analyze-msg').innerHTML = `<div class="alert alert-warning">${icons.alert}<div>${esc(res.datasetWarning)}</div></div>`;
  await runAi(res.screening.id);
}

async function runAi(screeningId) {
  setStage('upload', 'done');
  setStage('quality', 'done');
  setStage('ai', 'active');
  let result;
  try {
    result = await api.post('/ai/analyze', { screening_id: screeningId }, { timeout: 120000 });
  } catch (err) {
    setStage('ai', 'error', err.message);
    showRetry(err.message, () => runAi(screeningId));
    return;
  }
  const status = result.screening.ai_status;
  if (status === 'completed' || status === 'insufficient_confidence') {
    setStage('ai', 'done', AI_STATUS[status].th);
    setStage('done', 'done');
    setWorkflow({ analyzed: true });
    renderStepper(qs('#stepper'), 'analyze');
    qs('#analyze-msg').innerHTML = `<div class="alert alert-success">${icons.checkCircle}<div><strong>ได้รับผลจากโมเดลแล้ว</strong> กำลังไปยังหน้าผลการตรวจ...</div></div>`;
    setTimeout(() => { location.href = `/pages/result.html?id=${encodeURIComponent(screeningId)}`; }, 900);
    return;
  }
  // not_connected / failed → no fake success. The history-based assessment is still available.
  setStage('ai', 'error', AI_STATUS[status]?.th ?? status);
  setWorkflow({ analyzed: true });
  qs('#analyze-msg').innerHTML = `
    <div class="alert ${status === 'not_connected' ? 'alert-warning' : 'alert-danger'}" role="alert">${icons.alert}<div>
      <strong>${status === 'not_connected' ? 'AI Not Connected' : 'การวิเคราะห์ด้วย AI ไม่สำเร็จ'}</strong>${esc(result.screening.ai_error ?? '')}
      <p class="mb-0 mt-2">ภาพถูกบันทึกแล้ว คุณสามารถลองวิเคราะห์ใหม่ภายหลัง หรือดูผลประเมินจากข้อมูลซักประวัติและการทดสอบการมองเห็น (ไม่มีผล AI)</p>
      <div class="row mt-3"><button class="btn btn-primary btn-sm" id="btn-retry">${icons.refresh}ลองวิเคราะห์ใหม่</button>
      <a class="btn btn-sm" href="/pages/result.html?id=${encodeURIComponent(screeningId)}">ดูผลประเมินจากซักประวัติ</a></div></div></div>`;
  qs('#btn-retry').addEventListener('click', () => { qs('#analyze-msg').innerHTML = ''; runAi(screeningId); });
}

function showRetry(message, fn) {
  qs('#analyze-msg').innerHTML = `<div class="alert alert-danger" role="alert">${icons.xCircle}<div><strong>เกิดข้อผิดพลาด</strong>${esc(message)}
    <div class="mt-2"><button class="btn btn-primary btn-sm" id="btn-retry">${icons.refresh}ลองใหม่</button></div></div></div>`;
  qs('#btn-retry').addEventListener('click', () => { qs('#analyze-msg').innerHTML = ''; fn(); });
}
