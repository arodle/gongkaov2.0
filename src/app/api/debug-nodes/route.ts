import { sql } from '@/lib/db/neon-service';
import { authErrorResponse, requireAdmin } from '@/lib/server/auth';

function cleanName(name: string): string {
  return name.replace(/^[\d.]+[\s、·]*/, '').trim();
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);

    const nodes = await sql`
      SELECT id, name, parent_id 
      FROM map_node 
      ORDER BY name
      LIMIT 30
    `;

    const result = nodes.map(node => ({
      original: node.name,
      cleaned: cleanName(node.name),
      parent_id: node.parent_id,
    }));

    return new Response(JSON.stringify({
      success: true,
      nodes: result,
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
