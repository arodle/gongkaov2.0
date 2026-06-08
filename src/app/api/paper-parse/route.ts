import { NextRequest, NextResponse } from 'next/server';
import {
  buildPaperParserPrompt,
  normalizeParsedPaper,
  parsePaperByRules,
  type PaperParserProvider,
} from '@/lib/paper-parser';
import { authErrorResponse, getRequestUserId } from '@/lib/server/auth';

const PROVIDER_DEFAULTS: Record<Exclude<PaperParserProvider, 'rule'>, { baseUrl: string; model: string; envKey: string }> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini',
    envKey: 'OPENAI_API_KEY',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    envKey: 'DEEPSEEK_API_KEY',
  },
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    envKey: 'DASHSCOPE_API_KEY',
  },
  'openai-compatible': {
    baseUrl: '',
    model: '',
    envKey: 'PAPER_PARSER_API_KEY',
  },
};

export async function POST(request: NextRequest) {
  try {
    await getRequestUserId(request);
    const body = await request.json();
    const rawText = typeof body.rawText === 'string' ? body.rawText.trim() : '';
    const provider = normalizeProvider(body.provider);

    if (!rawText) {
      return NextResponse.json({ success: false, message: '缺少原始试卷文本' }, { status: 400 });
    }

    const input = {
      rawText,
      paperName: typeof body.paperName === 'string' ? body.paperName : '',
      paperType: body.paperType === 'simulated' ? 'simulated' as const : 'real' as const,
      provider,
      model: typeof body.model === 'string' ? body.model : '',
      baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : '',
    };

    if (provider === 'rule') {
      return NextResponse.json({ success: true, data: parsePaperByRules(input) });
    }

    const providerDefaults = PROVIDER_DEFAULTS[provider];
    const apiKey = typeof body.apiKey === 'string' && body.apiKey.trim()
      ? body.apiKey.trim()
      : process.env[providerDefaults.envKey];
    const baseUrl = input.baseUrl || providerDefaults.baseUrl;
    const model = input.model || providerDefaults.model;

    if (!apiKey) {
      return NextResponse.json({
        success: false,
        message: `未配置 ${provider} API Key，可在服务端环境变量 ${providerDefaults.envKey} 中配置，或临时填入本次解析密钥。`,
      }, { status: 400 });
    }

    if (!baseUrl || !model) {
      return NextResponse.json({
        success: false,
        message: 'OpenAI 兼容模型需要配置 Base URL 和模型名称。',
      }, { status: 400 });
    }

    const prompt = buildPaperParserPrompt(input, Array.isArray(body.knowledgePaths) ? body.knowledgePaths : []);
    const aiResponse = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: '你只输出严格 JSON。' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const message = await aiResponse.text();
      return NextResponse.json({ success: false, message: message.slice(0, 500) || '模型解析失败' }, { status: 502 });
    }

    const json = await aiResponse.json();
    const content = json.choices?.[0]?.message?.content;
    const parsed = typeof content === 'string' ? JSON.parse(content) : content;
    const data = normalizeParsedPaper({
      ...parsed,
      parser: {
        provider,
        model,
        mode: 'ai',
      },
    }, input);

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const authError = authErrorResponse(err);
    if (authError) return authError;

    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

function normalizeProvider(provider: unknown): PaperParserProvider {
  if (
    provider === 'openai'
    || provider === 'deepseek'
    || provider === 'qwen'
    || provider === 'openai-compatible'
  ) {
    return provider;
  }

  return 'rule';
}
