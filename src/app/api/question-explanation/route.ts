import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, getRequestUserId } from '@/lib/server/auth';
import {
  buildQuestionExplanationPrompt,
  normalizeGeneratedExplanation,
} from '@/lib/question-explanation';
import type { PaperParserProvider } from '@/lib/paper-parser';

const PROVIDER_DEFAULTS: Record<Exclude<PaperParserProvider, 'rule'>, { baseUrl: string; model: string; envKey: string }> = {
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', envKey: 'OPENAI_API_KEY' },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', envKey: 'DEEPSEEK_API_KEY' },
  qwen: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', envKey: 'DASHSCOPE_API_KEY' },
  'openai-compatible': { baseUrl: '', model: '', envKey: 'PAPER_PARSER_API_KEY' },
};

export async function POST(request: NextRequest) {
  try {
    await getRequestUserId(request);
    const body = await request.json();
    const provider = normalizeProvider(body.provider);

    if (provider === 'rule') {
      return NextResponse.json({ success: false, message: 'AI 生成解析需要选择模型供应商。' }, { status: 400 });
    }

    const defaults = PROVIDER_DEFAULTS[provider];
    const apiKey = typeof body.apiKey === 'string' && body.apiKey.trim()
      ? body.apiKey.trim()
      : process.env[defaults.envKey];
    const baseUrl = (typeof body.baseUrl === 'string' && body.baseUrl.trim()) || defaults.baseUrl;
    const model = (typeof body.model === 'string' && body.model.trim()) || defaults.model;

    if (!apiKey) {
      return NextResponse.json({ success: false, message: `未配置 ${provider} API Key。` }, { status: 400 });
    }
    if (!baseUrl || !model) {
      return NextResponse.json({ success: false, message: '请配置 Base URL 和模型名称。' }, { status: 400 });
    }

    const prompt = buildQuestionExplanationPrompt({
      content: String(body.content || ''),
      options: Array.isArray(body.options) ? body.options : [],
      correctAnswer: String(body.correctAnswer || ''),
      knowledgePath: String(body.knowledgePath || ''),
      provider,
      model,
      baseUrl,
    });

    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.15,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: '你只输出严格 JSON。' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      return NextResponse.json({ success: false, message: message.slice(0, 500) || '解析生成失败' }, { status: 502 });
    }

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;
    const parsed = typeof content === 'string' ? JSON.parse(content) : content;

    return NextResponse.json({ success: true, data: normalizeGeneratedExplanation(parsed) });
  } catch (err) {
    const authError = authErrorResponse(err);
    if (authError) return authError;
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

function normalizeProvider(provider: unknown): Exclude<PaperParserProvider, 'rule'> | 'rule' {
  if (provider === 'openai' || provider === 'deepseek' || provider === 'qwen' || provider === 'openai-compatible') return provider;
  return 'rule';
}
