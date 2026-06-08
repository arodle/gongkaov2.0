export type PaperParserProvider = 'rule' | 'openai' | 'deepseek' | 'qwen' | 'openai-compatible';

export interface PaperParserConfig {
  provider: PaperParserProvider;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface ParsedPaperQuestion {
  id?: string;
  number?: number;
  content: string;
  options: { label: string; text: string }[];
  correctAnswer?: string;
  explanation?: string;
  reference?: string;
  linkedAngleId?: string;
  linkedAngleName?: string;
  knowledgePath?: string;
  questionType?: string;
  confidence?: number;
  reviewStatus?: Array<'missing_options' | 'missing_answer' | 'missing_explanation' | 'missing_binding' | 'low_confidence'>;
}

export interface ParsedPaperData {
  name: string;
  description: string;
  type: 'real' | 'simulated';
  questions: ParsedPaperQuestion[];
  parser: {
    provider: PaperParserProvider;
    model?: string;
    mode: 'rule' | 'ai';
  };
  quality: {
    total: number;
    ready: number;
    missingAnswer: number;
    missingExplanation: number;
    missingBinding: number;
    lowConfidence: number;
  };
}

export interface PaperParseInput {
  rawText: string;
  paperName?: string;
  paperType?: 'real' | 'simulated';
  provider?: PaperParserProvider;
  model?: string;
  baseUrl?: string;
}

const OPTION_PATTERN = /(?:^|\n)\s*([A-D])[\s.、．)]{1,3}([\s\S]*?)(?=(?:\n\s*[A-D][\s.、．)]{1,3})|$)/g;

export function normalizeParsedPaper(data: Partial<ParsedPaperData>, fallback: PaperParseInput): ParsedPaperData {
  const questions = (Array.isArray(data.questions) ? data.questions : [])
    .map((question, index) => {
      const options = Array.isArray(question.options)
        ? question.options
            .filter(option => option?.label && typeof option.text === 'string')
            .slice(0, 6)
            .map(option => ({
              label: String(option.label).trim().toUpperCase(),
              text: String(option.text).trim(),
            }))
        : [];
      const correctAnswer = question.correctAnswer ? String(question.correctAnswer).trim().toUpperCase().slice(0, 1) : '';
      const confidence = typeof question.confidence === 'number' ? question.confidence : 0.65;
      const reviewStatus = new Set<NonNullable<ParsedPaperQuestion['reviewStatus']>[number]>();

      if (options.length < 4) reviewStatus.add('missing_options');
      if (!correctAnswer) reviewStatus.add('missing_answer');
      if (!question.explanation?.trim()) reviewStatus.add('missing_explanation');
      if (!question.linkedAngleId && !question.knowledgePath) reviewStatus.add('missing_binding');
      if (confidence < 0.7) reviewStatus.add('low_confidence');

      return {
        id: question.id,
        number: question.number || index + 1,
        content: String(question.content || '').trim(),
        options,
        correctAnswer,
        explanation: question.explanation?.trim() || '',
        reference: question.reference?.trim() || '',
        linkedAngleId: question.linkedAngleId?.trim() || '',
        linkedAngleName: question.linkedAngleName?.trim() || '',
        knowledgePath: question.knowledgePath?.trim() || '',
        questionType: question.questionType?.trim() || '',
        confidence,
        reviewStatus: Array.from(reviewStatus),
      };
    })
    .filter(question => question.content);

  const quality = buildPaperQuality(questions);

  return {
    name: data.name?.trim() || fallback.paperName?.trim() || '待审核套卷',
    description: data.description?.trim() || '通过解析工作台生成的套卷草稿',
    type: data.type === 'simulated' ? 'simulated' : fallback.paperType || 'real',
    questions,
    parser: data.parser || {
      provider: fallback.provider || 'rule',
      model: fallback.model,
      mode: fallback.provider && fallback.provider !== 'rule' ? 'ai' : 'rule',
    },
    quality,
  };
}

