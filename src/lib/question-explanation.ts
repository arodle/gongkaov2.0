import type { PaperParserProvider } from './paper-parser';

export interface GeneratedQuestionExplanation {
  corePitfall: string;
  routines: {
    correct: string[];
    wrong: string[];
  };
  extension: string;
  confusions: string[];
  highlights: {
    absoluteWords: string[];
    keywords: string[];
  };
  stemStructure?: Array<{
    label: string;
    text: string;
    role: string;
  }>;
  explanation: string;
}

export interface QuestionExplanationInput {
  content: string;
  options: { label: string; text: string }[];
  correctAnswer: string;
  knowledgePath?: string;
  provider?: PaperParserProvider;
  model?: string;
  baseUrl?: string;
}

export function buildQuestionExplanationPrompt(input: QuestionExplanationInput) {
  return [
    '你是公考行测解析教研助手。请为题目生成结构化解析，只输出严格 JSON，不要输出 Markdown。',
    '必须围绕以下 6 个方向组织：',
    '1. 核心考点必挖坑：说明这题最容易掉进哪个坑。',
    '2. 四大出题套路：分别给 correct 和 wrong 两组模板，correct 写正确选项常见特征，wrong 写错误选项常见陷阱。',
    '3. 延伸考法：说明同一考点还会怎样变形考。',
    '4. 易混成对辨析：列出容易混淆的一组或多组概念/表达。',
    '5. 绝对词 + 关键词高亮：提取题干或选项中的绝对词、转折词、限定词、核心关键词。',
    '6. 段落句子结构划分：如果题干适合划分，则输出 stemStructure；如果不适合，返回空数组，不要硬凑。',
    '不要编造不存在的信息；如果答案为空，仍可给审题结构和可能考点，但 explanation 必须提示“答案待确认”。',
    '输出格式：{"corePitfall":"","routines":{"correct":[],"wrong":[]},"extension":"","confusions":[],"highlights":{"absoluteWords":[],"keywords":[]},"stemStructure":[{"label":"①","text":"","role":"背景/条件/观点/转折/结论/提问"}],"explanation":""}',
    `知识点路径：${input.knowledgePath || '未绑定'}`,
    `正确答案：${input.correctAnswer || '待确认'}`,
    '题干：',
    input.content,
    '选项：',
    input.options.map(option => `${option.label}. ${option.text}`).join('\n'),
  ].join('\n\n');
}

export function normalizeGeneratedExplanation(raw: Partial<GeneratedQuestionExplanation>): GeneratedQuestionExplanation {
  return {
    corePitfall: String(raw.corePitfall || '').trim(),
    routines: {
      correct: Array.isArray(raw.routines?.correct) ? raw.routines.correct.map(String).filter(Boolean) : [],
      wrong: Array.isArray(raw.routines?.wrong) ? raw.routines.wrong.map(String).filter(Boolean) : [],
    },
    extension: String(raw.extension || '').trim(),
    confusions: Array.isArray(raw.confusions) ? raw.confusions.map(String).filter(Boolean) : [],
    highlights: {
      absoluteWords: Array.isArray(raw.highlights?.absoluteWords) ? raw.highlights.absoluteWords.map(String).filter(Boolean) : [],
      keywords: Array.isArray(raw.highlights?.keywords) ? raw.highlights.keywords.map(String).filter(Boolean) : [],
    },
    stemStructure: Array.isArray(raw.stemStructure)
      ? raw.stemStructure
          .filter(item => item?.text)
          .map((item, index) => ({
            label: String(item.label || index + 1),
            text: String(item.text || '').trim(),
            role: String(item.role || '').trim(),
          }))
      : [],
    explanation: String(raw.explanation || '').trim(),
  };
}

export function generatedExplanationToText(data: GeneratedQuestionExplanation) {
  const parts = [
    data.explanation && `【基础解析】\n${data.explanation}`,
    data.corePitfall && `【核心考点必挖坑】\n${data.corePitfall}`,
    data.routines.correct.length && `【正确选项套路】\n${data.routines.correct.map(item => `- ${item}`).join('\n')}`,
    data.routines.wrong.length && `【错误选项套路】\n${data.routines.wrong.map(item => `- ${item}`).join('\n')}`,
    data.extension && `【延伸考法】\n${data.extension}`,
    data.confusions.length && `【易混成对辨析】\n${data.confusions.map(item => `- ${item}`).join('\n')}`,
    (data.highlights.absoluteWords.length || data.highlights.keywords.length)
      && `【绝对词与关键词】\n绝对词：${data.highlights.absoluteWords.join('、') || '无'}\n关键词：${data.highlights.keywords.join('、') || '无'}`,
  ].filter(Boolean);

  return parts.join('\n\n');
}
