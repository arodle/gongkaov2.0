import {
  authSql,
  createSession,
  createSessionCookie,
  ensureAuthTables,
  normalizeEmail,
  verifyPassword,
} from '@/lib/server/auth';

export async function POST(request: Request) {
  await ensureAuthTables();

  const body = await request.json();
  const email = normalizeEmail(String(body.email || ''));
  const password = String(body.password || '');

  const users = await authSql`
    SELECT id, email, name, role, password_hash, password_salt
    FROM app_users
    WHERE email = ${email}
    LIMIT 1
  `;
  const user = users[0];

  if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
    return Response.json({ success: false, message: '邮箱或密码错误' }, { status: 401 });
  }

  const session = await createSession(user.id);

  return Response.json(
    {
      success: true,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    },
    {
      headers: {
        'Set-Cookie': createSessionCookie(session.token, session.expiresAt),
      },
    },
  );
}
