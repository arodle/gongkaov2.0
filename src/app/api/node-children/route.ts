import { authErrorResponse, requireAdmin } from '@/lib/server/auth';

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    return Response.json(
      { success: false, message: 'This legacy debug endpoint is disabled.' },
      { status: 410 },
    );
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;

    return Response.json({ success: false, message: 'Request failed' }, { status: 500 });
  }
}