export function parsePaperByRules(input: PaperParseInput): ParsedPaperData {
  const rawText = normalizePaperText(input.rawText);
  const answerMap = extractAnswerMap(rawText);
  const questionArea = rawText.split(/(?:参考答案|答案解析|答案与解析|正确答案)/)[0] || rawText;
  const blocks = splitQuestionBlocks(questionArea);

  const questions = blocks.map((block, index) => {
    const options = extractOptions(block.body);
    const content = removeOptions(block.body).trim();

    return {
      number: block.number || index + 1,
      content,
      options,
      correctAnswer: answerMap.get(block.number || index + 1) || '',
      explanation: '',
      confidence: options.length >= 4 ? 0.72 : 0.52,
    };
  });

  return normalizeParsedPaper({
    name: input.paperName || '待审核套卷',
    description: '规则解析生成，建议人工复核答案、解析与知识点绑定。',
    type: input.paperType || 'real',
    questions,
    parser: {
      provider: 'rule',
      mode: 'rule',
    },
  }, input);
}

export function buildPaperQuality(questions: ParsedPaperQuestion[]) {
  const missingAnswer = questions.filter(question => !question.correctAnswer).length;
  const missingExplanation = questions.filter(question => !question.explanation).length;
  const missingBinding = questions.filter(question => !question.linkedAngleId && !question.knowledgePath).length;
  const lowConfidence = questions.filter(question => (question.confidence || 0) < 0.7).length;

  return {
    total: questions.length,
    ready: questions.filter(question => (
      question.options.length >= 4
      && !!question.correctAnswer
      && !!question.explanation
      && (!!question.linkedAngleId || !!question.knowledgePath)
      && (question.confidence || 0) >= 0.7
    )).length,
    missingAnswer,
    missingExplanation,
    missingBinding,
    lowConfidence,
  };
}

export function buildPaperParserPrompt(input: PaperParseInput, knowledgePaths: string[]) {
  const knowledgeHint = knowledgePaths.length
    ? `只能从以下知识点路径中选择 knowledgePath，不要自行创造新知识点：\n${knowledgePaths.slice(0, 250).join('\n')}`
    : '如果无法判断知识点，knowledgePath 留空。';

  return [
    '你是公考行测题库整理助手。请把原始试卷文本拆解为严格 JSON，不要输出 Markdown。',
    '要求：识别题干、A/B/C/D 选项、正确答案、解析、题号、来源和知识点路径。',
    '如果缺答案或缺解析，对应字段留空，不要编造。',
    'confidence 取 0 到 1，低于 0.7 表示需要人工复核。',
    knowledgeHint,
    '输出格式：{"name":"","description":"","type":"real","questions":[{"number":1,"content":"","options":[{"label":"A","text":""}],"correctAnswer":"","explanation":"","reference":"","knowledgePath":"","confidence":0.8}]}',
    `套卷名称：${input.paperName || '待审核套卷'}`,
    `试卷类型：${input.paperType || 'real'}`,
    '原始文本：',
    input.rawText.slice(0, 60000),
  ].join('\n\n');
}

function normalizePaperText(text: string) {
  return text
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractAnswerMap(text: string) {
  const answerMap = new Map<number, string>();
  const answerArea = text.split(/(?:参考答案|答案解析|答案与解析|正确答案)/).slice(1).join('\n');
  const pattern = /(?:^|\s)(\d{1,3})[\s.、．)]*(?:答案)?[\s:：]*([A-D])/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(answerArea))) {
    answerMap.set(Number(match[1]), match[2].toUpperCase());
  }

  return answerMap;
}

function splitQuestionBlocks(text: string) {
  const pattern = /(?:^|\n)\s*(\d{1,3})[\s.、．)]{1,3}([\s\S]*?)(?=(?:\n\s*\d{1,3}[\s.、．)]{1,3})|$)/g;
  const blocks: Array<{ number: number; body: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    const body = match[2].trim();
    if (body.length >= 8) {
      blocks.push({ number: Number(match[1]), body });
    }
  }

  return blocks;
}

function extractOptions(block: string) {
  const options: { label: string; text: string }[] = [];
  let match: RegExpExecArray | null;
  OPTION_PATTERN.lastIndex = 0;

  while ((match = OPTION_PATTERN.exec(block))) {
    const text = match[2].trim();
    if (text) {
      options.push({ label: match[1].toUpperCase(), text });
    }
  }

  return options;
}

function removeOptions(block: string) {
  return block.replace(OPTION_PATTERN, '').trim();
}
