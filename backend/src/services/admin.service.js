import { getServiceClient } from '../config/supabase.js';
import { AppError, Errors, unwrap } from '../utils/app-error.js';
import { sanitizeSearch, pageRange, paged, dateRange, bangkokDay, generateRegistrationCode, hashRegistrationCode, hmac } from '../utils/helpers.js';
import { logActivity } from './activity.service.js';
import { publicProfile } from './profile.service.js';
import { applyFilters, buildResult } from './screening.service.js';
import { adminDashboard } from './dashboard.service.js';
import { getAllSettings, setSetting } from './settings.service.js';
import { checkStorage } from './storage.service.js';
import { getStatus as roboflowStatus } from '../roboflow/roboflow.service.js';

const svc = () => getServiceClient();

// ---------------- statistics & website activity ----------------
async function fetchActivity(actions, range, columns = 'action, user_id, details, created_at') {
  const out = [];
  for (let from = 0; from < 50000; from += 1000) {
    const rows = unwrap(await svc().from('activity_logs').select(columns)
      .in('action', actions).gte('created_at', range.from).lte('created_at', range.to)
      .order('created_at', { ascending: true }).range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

function defaultRange(q) {
  const to = q.to ?? bangkokDay(new Date().toISOString());
  const from = q.from ?? new Date(new Date(`${to}T00:00:00Z`).getTime() - 13 * 864e5).toISOString().slice(0, 10);
  return { from, to };
}

export async function statistics(q) {
  const { from, to } = defaultRange(q);
  const range = dateRange(from, to);
  const events = await fetchActivity(['page_view', 'page_leave', 'register', 'login', 'screening_analyzed'], range);

  const days = new Map();
  for (let d = new Date(`${from}T00:00:00Z`), i = 0; d <= new Date(`${to}T00:00:00Z`) && i < 366; d.setUTCDate(d.getUTCDate() + 1), i++) {
    const k = d.toISOString().slice(0, 10);
    days.set(k, { date: k, visitors: new Set(), page_views: 0, leaves: 0, registrations: 0, logins: new Set(), scans: 0 });
  }
  for (const e of events) {
    const day = days.get(bangkokDay(e.created_at));
    if (!day) continue;
    if (e.action === 'page_view') { day.page_views++; if (e.details?.v) day.visitors.add(e.details.v); }
    else if (e.action === 'page_leave') day.leaves++;
    else if (e.action === 'register') day.registrations++;
    else if (e.action === 'login' && e.user_id) day.logins.add(e.user_id);
    else if (e.action === 'screening_analyzed') day.scans++;
  }
  const daily = [...days.values()].map((d) => ({
    date: d.date, visitors: d.visitors.size, page_views: d.page_views, leaves: d.leaves,
    registrations: d.registrations, active_logins: d.logins.size, scans: d.scans,
  }));

  const today = bangkokDay(new Date().toISOString());
  const todayRange = dateRange(today, today);
  const { count: scansToday } = await svc().from('screenings').select('id', { count: 'exact', head: true })
    .gte('screening_date', todayRange.from).lte('screening_date', todayRange.to);
  const { count: members } = await svc().from('profiles').select('id', { count: 'exact', head: true });
  const { count: personal } = await svc().from('profiles').select('id', { count: 'exact', head: true }).eq('account_type', 'personal');
  const { count: staff } = await svc().from('profiles').select('id', { count: 'exact', head: true }).eq('account_type', 'staff');
  const { count: regsInRange } = await svc().from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', range.from).lte('created_at', range.to);
  const todayRow = daily.find((d) => d.date === today);

  const screening = await adminDashboard({ from, to, count_by: 'screening' });

  return {
    range: { from, to },
    members: { total: members ?? 0, personal: personal ?? 0, staff: staff ?? 0, registrations_in_range: regsInRange ?? 0 },
    today: {
      date: today,
      scans: scansToday ?? 0,
      visitors: todayRow?.visitors ?? 0,
      registrations: todayRow?.registrations ?? 0,
      active_logins: todayRow?.active_logins ?? 0,
      leaves: todayRow?.leaves ?? 0,
    },
    daily,
    screening,
    notes: {
      visitors: 'นับผู้เข้าชมจากรหัสอุปกรณ์แบบสุ่มที่แฮชแล้ว (ไม่ระบุตัวตน) ต่อวัน',
      leaves: 'นับจากเหตุการณ์ออกจากหน้าเว็บที่เบราว์เซอร์ส่งมา (อาจต่ำกว่าความจริงหากเบราว์เซอร์ปิดกะทันหัน)',
    },
  };
}

export async function trackEvent(visitorId, event, path, userId) {
  // Only a keyed hash of a random device id is stored — no IP, no user agent.
  await logActivity(userId ?? null, event, { v: hmac(`visitor:${visitorId}`).slice(0, 24), path });
}

export async function listActivity(q) {
  const r = pageRange(q.page, q.pageSize);
  let query = svc().from('activity_logs').select('id, user_id, action, details, created_at, profiles(username, account_type)', { count: 'exact' });
  const range = dateRange(q.from, q.to);
  if (range.from) query = query.gte('created_at', range.from);
  if (range.to) query = query.lte('created_at', range.to);
  if (q.action) query = query.eq('action', q.action);
  else query = query.not('action', 'in', '(page_view,page_leave)');
  const term = sanitizeSearch(q.search);
  if (term) {
    const users = unwrap(await svc().from('profiles').select('id').ilike('username', `%${term}%`).limit(100));
    query = query.in('user_id', users.length ? users.map((u) => u.id) : ['00000000-0000-0000-0000-000000000000']);
  }
  const { data, count, error } = await query.order('created_at', { ascending: false }).range(r.from, r.to);
  if (error) unwrap({ error });
  return paged(data, count, r);
}

// ---------------- users ----------------
export async function listUsers(q) {
  const r = pageRange(q.page, q.pageSize);
  let query = svc().from('profiles').select('*', { count: 'exact' });
  if (q.account_type) query = query.eq('account_type', q.account_type);
  if (q.role) query = query.eq('role', q.role);
  if (q.status) query = query.eq('status', q.status);
  const term = sanitizeSearch(q.search);
  if (term) query = query.or(`username.ilike.%${term}%,full_name.ilike.%${term}%,workplace.ilike.%${term}%`);
  const { data, count, error } = await query.order('created_at', { ascending: false }).range(r.from, r.to);
  if (error) unwrap({ error });
  return paged((data ?? []).map(publicProfile), count, r);
}

export async function getUser(id) {
  const p = unwrap(await svc().from('profiles').select('*').eq('id', id).maybeSingle());
  if (!p) throw Errors.notFound('ไม่พบสมาชิก');
  const [scr, pts, act] = await Promise.all([
    svc().from('screenings').select('id', { count: 'exact', head: true }).eq('user_id', id),
    svc().from('patients').select('id', { count: 'exact', head: true }).eq('owner_id', id),
    svc().from('activity_logs').select('action, details, created_at').eq('user_id', id).not('action', 'in', '(page_view,page_leave)').order('created_at', { ascending: false }).limit(30),
  ]);
  return {
    ...publicProfile(p),
    screenings_count: scr.count ?? 0,
    patients_count: pts.count ?? 0,
    recent_activity: unwrap(act),
  };
}

export async function setUserStatus(admin, id, status, reason) {
  if (id === admin.userId) throw new AppError(409, 'SELF_ACTION', 'ไม่สามารถระงับบัญชีของตนเองได้');
  const target = unwrap(await svc().from('profiles').select('id, role').eq('id', id).maybeSingle());
  if (!target) throw Errors.notFound('ไม่พบสมาชิก');
  // Ban in Supabase Auth too, so existing refresh tokens stop working
  const { error } = await svc().auth.admin.updateUserById(id, { ban_duration: status === 'suspended' ? '876000h' : 'none' });
  if (error) throw new AppError(503, 'AUTH_UNAVAILABLE', 'ไม่สามารถเปลี่ยนสถานะบัญชีในระบบยืนยันตัวตนได้');
  const row = unwrap(await svc().from('profiles').update({ status }).eq('id', id).select('*').single());
  await logActivity(admin.userId, status === 'suspended' ? 'admin_user_suspended' : 'admin_user_activated', { target: id, reason: reason ?? null });
  return publicProfile(row);
}

export async function setUserRole(admin, id, role) {
  if (id === admin.userId) throw new AppError(409, 'SELF_ACTION', 'ไม่สามารถเปลี่ยนสิทธิ์ของตนเองได้');
  const row = unwrap(await svc().from('profiles').update({ role }).eq('id', id).select('*').maybeSingle());
  if (!row) throw Errors.notFound('ไม่พบสมาชิก');
  await logActivity(admin.userId, 'admin_role_changed', { target: id, role });
  return publicProfile(row);
}

// ---------------- screenings ----------------
export async function listAllScreenings(q) {
  const r = pageRange(q.page, q.pageSize);
  let query = svc().from('screenings')
    .select('id, screening_code, screening_date, eye_side, primary_finding, risk_level, ai_status, is_saved, dataset_consent, user_id, patient_id, profiles(username, account_type)', { count: 'exact' });
  query = applyFilters(query, q);
  const term = sanitizeSearch(q.search);
  if (term) query = query.ilike('screening_code', `%${term}%`);
  const { data, count, error } = await query.order(q.sort ?? 'screening_date', { ascending: q.order === 'asc', nullsFirst: false }).range(r.from, r.to);
  if (error) unwrap({ error });
  return paged(data, count, r);
}

export async function getScreeningForAdmin(admin, id) {
  const s = unwrap(await svc().from('screenings').select('*').eq('id', id).maybeSingle());
  if (!s) throw Errors.notFound('ไม่พบข้อมูลการตรวจ');
  await logActivity(admin.userId, 'admin_viewed_screening', { screening_id: id });
  return buildResult(svc(), s, { admin: true });
}

// ---------------- staff registration codes ----------------
export async function listRegistrationCodes() {
  return unwrap(await svc().from('staff_registration_codes')
    .select('id, label, status, expires_at, usage_limit, usage_count, created_at').order('created_at', { ascending: false }).limit(200));
}

/** The plain code is returned exactly once; only its HMAC is stored. */
export async function createRegistrationCode(admin, { label, usage_limit, expires_at }) {
  const code = generateRegistrationCode();
  const row = unwrap(await svc().from('staff_registration_codes').insert({
    code_hash: hashRegistrationCode(code),
    label: label || null,
    usage_limit: usage_limit ?? null,
    expires_at: expires_at ? new Date(`${expires_at}T23:59:59+07:00`).toISOString() : null,
    created_by: admin.userId,
  }).select('id, label, status, expires_at, usage_limit, usage_count, created_at').single());
  await logActivity(admin.userId, 'admin_reg_code_created', { code_id: row.id });
  return { ...row, code };
}

export async function updateRegistrationCode(admin, id, { status }) {
  const row = unwrap(await svc().from('staff_registration_codes').update({ status }).eq('id', id).select('id, label, status, expires_at, usage_limit, usage_count, created_at').maybeSingle());
  if (!row) throw Errors.notFound('ไม่พบโค้ด');
  await logActivity(admin.userId, 'admin_reg_code_updated', { code_id: id, status });
  return row;
}

// ---------------- settings & system health ----------------
export async function getSettings() {
  return getAllSettings({ fresh: true });
}

export async function updateSettings(admin, input) {
  for (const [k, v] of Object.entries(input)) await setSetting(k, v, admin.userId);
  await logActivity(admin.userId, 'admin_settings_updated', { keys: Object.keys(input) });
  return getAllSettings({ fresh: true });
}

export async function systemHealth() {
  const started = Date.now();
  const db = await svc().from('admin_settings').select('id', { head: true, count: 'exact' });
  const dbMs = Date.now() - started;
  const [storage, ai] = await Promise.all([checkStorage().catch((e) => ({ ok: false, error: e.message })), roboflowStatus({ fresh: true })]);
  return {
    database: { ok: !db.error, latency_ms: dbMs, error: db.error ? 'เชื่อมต่อฐานข้อมูลไม่ได้' : null },
    storage,
    ai,
    server: { uptime_s: Math.round(process.uptime()), node: process.version, memory_mb: Math.round(process.memoryUsage().rss / 1048576) },
    checked_at: new Date().toISOString(),
  };
}
