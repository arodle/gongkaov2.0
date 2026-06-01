import { sql } from '@/lib/db/neon-service';
import { authErrorResponse, getRequestUserId } from '@/lib/server/auth';

export async function GET(request: Request) {
  try {
    const userId = await getRequestUserId(request);

    const rootNodes = await sql`
      SELECT id, name, node_type, parent_id 
      FROM map_node 
      WHERE parent_id IS NULL AND user_id = ${userId}
      ORDER BY name
    `;

    const childCounts = await sql`
      SELECT parent_id, COUNT(*) as count 
      FROM map_node 
      WHERE parent_id IS NOT NULL AND user_id = ${userId}
      GROUP BY parent_id
    `;

    const countMap = new Map<string, number>();
    childCounts.forEach(c => countMap.set(c.parent_id, c.count));

    const result = rootNodes.map(node => ({
      id: node.id,
      name: node.name,
      type: node.node_type,
      childCount: countMap.get(node.id) || 0,
    }));

    return new Response(JSON.stringify({
      success: true,
      rootNodes: result,
      totalRoots: rootNodes.length,
    }), { status: 200 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;

    console.error('Failed to get structure:', error);
    return new Response(JSON.stringify({
      success: false,
      message: (error as Error).message,
    }), { status: 500 });
  }
}
