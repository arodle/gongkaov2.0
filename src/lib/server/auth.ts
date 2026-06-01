import 'dotenv/config';
import { createHash, randomBytes, pbkdf2Sync, timingSafeEqual } from 'crypto';
import { neon } from '@neondatabase/serverless';

export const DEFAULT_USER_ID = 'default_user';
export const SESSION_COOKIE = 'gongkao_session';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: 'admin' | 'operator' | 'user';
}

export class ApiAuthError extends Error {
  status: 401 | 403;

  constructor(message: string, status: 401 | 403 = 401) {
    super(message);
    this.name = 'ApiAuthError';
    this.status = status;
  }
}

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const sql = neon(databaseUrl);

export async function ensureAuthTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)`;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const hash = pbkdf2Sync(password, salt, 210_000, 32, 'sha256').toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, salt: string, expectedHash: string) {
  const actualHash = hashPassword(password, salt).hash;
  const actual = Buffer.from(actualHash, 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function parseCookie(request?: Request, name = SESSION_COOKIE) {
  const cookieHeader = request?.headers.get('cookie') || '';
  const cookies = cookieHeader.split(';').map(item => item.trim());
  const match = cookies.find(item => item.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function createSessionCookie(token: string, expiresAt: Date) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure}`;
}

export function clearSessionCookie() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const sessionId = `sess_${Date.now()}_${randomBytes(8).toString('hex')}`;
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

  await sql`
    INSERT INTO user_sessions (id, user_id, token_hash, expires_at)
    VALUES (${sessionId}, ${userId}, ${tokenHash}, ${expiresAt.toISOString()})
  `;

  return { token, expiresAt };
}

export async function getCurrentUser(request?: Request): Promise<AuthUser | null> {
  await ensureAuthTables();

  const token = parseCookie(request);
  if (!token) return null;

  const tokenHash = hashToken(token);
  const rows = await sql`
    SELECT u.id, u.email, u.name, u.role
    FROM user_sessions s
    INNER JOIN app_users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash}
      AND s.expires_at > NOW()
    LIMIT 1
  `;

  const user = rows[0];
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

export async function getRequestUserId(request?: Request): Promise<string> {
  const user = await requireCurrentUser(request);
  return user.id;
}

export async function requireCurrentUser(request?: Request): Promise<AuthUser> {
  const user = await getCurrentUser(request);
  if (!user) {
    throw new ApiAuthError('Unauthorized', 401);
  }
  return user;
}

export async function requireAdmin(request?: Request): Promise<AuthUser> {
  const user = await requireCurrentUser(request);
  if (user.role !== 'admin') {
    throw new ApiAuthError('Admin access required', 403);
  }
  return user;
}

export function authErrorResponse(error: unknown): Response | null {
  if (!(error instanceof ApiAuthError)) return null;
  return Response.json({ success: false, message: error.message }, { status: error.status });
}

export async function deleteSession(request?: Request) {
  const token = parseCookie(request);
  if (!token) return;

  await ensureAuthTables();
  await sql`DELETE FROM user_sessions WHERE token_hash = ${hashToken(token)}`;
}

export { sql as authSql };
