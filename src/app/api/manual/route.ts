import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, getRequestUserId } from '@/lib/server/auth';

const INTERNAL_MARKER = '# 内部问题清单：漏洞、bug 与产品风险';

export async function GET(request: NextRequest) {
  try {
    await getRequestUserId(request);
    const filePath = path.join(process.cwd(), 'docs', '平台用户手册.md');
    const raw = await readFile(filePath, 'utf8');
    const content = raw.split(INTERNAL_MARKER)[0]?.trim() || raw;

    return NextResponse.json({
      success: true,
      content,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    const authError = authErrorResponse(err);
    if (authError) return authError;

    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
