import { sql } from '@/lib/db/neon-service';
import { authErrorResponse, getRequestUserId } from '@/lib/server/auth';

export async function GET(request: Request) {
  try {
    const userId = await getRequestUserId(request);
    const result = await sql`
      SELECT id, name FROM mind_map WHERE user_id = ${userId} ORDER BY name
    `;
    
    return new Response(JSON.stringify({
      success: true,
      mindMaps: result,
    }), { status: 200 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;

    return new Response(JSON.stringify({
      success: false,
      message: (error as Error).message,
    }), { status: 500 });
  }
}
