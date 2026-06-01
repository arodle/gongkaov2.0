import {
  authSql,
  hashPassword,
  normalizeEmail,
} from '@/lib/server/auth';

export async function POST(request: Request) {
  const body = await request.json();
  const email = normalizeEmail(String(body.email || ''));
  const newPassword = String(body.newPassword || '');

  if (!email || !newPassword || newPassword.length < 8) {
    return Response.json({ success: false, message: '邮箱和至少8位的新密码必填' }, { status: 400 });
  }

  const { hash, salt } = hashPassword(newPassword);

  const result = await authSql`
    UPDATE app_users
    SET password_hash = ${hash}, password_salt = ${salt}, updated_at = NOW()
    WHERE email = ${email}
  `;

  if (result.count === 0) {
    return Response.json({ success: false, message: '该邮箱未注册' }, { status: 404 });
  }

  return Response.json({ success: true, message: '密码重置成功，请使用新密码登录' });
}
