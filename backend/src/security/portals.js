export const PORTALS = ['admin', 'teacher', 'student'];

export const PORTAL_COOKIES = {
  admin: 'edtech_admin_session',
  teacher: 'edtech_teacher_session',
  student: 'edtech_student_session',
};

export const LEGACY_SESSION_COOKIE = 'edtech_session';
const LEGACY_ADMIN_COOKIE = 'admin_session';

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  };
}

export function normalizePortal(value) {
  const portal = String(value ?? '').trim().toLowerCase();
  return PORTALS.includes(portal) ? portal : null;
}

export function readPortalHeader(req) {
  return normalizePortal(req.get?.('x-portal'));
}

export function portalFromOrigin(origin) {
  try {
    const url = new URL(origin);
    const port = url.port || (url.protocol === 'https:' ? '443' : '80');
    return { 5173: 'admin', 5174: 'teacher', 5175: 'student' }[port] ?? null;
  } catch {
    return null;
  }
}

export function resolveSessionToken(req) {
  const cookies = req.cookies ?? {};
  const headerPortal = readPortalHeader(req);
  if (headerPortal) {
    return { portal: headerPortal, token: cookies[PORTAL_COOKIES[headerPortal]] ?? null };
  }
  for (const portal of PORTALS) {
    const token = cookies[PORTAL_COOKIES[portal]];
    if (token) return { portal, token };
  }
  const legacy = cookies[LEGACY_SESSION_COOKIE] ?? cookies[LEGACY_ADMIN_COOKIE] ?? null;
  return { portal: null, token: legacy };
}

export function setPortalCookie(res, portal, token, expiresAt) {
  res.clearCookie(LEGACY_SESSION_COOKIE, cookieOptions());
  res.clearCookie(LEGACY_ADMIN_COOKIE, cookieOptions());
  res.cookie(PORTAL_COOKIES[portal], token, { ...cookieOptions(), expires: expiresAt });
}

export function clearPortalCookies(res, portal = null) {
  res.clearCookie(LEGACY_SESSION_COOKIE, cookieOptions());
  res.clearCookie(LEGACY_ADMIN_COOKIE, cookieOptions());
  for (const candidate of PORTALS) {
    if (!portal || candidate === portal) res.clearCookie(PORTAL_COOKIES[candidate], cookieOptions());
  }
}
