import { icons } from './icons.js';
import { FINDINGS, RISK_LEVELS, AI_STATUS, DISEASES } from './constants.js';

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Escape any untrusted value before putting it into innerHTML. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const TZ = 'Asia/Bangkok';
export function formatDateTime(iso) {
  if (!iso) return '-';
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ }).format(new Date(iso));
}
export function formatDate(iso) {
  if (!iso) return '-';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00+07:00`) : new Date(iso);
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: TZ }).format(d);
}
export function todayISO() {
  return new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
}
export function daysAgoISO(n) {
  return new Date(Date.now() + 7 * 3600e3 - n * 864e5).toISOString().slice(0, 10);
}
export function calcAge(birth) {
  if (!birth) return null;
  const b = new Date(`${birth}T00:00:00`);
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a;
}
export const pct = (v) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '-');

// ---------- badges ----------
export function riskBadge(level) {
  if (!level) return '<span class="badge badge-muted">ยังไม่ประเมิน</span>';
  const r = RISK_LEVELS[level] ?? RISK_LEVELS.inconclusive;
  return `<span class="badge risk-${esc(level)}">${icons[r.icon] ?? ''}${esc(r.th)}</span>`;
}
export function findingLabel(key) {
  return FINDINGS[key]?.th ?? (key ? esc(key) : 'ยังไม่มีผล');
}
export function findingBadge(key) {
  if (!key) return '<span class="badge badge-muted">ยังไม่มีผล</span>';
  const isDisease = key in DISEASES;
  const cls = isDisease ? 'badge-warning' : key === 'inconclusive' ? 'badge-muted' : 'badge-success';
  return `<span class="badge ${cls}">${esc(FINDINGS[key]?.th ?? key)}</span>`;
}
export function aiStatusBadge(s) {
  const a = AI_STATUS[s] ?? AI_STATUS.pending;
  return `<span class="badge ${a.cls}">${esc(a.th)}</span>`;
}

// ---------- toast ----------
function toastRegion() {
  let r = qs('.toast-region');
  if (!r) {
    r = document.createElement('div');
    r.className = 'toast-region';
    r.setAttribute('role', 'status');
    r.setAttribute('aria-live', 'polite');
    document.body.append(r);
  }
  return r;
}
export function toast(message, type = 'info', ms = 4500) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = { success: icons.checkCircle, error: icons.xCircle, warning: icons.alert }[type] ?? icons.info;
  el.innerHTML = `${icon}<div></div>`;
  el.querySelector('div').textContent = message;
  toastRegion().append(el);
  setTimeout(() => el.remove(), ms);
}

// ---------- page states ----------
const STATE_ICONS = { empty: icons.clipboard, error: icons.xCircle, forbidden: icons.lock, offline: icons.wifiOff, notfound: icons.search, unauthorized: icons.lock };

export function errorMessage(err) {
  return err?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่';
}

export function stateFromError(err) {
  const map = { NO_INTERNET: 'offline', UNAUTHORIZED: 'unauthorized', FORBIDDEN: 'forbidden', NOT_FOUND: 'notfound', ACCOUNT_SUSPENDED: 'forbidden' };
  return map[err?.code] ?? (err?.status === 403 ? 'forbidden' : err?.status === 404 ? 'notfound' : 'error');
}

/**
 * Render a loading / empty / error state into `el`.
 * @param {HTMLElement} el
 * @param {{type:'loading'|'empty'|'error'|'forbidden'|'offline'|'notfound'|'unauthorized', title?:string, message?:string, retry?:Function, action?:{href:string,label:string}}} o
 */
export function renderState(el, { type, title, message, retry, action }) {
  if (type === 'loading') {
    el.innerHTML = `<div class="state" aria-busy="true"><div class="spinner" aria-hidden="true"></div><p>${esc(message ?? 'กำลังโหลดข้อมูล...')}</p></div>`;
    return;
  }
  const titles = { empty: 'ยังไม่มีข้อมูล', error: 'เกิดข้อผิดพลาด', forbidden: 'ไม่มีสิทธิ์เข้าถึง (Permission Denied)', offline: 'ไม่มีการเชื่อมต่ออินเทอร์เน็ต', notfound: 'ไม่พบข้อมูล', unauthorized: 'กรุณาเข้าสู่ระบบ' };
  el.innerHTML = `<div class="state" role="${type === 'empty' ? 'status' : 'alert'}">
    ${STATE_ICONS[type] ?? icons.info}
    <h3>${esc(title ?? titles[type] ?? '')}</h3>
    ${message ? `<p>${esc(message)}</p>` : ''}
    <div class="row" style="justify-content:center">
      ${retry ? `<button type="button" class="btn btn-primary" data-retry>${icons.refresh}ลองใหม่</button>` : ''}
      ${type === 'unauthorized' ? `<a class="btn btn-primary" href="/pages/login.html?next=${encodeURIComponent(location.pathname + location.search)}">เข้าสู่ระบบ</a>` : ''}
      ${action ? `<a class="btn" href="${esc(action.href)}">${esc(action.label)}</a>` : ''}
    </div>
  </div>`;
  if (retry) qs('[data-retry]', el).addEventListener('click', retry);
}

export function renderErrorState(el, err, retry) {
  renderState(el, { type: stateFromError(err), message: errorMessage(err), retry });
}

// ---------- forms ----------
export function setBusy(btn, busy) {
  if (!btn) return;
  btn.classList.toggle('is-busy', busy);
  btn.disabled = busy;
  btn.setAttribute('aria-busy', String(busy));
}

export function clearFieldErrors(form) {
  qsa('[aria-invalid="true"]', form).forEach((el) => el.removeAttribute('aria-invalid'));
  qsa('.field-error', form).forEach((el) => { el.textContent = ''; });
}

/** Show server validation details ({field, message}) next to inputs. */
export function showFieldErrors(form, details = []) {
  let first = null;
  for (const d of details) {
    const name = d.field?.split('.')[0];
    const input = name ? form.querySelector(`[name="${CSS.escape(name)}"]`) : null;
    const slot = name ? form.querySelector(`[data-error-for="${CSS.escape(name)}"]`) : null;
    if (input) { input.setAttribute('aria-invalid', 'true'); first ??= input; }
    if (slot) slot.textContent = d.message;
  }
  first?.focus();
}

export function formToObject(form) {
  const fd = new FormData(form);
  const out = {};
  for (const [k, v] of fd.entries()) out[k] = typeof v === 'string' ? v.trim() : v;
  return out;
}

// ---------- pagination ----------
export function renderPagination(el, { page, totalPages, total }, onPage) {
  if (!el) return;
  if (!total) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <span class="muted small">ทั้งหมด ${total.toLocaleString('th-TH')} รายการ · หน้า ${page}/${totalPages}</span>
    <button type="button" class="btn btn-sm" data-p="${page - 1}" ${page <= 1 ? 'disabled' : ''}>ก่อนหน้า</button>
    <button type="button" class="btn btn-sm" data-p="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>ถัดไป</button>`;
  el.onclick = (e) => {
    const b = e.target.closest('[data-p]');
    if (b && !b.disabled) onPage(Number(b.dataset.p));
  };
}

export function debounce(fn, ms = 350) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function param(name) {
  return new URLSearchParams(location.search).get(name);
}
