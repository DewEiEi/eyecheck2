import { api } from '../api.js';
import { icons } from '../icons.js';
import { qs, esc, toast, setBusy, renderErrorState, renderState, formatDateTime } from '../ui.js';
import { openModal, confirmDialog } from '../../components/modal.js';

// ---------------------------------------------------------------------
// Staff registration codes
// ---------------------------------------------------------------------
export async function renderCodes(box) {
  box.innerHTML = `<header class="row-between"><div><h1>โค้ดสมัครบัญชีเจ้าหน้าที่</h1><p class="muted mb-0">ระบบเก็บเฉพาะค่าแฮชของโค้ด โค้ดจริงจะแสดงเพียงครั้งเดียวตอนสร้าง</p></div>
    <button class="btn btn-primary" id="c-new">${icons.plus}สร้างโค้ดใหม่</button></header><div id="c-list"></div>`;
  const list = qs('#c-list');
  const load = async () => {
    renderState(list, { type: 'loading' });
    let rows;
    try { rows = await api.get('/admin/registration-codes'); } catch (err) { renderErrorState(list, err, load); return; }
    if (!rows.length) { renderState(list, { type: 'empty', message: 'ยังไม่มีโค้ด สร้างโค้ดเพื่อให้เจ้าหน้าที่สมัครบัญชี' }); return; }
    list.innerHTML = `<div class="table-wrap"><table class="table stack-sm"><thead><tr><th>ชื่อ/หน่วยงาน</th><th>สถานะ</th><th>ใช้ไปแล้ว</th><th>หมดอายุ</th><th>สร้างเมื่อ</th><th></th></tr></thead><tbody>
      ${rows.map((c) => `<tr><td data-label="ชื่อ">${esc(c.label ?? '-')}</td>
        <td data-label="สถานะ">${c.status === 'active' ? '<span class="badge badge-success">ใช้งานได้</span>' : c.status === 'exhausted' ? '<span class="badge badge-muted">ใช้ครบแล้ว</span>' : '<span class="badge badge-danger">ปิดใช้งาน</span>'}${c.expires_at && new Date(c.expires_at) < new Date() ? ' <span class="badge badge-muted">หมดอายุ</span>' : ''}</td>
        <td data-label="ใช้แล้ว">${c.usage_count}${c.usage_limit ? ` / ${c.usage_limit}` : ' (ไม่จำกัด)'}</td>
        <td data-label="หมดอายุ">${c.expires_at ? formatDateTime(c.expires_at) : 'ไม่มี'}</td><td data-label="สร้าง">${formatDateTime(c.created_at)}</td>
        <td class="actions">${c.status === 'active' ? `<button class="btn btn-sm btn-outline-danger" data-disable="${esc(c.id)}">ปิดใช้งาน</button>` : c.status === 'disabled' ? `<button class="btn btn-sm" data-enable="${esc(c.id)}">เปิดใช้งาน</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>`;
  };
  list.onclick = async (e) => {
    const b = e.target.closest('button');
    const id = b?.dataset.disable || b?.dataset.enable;
    if (!id) return;
    if (b.dataset.disable && !(await confirmDialog({ title: 'ปิดใช้งานโค้ด', message: 'โค้ดนี้จะใช้สมัครบัญชีไม่ได้อีก (บัญชีที่สมัครแล้วไม่ได้รับผลกระทบ)', danger: true, confirmText: 'ปิดใช้งาน' }))) return;
    try { await api.patch(`/admin/registration-codes/${id}`, { status: b.dataset.disable ? 'disabled' : 'active' }); toast('อัปเดตแล้ว', 'success'); load(); } catch (err) { toast(err.message, 'error'); }
  };
  qs('#c-new').addEventListener('click', () => {
    const form = document.createElement('form');
    form.innerHTML = `<div class="stack">
      <div class="field"><label for="c-label">ชื่อ/หน่วยงาน (สำหรับอ้างอิง)</label><input class="input" id="c-label" maxlength="120" placeholder="เช่น รพ.สต. บ้านหนองบัว"></div>
      <div class="field"><label for="c-limit">จำกัดจำนวนการใช้</label><input class="input" id="c-limit" type="number" min="1" max="10000" placeholder="ว่าง = ไม่จำกัด"></div>
      <div class="field"><label for="c-exp">วันหมดอายุ</label><input class="input" id="c-exp" type="date" min="${new Date().toISOString().slice(0, 10)}"></div></div>
      <div class="modal-foot"><button type="button" class="btn" data-close>ยกเลิก</button><button class="btn btn-primary" type="submit">สร้างโค้ด</button></div>`;
    const m = openModal({ title: 'สร้างโค้ดสมัครบัญชีเจ้าหน้าที่', content: form });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = qs('[type="submit"]', form);
      setBusy(btn, true);
      try {
        const limit = qs('#c-limit', form).value;
        const r = await api.post('/admin/registration-codes', { label: qs('#c-label', form).value.trim() || undefined, usage_limit: limit ? Number(limit) : null, expires_at: qs('#c-exp', form).value || null });
        m.body.innerHTML = `<div class="alert alert-warning mb-3">${icons.alert}<div><strong>คัดลอกโค้ดตอนนี้</strong>ระบบจะไม่แสดงโค้ดนี้อีก</div></div>
          <div class="code-reveal" id="code-val">${esc(r.code)}</div>
          <div class="modal-foot"><button class="btn" id="copy-code">${icons.clipboard}คัดลอก</button><button class="btn btn-primary" data-close>เสร็จสิ้น</button></div>`;
        qs('#copy-code', m.body).addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(r.code); toast('คัดลอกแล้ว', 'success'); } catch { toast('คัดลอกไม่สำเร็จ กรุณาเลือกข้อความแล้วคัดลอกเอง', 'warning'); }
        });
        load();
      } catch (err) { toast(err.message, 'error'); setBusy(btn, false); }
    });
  });
  load();
}

