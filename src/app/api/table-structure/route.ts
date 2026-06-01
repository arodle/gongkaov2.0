import { sql } from '@/lib/db/neon-service';
import { authErrorResponse, requireAdmin } from '@/lib/server/auth';

export async function GET(request: Request) {
  try {
    await requireAdmin(request);

    const result = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'map_node'
      ORDER BY ordinal_position
    `;

    return new Response(JSON.stringify({
      success: true,
      columns: result,
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
