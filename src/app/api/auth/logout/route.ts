import { clearSessionCookie, deleteSession } from '@/lib/server/auth';

export async function POST(request: Request) {
  await deleteSession(request);

  return Response.json(
    { success: true },
    {
      headers: {
        'Set-Cookie': clearSessionCookie(),
      },
    },
  );
}
