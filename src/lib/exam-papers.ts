export function normalizeExamPaperName(name?: string | null) {
  const compact = (name || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[（）]/g, match => match === '（' ? '(' : ')');

  if (!compact) return '';

  return compact
    .replace(/^(\d{4})国考/, '$1年国考')
    .replace(/^(\d{4})公务员考试/, '$1年国考')
    .replace(/副省$/, '副省级');
}

export function createExamPaperId(name: string) {
  const normalized = normalizeExamPaperName(name);
  const slug = Array.from(normalized)
    .map(char => char.charCodeAt(0).toString(36))
    .join('')
    .slice(0, 120);

  return `paper_${slug || Date.now().toString(36)}`;
}
