import { authErrorResponse, requireAdmin } from '@/lib/server/auth';

function gone() {
  return Response.json(
    {
      success: false,
      message: '旧 knowledge_nodes 迁移入口已关闭；MindCanvas 现在使用 mind_map/map_node/map_edge。',
    },
    { status: 410 },
  );
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    return gone();
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return Response.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    return gone();
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return Response.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}