// ---------------------------------------------------------------------
// Settings & system health
// ---------------------------------------------------------------------
export async function renderSettings(box) {
  box.innerHTML = `<header class="row-between"><div><h1>ตั้งค่า & สถานะระบบ</h1><p class="muted mb-0">ตรวจสอบการทำงานของฐานข้อมูล Storage และ AI</p></div>
    <button class="btn" id="h-refresh">${icons.refresh}ตรวจสอบอีกครั้ง</button></header>
    <section class="card mb-4"><h2>สถานะการทำงานของระบบ</h2><div id="health"></div></section>
    <section class="card"><h2>เกณฑ์ความมั่นใจของ AI (Confidence Threshold)</h2><div id="settings"></div></section>`;
  const health = qs('#health');
  const loadHealth = async () => {
    renderState(health, { type: 'loading' });
    let h;
    try { h = await api.get('/admin/health', null, { timeout: 45000 }); } catch (err) { renderErrorState(health, err, loadHealth); return; }
    const item = (ok, title, text) => `<div class="card card-muted"><p class="mb-0"><span class="status-dot ${ok === true ? 'ok' : ok === null ? 'warn' : 'err'}"></span> <strong>${title}</strong></p><p class="small mb-0">${text}</p></div>`;
    health.innerHTML = `<div class="health-grid">
      ${item(h.database.ok, 'Database (Supabase)', h.database.ok ? `เชื่อมต่อได้ · ${h.database.latency_ms} ms` : esc(h.database.error))}
      ${item(h.storage.ok, 'Storage', h.storage.ok ? `Buckets: ${esc(h.storage.buckets.join(', '))}` : esc(h.storage.error ?? 'ไม่พบ bucket ที่ต้องใช้ (รัน 003_storage.sql)'))}
      ${item(h.ai.connected ? (h.ai.ready ? true : null) : false, 'AI (Roboflow)', h.ai.connected ? (h.ai.ready ? `พร้อมใช้งาน · ${esc(h.ai.project)} v${esc(h.ai.modelVersion)}` : esc(h.ai.reason)) : `Not Connected · ${esc(h.ai.reason)}`)}
      ${item(true, 'Backend', `Uptime ${Math.round(h.server.uptime_s / 60)} นาที · Node ${esc(h.server.node)} · RAM ${h.server.memory_mb} MB`)}
    </div><p class="small muted mt-3 mb-0">ตรวจสอบเมื่อ ${formatDateTime(h.checked_at)}</p>`;
  };
  const settingsBox = qs('#settings');
  const loadSettings = async () => {
    renderState(settingsBox, { type: 'loading' });
    let s;
    try { s = await api.get('/admin/settings'); } catch (err) { renderErrorState(settingsBox, err, loadSettings); return; }
    const t = s.ai_confidence_threshold ?? {};
    settingsBox.innerHTML = `<form id="th-form" class="stack" style="max-width:560px">
      <p class="text-2">ผลที่มีค่าความมั่นใจต่ำกว่าเกณฑ์นี้จะแสดงเป็น "Insufficient Confidence" ควรกำหนดจากการประเมินโมเดลกับชุดข้อมูลทดสอบ (เช่น จุดที่ให้ Sensitivity/Specificity ตามที่ต้องการ)</p>
      <div class="field"><label for="th-val">เกณฑ์ (%)</label><input class="input" id="th-val" type="number" min="5" max="99" step="1" value="${Math.round((t.value ?? 0.6) * 100)}"></div>
      <label class="check-inline"><input type="checkbox" id="th-valid" ${t.validated ? 'checked' : ''}> เกณฑ์นี้ผ่านการประเมินกับชุดข้อมูลทดสอบแล้ว</label>
      <div class="field"><label for="th-note">หมายเหตุ/ที่มาของเกณฑ์</label><textarea class="textarea" id="th-note" maxlength="500">${esc(t.note ?? '')}</textarea></div>
      <button class="btn btn-primary" type="submit">${icons.save}บันทึก</button></form>
      <p class="small muted mt-3 mb-0">เวอร์ชันความยินยอมปัจจุบัน: ${esc(s.consent_version?.value ?? '1.0')} · โมเดลที่ใช้งาน: ${s.active_model ? `${esc(s.active_model.project)} v${esc(s.active_model.version)}` : 'ใช้ค่าจาก .env'}</p>`;
    qs('#th-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = Number(qs('#th-val').value);
      if (!(v >= 5 && v <= 99)) { toast('เกณฑ์ต้องอยู่ระหว่าง 5–99%', 'warning'); return; }
      const btn = qs('[type="submit"]', e.currentTarget);
      setBusy(btn, true);
      try {
        await api.put('/admin/settings', { ai_confidence_threshold: { value: v / 100, validated: qs('#th-valid').checked, note: qs('#th-note').value.trim() || undefined } });
        toast('บันทึกการตั้งค่าแล้ว (มีผลกับการวิเคราะห์ครั้งถัดไป)', 'success');
      } catch (err) { toast(err.message, 'error'); } finally { setBusy(btn, false); }
    });
  };
  qs('#h-refresh').addEventListener('click', loadHealth);
  loadHealth();
  loadSettings();
}
