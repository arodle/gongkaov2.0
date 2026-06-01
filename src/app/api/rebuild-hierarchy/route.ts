import { sql } from '@/lib/db/neon-service';
import { authErrorResponse, requireAdmin } from '@/lib/server/auth';

const SIMPLE_HIERARCHY: Record<string, string[]> = {
  '行测': ['言语理解与表达', '判断推理', '数量关系', '资料分析', '常识判断'],
  '言语理解与表达': ['片段阅读', '语句表达', '逻辑填空', '篇章阅读'],
  '片段阅读': ['中心理解题', '细节判断题', '标题填入题', '态度理解题', '词句理解题'],
};

function cleanName(name: string): string {
  return name.replace(/^[\d.]+[\s、·]*/, '').trim();
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const mapId = searchParams.get('mapId');
    const ownerUserId = searchParams.get('userId');
    const shouldApply = searchParams.get('apply') === 'true';
    const confirmToken = searchParams.get('confirm');

    if (!mapId) {
      return Response.json(
        { success: false, message: 'mapId is required for hierarchy rebuild' },
        { status: 400 },
      );
    }

    if (!ownerUserId) {
      return Response.json(
        { success: false, message: 'userId is required for hierarchy rebuild' },
        { status: 400 },
      );
    }

    if (shouldApply && confirmToken !== 'REBUILD_HIERARCHY') {
      return Response.json(
        { success: false, message: 'confirm=REBUILD_HIERARCHY is required when apply=true' },
        { status: 400 },
      );
    }

    const nodes = await sql`
          SELECT id, name, parent_id
          FROM map_node
          WHERE mind_map_id = ${mapId} AND user_id = ${ownerUserId}
          ORDER BY name
        `;

    const cleanedNameToIds = new Map<string, string[]>();
    nodes.forEach(node => {
      const cleaned = cleanName(node.name);
      if (!cleanedNameToIds.has(cleaned)) {
        cleanedNameToIds.set(cleaned, []);
      }
      cleanedNameToIds.get(cleaned)!.push(node.id);
    });

    const allRequiredNames = new Set<string>();
    for (const [parent, children] of Object.entries(SIMPLE_HIERARCHY)) {
      allRequiredNames.add(parent);
      children.forEach(c => allRequiredNames.add(c));
    }

    const nodeNamesToKeep = new Set<string>();
    cleanedNameToIds.forEach((ids, name) => {
      if (allRequiredNames.has(name)) {
        nodeNamesToKeep.add(name);
      }
    });

    const idsToDelete: string[] = [];
    nodes.forEach(node => {
      const cleaned = cleanName(node.name);
      if (!nodeNamesToKeep.has(cleaned)) {
        idsToDelete.push(node.id);
      }
    });

    if (shouldApply && idsToDelete.length > 0) {
      for (const id of idsToDelete) {
        await sql`DELETE FROM map_node WHERE id = ${id} AND mind_map_id = ${mapId} AND user_id = ${ownerUserId}`;
      }
      console.log(`Deleted ${idsToDelete.length} nodes`);
    }

    const remainingNodes = shouldApply
      ? await sql`
          SELECT id, name, parent_id
          FROM map_node
          WHERE mind_map_id = ${mapId} AND user_id = ${ownerUserId}
          ORDER BY name
        `
      : nodes.filter(node => !idsToDelete.includes(node.id));

    const remainingNameToId = new Map<string, string>();
    remainingNodes.forEach(node => {
      const cleaned = cleanName(node.name);
      if (!remainingNameToId.has(cleaned)) {
        remainingNameToId.set(cleaned, node.id);
      }
    });

    let updateCount = 0;
    for (const [parentName, children] of Object.entries(SIMPLE_HIERARCHY)) {
      const parentId = remainingNameToId.get(parentName);
      if (!parentId) continue;

      for (const childName of children) {
        const childId = remainingNameToId.get(childName);
        if (!childId) continue;

        if (shouldApply) {
          await sql`
          UPDATE map_node 
          SET parent_id = ${parentId} 
          WHERE id = ${childId} AND mind_map_id = ${mapId} AND user_id = ${ownerUserId}
        `;
        }
        updateCount++;
      }
    }

    if (shouldApply) {
      await sql`
        UPDATE map_node
        SET parent_id = NULL
        WHERE name = '行测' AND mind_map_id = ${mapId} AND user_id = ${ownerUserId}
      `;
    }

    return new Response(JSON.stringify({
      success: true,
      dryRun: !shouldApply,
      deletedCount: idsToDelete.length,
      updatedCount: updateCount,
      remainingNodes: remainingNodes.length,
      keptNames: Array.from(nodeNamesToKeep),
    }), { status: 200 });

  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;

    console.error('Failed to rebuild hierarchy:', error);
    return new Response(JSON.stringify({
      success: false,
      message: (error as Error).message,
    }), { status: 500 });
  }
}
