import { authErrorResponse, requireAdmin } from '@/lib/server/auth';

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    return Response.json(
      { success: false, message: 'This legacy seed endpoint is disabled.' },
      { status: 410 },
    );
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;

    return Response.json({ success: false, message: 'Request failed' }, { status: 500 });
  }
}
