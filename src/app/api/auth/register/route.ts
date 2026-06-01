import {
  authSql,
  createSession,
  createSessionCookie,
  ensureAuthTables,
  hashPassword,
  normalizeEmail,
} from '@/lib/server/auth';

const REGISTER_WINDOW_MS = 15 * 60 * 1000;
const REGISTER_MAX_ATTEMPTS = 5;
const registerAttempts = new Map<string, { count: number; resetAt: number }>();

function getClientKey(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'
  );
}

function checkRegisterRateLimit(request: Request) {
  const key = getClientKey(request);
  const now = Date.now();
  const record = registerAttempts.get(key);

  if (!record || record.resetAt <= now) {
    registerAttempts.set(key, { count: 1, resetAt: now + REGISTER_WINDOW_MS });
    return null;
  }

  if (record.count >= REGISTER_MAX_ATTEMPTS) {
    const retryAfter = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    return Response.json(
      { success: false, message: '注册尝试过多，请稍后再试' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  record.count += 1;
  return null;
}

export async function POST(request: Request) {
  await ensureAuthTables();

  const rateLimitError = checkRegisterRateLimit(request);
  if (rateLimitError) return rateLimitError;

  const body = await request.json();
  const email = normalizeEmail(String(body.email || ''));
  const password = String(body.password || '');
  const name = String(body.name || '').trim() || null;
  const inviteCode = String(body.inviteCode || '').trim();

  if (!email || !password || password.length < 8) {
    return Response.json({ success: false, message: '邮箱和至少 8 位密码必填' }, { status: 400 });
  }

  const existing = await authSql`SELECT id FROM app_users WHERE email = ${email} LIMIT 1`;
  if (existing.length > 0) {
    return Response.json({ success: false, message: '该邮箱已注册' }, { status: 409 });
  }

  const [{ count }] = await authSql`SELECT COUNT(*)::int AS count FROM app_users`;
  const isFirstUser = Number(count) === 0;
  const inviteCodeRequired = process.env.NODE_ENV === 'production'
    && !isFirstUser
    && process.env.ALLOW_PUBLIC_REGISTRATION !== 'true';
  const expectedInviteCode = process.env.REGISTER_INVITE_CODE;

  if (inviteCodeRequired && (!expectedInviteCode || inviteCode !== expectedInviteCode)) {
    return Response.json(
      { success: false, message: '当前环境未开放公开注册，请使用邀请码' },
      { status: 403 },
    );
  }

  const role = isFirstUser ? 'admin' : 'user';
  const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const { hash, salt } = hashPassword(password);

  await authSql`
    INSERT INTO app_users (id, email, name, password_hash, password_salt, role, updated_at)
    VALUES (${userId}, ${email}, ${name}, ${hash}, ${salt}, ${role}, NOW())
  `;

  if (role === 'admin') {
    await authSql`UPDATE question_bank SET user_id = ${userId} WHERE user_id IN ('default_user', 'user_me')`;
    await authSql`UPDATE answer_records SET user_id = ${userId} WHERE user_id IN ('default_user', 'user_me')`;
    await authSql`UPDATE practice_sets SET user_id = ${userId} WHERE user_id IN ('default_user', 'user_me')`;
    await authSql`UPDATE mind_map SET user_id = ${userId} WHERE user_id IN ('default_user', 'user_me')`;
    await authSql`UPDATE map_node SET user_id = ${userId} WHERE user_id IN ('default_user', 'user_me')`;
    await authSql`UPDATE map_edge SET user_id = ${userId} WHERE user_id IN ('default_user', 'user_me')`;
  }

  const session = await createSession(userId);

  return Response.json(
    {
      success: true,
      user: { id: userId, email, name, role },
    },
    {
      headers: {
        'Set-Cookie': createSessionCookie(session.token, session.expiresAt),
      },
    },
  );
}
