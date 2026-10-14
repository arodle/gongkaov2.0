import { sql } from '@/lib/db/neon-service';
import { authErrorResponse, getRequestUserId } from '@/lib/server/auth';

type NodeInput = Record<string, unknown>;
type EdgeInput = Record<string, unknown>;

function normalizeNodes(nodes: NodeInput[]) {
  return nodes.map((node) => ({
    id: typeof node.id === 'string' && node.id ? node.id : `mn_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    parent_id: typeof node.parent_id === 'string' && node.parent_id ? node.parent_id : null,
    name: typeof node.name === 'string' && node.name ? node.name : 'Unnamed Node',
    content: typeof node.content === 'string' ? node.content : null,
    markdown: typeof node.markdown === 'string' ? node.markdown : null,
    node_type: typeof node.node_type === 'string' && node.node_type ? node.node_type : 'topic',
    color_tag: typeof node.color_tag === 'string' && node.color_tag ? node.color_tag : '#3b82f6',
    pos_x: typeof node.pos_x === 'number' ? node.pos_x : 0,
    pos_y: typeof node.pos_y === 'number' ? node.pos_y : 0,
    width: typeof node.width === 'number' ? node.width : 120,
    height: typeof node.height === 'number' ? node.height : 40,
    expanded: typeof node.expanded === 'boolean' ? node.expanded : true,
    sort_order: typeof node.sort_order === 'number' ? node.sort_order : 0,
  }));
}

async function upsertMapNodes(mapId: string, userId: string, nodes: NodeInput[]) {
  if (nodes.length === 0) return;
  const payload = JSON.stringify(normalizeNodes(nodes));

  await sql`
    INSERT INTO map_node (
      id, mind_map_id, parent_id, name, content, markdown, node_type,
      color_tag, pos_x, pos_y, width, height, expanded, sort_order, user_id, updated_at
    )
    SELECT
      item.id, ${mapId}, item.parent_id, item.name, item.content, item.markdown, item.node_type,
      item.color_tag, item.pos_x, item.pos_y, item.width, item.height, item.expanded,
      item.sort_order, ${userId}, NOW()
    FROM jsonb_to_recordset(${payload}::jsonb) AS item(
      id TEXT,
      parent_id TEXT,
      name TEXT,
      content TEXT,
      markdown TEXT,
      node_type TEXT,
      color_tag TEXT,
      pos_x DOUBLE PRECISION,
      pos_y DOUBLE PRECISION,
      width DOUBLE PRECISION,
      height DOUBLE PRECISION,
      expanded BOOLEAN,
      sort_order INTEGER
    )
    ON CONFLICT (id) DO UPDATE SET
      parent_id = EXCLUDED.parent_id,
      name = EXCLUDED.name,
      content = EXCLUDED.content,
      markdown = EXCLUDED.markdown,
      node_type = EXCLUDED.node_type,
      color_tag = EXCLUDED.color_tag,
      pos_x = EXCLUDED.pos_x,
      pos_y = EXCLUDED.pos_y,
      width = EXCLUDED.width,
      height = EXCLUDED.height,
      expanded = EXCLUDED.expanded,
      sort_order = EXCLUDED.sort_order,
      updated_at = NOW()
    WHERE map_node.user_id = ${userId} AND map_node.mind_map_id = ${mapId}
  `;
}

async function upsertMapEdges(mapId: string, userId: string, edges: EdgeInput[]) {
  if (edges.length === 0) return;
  const payload = JSON.stringify(edges.map((edge) => ({
    id: typeof edge.id === 'string' && edge.id ? edge.id : `me_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    source_node_id: edge.source_node_id,
    target_node_id: edge.target_node_id,
    edge_type: typeof edge.edge_type === 'string' && edge.edge_type ? edge.edge_type : 'parent',
  })));

  await sql`
    INSERT INTO map_edge (
      id, mind_map_id, source_node_id, target_node_id, edge_type, user_id
    )
    SELECT
      item.id, ${mapId}, item.source_node_id, item.target_node_id, item.edge_type, ${userId}
    FROM jsonb_to_recordset(${payload}::jsonb) AS item(
      id TEXT,
      source_node_id TEXT,
      target_node_id TEXT,
      edge_type TEXT
    )
    ON CONFLICT (id) DO UPDATE SET
      source_node_id = EXCLUDED.source_node_id,
      target_node_id = EXCLUDED.target_node_id,
      edge_type = EXCLUDED.edge_type
    WHERE map_edge.user_id = ${userId} AND map_edge.mind_map_id = ${mapId}
  `;
}

