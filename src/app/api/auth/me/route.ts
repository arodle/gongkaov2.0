import { getCurrentUser } from '@/lib/server/auth';

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  return Response.json({ success: true, user });
}
