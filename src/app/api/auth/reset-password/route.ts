import {
  authErrorResponse,
  authSql,
  hashPassword,
  normalizeEmail,
  requireCurrentUser,
} from '@/lib/server/auth';

export async function POST(request: Request) {
  let currentUser;
  try {
    currentUser = await requireCurrentUser(request);
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    throw error;
  }

  const body = await request.json();
  const email = normalizeEmail(String(body.email || ''));
  const newPassword = String(body.newPassword || '');

  if (!email || !newPassword || newPassword.length < 8) {
    return Response.json({ success: false, message: '邮箱和至少8位的新密码必填' }, { status: 400 });
  }

  if (currentUser.role !== 'admin' && normalizeEmail(currentUser.email) !== email) {
    return Response.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const { hash, salt } = hashPassword(newPassword);

  const result = await authSql`
    UPDATE app_users
    SET password_hash = ${hash}, password_salt = ${salt}, updated_at = NOW()
    WHERE email = ${email}
    RETURNING id
  `;

  if (result.length === 0) {
    return Response.json({ success: false, message: '该邮箱未注册' }, { status: 404 });
  }

  return Response.json({ success: true, message: '密码重置成功，请使用新密码登录' });
}