export async function GET(request: Request) {
  try {
    const userId = await getRequestUserId(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const category = searchParams.get('category');

    if (id) {
      const mindMap = await sql`
        SELECT * FROM mind_map WHERE id = ${id} AND user_id = ${userId}
      `;
      if (mindMap.length === 0) {
        return new Response(JSON.stringify({ success: false, message: 'Mind map not found' }), { status: 404 });
      }
      
      const nodes = await sql`
        SELECT * FROM map_node WHERE mind_map_id = ${id} AND user_id = ${userId} ORDER BY pos_y, pos_x
      `;
      
      const edges = await sql`
        SELECT * FROM map_edge WHERE mind_map_id = ${id} AND user_id = ${userId}
      `;

      return new Response(JSON.stringify({
        success: true,
        data: {
          mindMap: mindMap[0],
          nodes,
          edges,
        },
      }), { status: 200 });
    } else if (category) {
      const mindMaps = await sql`
        SELECT * FROM mind_map WHERE category = ${category} AND user_id = ${userId} ORDER BY updated_at DESC
      `;
      return new Response(JSON.stringify({ success: true, data: mindMaps }), { status: 200 });
    } else {
      const mindMaps = await sql`
        SELECT * FROM mind_map WHERE user_id = ${userId} ORDER BY updated_at DESC
      `;
      return new Response(JSON.stringify({ success: true, data: mindMaps }), { status: 200 });
    }
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;

    console.error('Failed to fetch mind maps:', error);
    return new Response(JSON.stringify({ success: false, message: (error as Error).message }), { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getRequestUserId(request);
    const body = await request.json();
    const { name, description, category, settings, nodes, edges } = body;

    if (!name) {
      return new Response(JSON.stringify({ success: false, message: 'Name is required' }), { status: 400 });
    }

    const mindMapId = `mm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await sql`
      INSERT INTO mind_map (id, user_id, name, description, category, settings, updated_at)
      VALUES (${mindMapId}, ${userId}, ${name}, ${description || null}, ${category || null}, ${JSON.stringify(settings || {})}, NOW())
    `;

    await upsertMapNodes(mindMapId, userId, Array.isArray(nodes) ? nodes : []);
    await upsertMapEdges(mindMapId, userId, Array.isArray(edges) ? edges : []);

    return new Response(JSON.stringify({
      success: true,
      message: 'Mind map created successfully',
      id: mindMapId,
    }), { status: 201 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;

    console.error('Failed to create mind map:', error);
    return new Response(JSON.stringify({ success: false, message: (error as Error).message }), { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await getRequestUserId(request);
    const body = await request.json();
    const { id, name, description, category, settings, nodes, edges, deleteNodeIds, deleteEdgeIds } = body;

    if (!id) {
      return new Response(JSON.stringify({ success: false, message: 'ID is required' }), { status: 400 });
    }

    const existingMap = await sql`
      SELECT id FROM mind_map WHERE id = ${id} AND user_id = ${userId} LIMIT 1
    `;
    if (existingMap.length === 0) {
      return new Response(JSON.stringify({ success: false, message: 'Mind map not found' }), { status: 404 });
    }

    await sql`
      UPDATE mind_map
      SET name = COALESCE(${name || null}, name),
          description = CASE
            WHEN ${description === undefined} THEN description
            ELSE ${description || null}
          END,
          category = CASE
            WHEN ${category === undefined} THEN category
            ELSE ${category || null}
          END,
          settings = CASE
            WHEN ${settings === undefined} THEN settings
            ELSE ${JSON.stringify(settings || {})}::jsonb
          END,
          updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId}
    `;

    const explicitDeleteNodeIds = Array.isArray(deleteNodeIds)
      ? deleteNodeIds.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : [];
    const explicitDeleteEdgeIds = Array.isArray(deleteEdgeIds)
      ? deleteEdgeIds.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : [];

    if (explicitDeleteEdgeIds.length > 0) {
      await sql`
        DELETE FROM map_edge
        WHERE mind_map_id = ${id} AND user_id = ${userId} AND id = ANY(${explicitDeleteEdgeIds})
      `;
    }

    if (explicitDeleteNodeIds.length > 0) {
      await sql`
        DELETE FROM map_edge
        WHERE mind_map_id = ${id}
          AND user_id = ${userId}
          AND (source_node_id = ANY(${explicitDeleteNodeIds}) OR target_node_id = ANY(${explicitDeleteNodeIds}))
      `;
      await sql`
        DELETE FROM map_node
        WHERE mind_map_id = ${id} AND user_id = ${userId} AND id = ANY(${explicitDeleteNodeIds})
      `;
    }

    await upsertMapNodes(id, userId, Array.isArray(nodes) ? nodes : []);
    await upsertMapEdges(id, userId, Array.isArray(edges) ? edges : []);

    return new Response(JSON.stringify({
      success: true,
      message: 'Mind map updated successfully',
    }), { status: 200 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;

    console.error('Failed to update mind map:', error);
    return new Response(JSON.stringify({ success: false, message: (error as Error).message }), { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await getRequestUserId(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return new Response(JSON.stringify({ success: false, message: 'ID is required' }), { status: 400 });
    }

    await sql`DELETE FROM mind_map WHERE id = ${id} AND user_id = ${userId}`;
    return new Response(JSON.stringify({
      success: true,
      message: 'Mind map deleted successfully',
    }), { status: 200 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;

    console.error('Failed to delete mind map:', error);
    return new Response(JSON.stringify({ success: false, message: (error as Error).message }), { status: 500 });
  }
}
