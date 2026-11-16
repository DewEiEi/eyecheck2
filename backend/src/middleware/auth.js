import { config } from '../config/env.js';
import { getServiceClient, createAnonClient, createUserClient } from '../config/supabase.js';
import { AppError, Errors } from '../utils/app-error.js';
import { calcAge } from '../utils/helpers.js';

export const COOKIES = Object.freeze({ access: 'ec_at', refresh: 'ec_rt', remember: 'ec_rm' });

function baseCookie() {
  return { httpOnly: true, secure: config.cookieSecure, sameSite: 'strict', path: '/' };
}

/**
 * Tokens live in httpOnly, SameSite=Strict cookies (not reachable by JS).
 * Without "remember me" they are session cookies (cleared when the browser closes).
 */
export function setSessionCookies(res, session, remember) {
  const opts = baseCookie();
  if (remember) opts.maxAge = config.rememberMeDays * 24 * 3600 * 1000;
  res.cookie(COOKIES.access, session.access_token, opts);
  res.cookie(COOKIES.refresh, session.refresh_token, opts);
  if (remember) res.cookie(COOKIES.remember, '1', opts);
  else res.clearCookie(COOKIES.remember, baseCookie());
}

export function clearSessionCookies(res) {
  for (const name of Object.values(COOKIES)) res.clearCookie(name, baseCookie());
}

function isNetworkError(error) {
  return error && (error.name === 'AuthRetryableFetchError' || error.status === 0 || /fetch failed/i.test(error.message || ''));
}

/**
 * Resolves the current user from cookies (optional). Refreshes an expired
 * access token transparently using the refresh token.
 */
export async function authenticate(req, res, next) {
  try {
    const at = req.cookies?.[COOKIES.access];
    const rt = req.cookies?.[COOKIES.refresh];
    if (!at && !rt) return next();

    const svc = getServiceClient();
    let token = at;
    let user = null;

    if (at) {
      const { data, error } = await svc.auth.getUser(at);
      if (isNetworkError(error)) throw Errors.unavailable('ไม่สามารถตรวจสอบการเข้าสู่ระบบได้ กรุณาลองใหม่');
      if (!error) user = data.user;
    }
    if (!user && rt) {
      const { data, error } = await createAnonClient().auth.refreshSession({ refresh_token: rt });
      if (isNetworkError(error)) throw Errors.unavailable('ไม่สามารถตรวจสอบการเข้าสู่ระบบได้ กรุณาลองใหม่');
      if (!error && data?.session) {
        token = data.session.access_token;
        user = data.user;
        setSessionCookies(res, data.session, req.cookies?.[COOKIES.remember] === '1');
      }
    }
    if (!user) {
      clearSessionCookies(res);
      return next();
    }

    const { data: profile, error: pErr } = await svc.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (pErr) throw Errors.unavailable();
    if (!profile) {
      clearSessionCookies(res);
      return next();
    }
    profile.age = calcAge(profile.birth_date);

    let db = null;
    req.auth = {
      userId: user.id,
      token,
      profile,
      isAdmin: profile.role === 'admin' && profile.status === 'active',
      // RLS-enforced client, created lazily
      get db() {
        if (!db) db = createUserClient(token);
        return db;
      },
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

export function requireAuth(req, res, next) {
  if (!req.auth) return next(Errors.unauthorized());
  if (req.auth.profile.status !== 'active') {
    clearSessionCookies(res);
    return next(new AppError(403, 'ACCOUNT_SUSPENDED', 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ'));
  }
  return next();
}

export function requireAdmin(req, res, next) {
  if (!req.auth) return next(Errors.unauthorized());
  if (!req.auth.isAdmin) return next(Errors.forbidden('เฉพาะผู้ดูแลระบบเท่านั้น'));
  return next();
}

export const requireAccountType = (...types) => (req, res, next) => {
  if (!req.auth) return next(Errors.unauthorized());
  if (!types.includes(req.auth.profile.account_type)) {
    return next(Errors.forbidden('ประเภทบัญชีของคุณไม่สามารถใช้งานฟังก์ชันนี้ได้'));
  }
  return next();
};
