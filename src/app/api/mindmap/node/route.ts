import { sql } from '@/lib/db/neon-service';
import { authErrorResponse, getRequestUserId } from '@/lib/server/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { mind_map_id, parent_id, name, content, markdown, node_type, color_tag, pos_x, pos_y, width, height, expanded } = body;
    const userId = await getRequestUserId(request);

    if (!mind_map_id || !name) {
      return new Response(JSON.stringify({ success: false, message: 'mind_map_id and name are required' }), { status: 400 });
    }

    const mindMap = await sql`
      SELECT id FROM mind_map WHERE id = ${mind_map_id} AND user_id = ${userId} LIMIT 1
    `;
    if (mindMap.length === 0) {
      return new Response(JSON.stringify({ success: false, message: 'Mind map not found' }), { status: 404 });
    }

    if (parent_id) {
      const parent = await sql`
        SELECT id FROM map_node WHERE id = ${parent_id} AND mind_map_id = ${mind_map_id} AND user_id = ${userId} LIMIT 1
      `;
      if (parent.length === 0) {
        return new Response(JSON.stringify({ success: false, message: 'Parent node not found' }), { status: 404 });
      }
    }

    const nodeId = `mn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await sql`
      INSERT INTO map_node (
        id, mind_map_id, parent_id, name, content, markdown, node_type,
        color_tag, pos_x, pos_y, width, height, expanded, user_id, updated_at
      ) VALUES (
        ${nodeId},
        ${mind_map_id},
        ${parent_id || null},
        ${name},
        ${content || null},
        ${markdown || null},
        ${node_type || 'topic'},
        ${color_tag || '#3b82f6'},
        ${pos_x || 0},
        ${pos_y || 0},
        ${width || 120},
        ${height || 40},
        ${expanded !== undefined ? expanded : true},
        ${userId},
        NOW()
      )
    `;

    if (parent_id) {
      const edgeId = `me_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await sql`
        INSERT INTO map_edge (
          id, mind_map_id, source_node_id, target_node_id, edge_type, user_id
        ) VALUES (
          ${edgeId},
          ${mind_map_id},
          ${parent_id},
          ${nodeId},
          'parent',
          ${userId}
        )
      `;
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Node created successfully',
      id: nodeId,
    }), { status: 201 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;

    console.error('Failed to create node:', error);
    return new Response(JSON.stringify({ success: false, message: (error as Error).message }), { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, parent_id, name, content, markdown, node_type, color_tag, pos_x, pos_y, width, height, expanded } = body;
    const userId = await getRequestUserId(request);

    if (!id) {
      return new Response(JSON.stringify({ success: false, message: 'ID is required' }), { status: 400 });
    }

    const existingNode = await sql`
      SELECT mind_map_id FROM map_node WHERE id = ${id} AND user_id = ${userId} LIMIT 1
    `;
    if (existingNode.length === 0) {
      return new Response(JSON.stringify({ success: false, message: 'Node not found' }), { status: 404 });
    }

    if (parent_id) {
      const parent = await sql`
        SELECT id FROM map_node WHERE id = ${parent_id} AND mind_map_id = ${existingNode[0].mind_map_id} AND user_id = ${userId} LIMIT 1
      `;
      if (parent.length === 0) {
        return new Response(JSON.stringify({ success: false, message: 'Parent node not found' }), { status: 404 });
      }
    }

    await sql`
      UPDATE map_node
      SET parent_id = ${parent_id || null},
          name = ${name},
          content = ${content || null},
          markdown = ${markdown || null},
          node_type = ${node_type || 'topic'},
          color_tag = ${color_tag || '#3b82f6'},
          pos_x = ${pos_x || 0},
          pos_y = ${pos_y || 0},
          width = ${width || 120},
          height = ${height || 40},
          expanded = ${expanded !== undefined ? expanded : true},
          updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId}
    `;

    return new Response(JSON.stringify({
      success: true,
      message: 'Node updated successfully',
    }), { status: 200 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;

    console.error('Failed to update node:', error);
    return new Response(JSON.stringify({ success: false, message: (error as Error).message }), { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const userId = await getRequestUserId(request);

    if (!id) {
      return new Response(JSON.stringify({ success: false, message: 'ID is required' }), { status: 400 });
    }

    await sql`DELETE FROM map_node WHERE id = ${id} AND user_id = ${userId}`;
    return new Response(JSON.stringify({
      success: true,
      message: 'Node deleted successfully',
    }), { status: 200 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;

    console.error('Failed to delete node:', error);
    return new Response(JSON.stringify({ success: false, message: (error as Error).message }), { status: 500 });
  }
}
