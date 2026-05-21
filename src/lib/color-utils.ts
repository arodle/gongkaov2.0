/**
 * 根据错误次数计算渐变色：淡粉 → 深红 → 近似黑色
 * 使用 HSL 色彩空间，色相保持 0（红色），饱和度 100%，
 * 亮度从 85%（淡粉）到 5%（近似黑色）连续过渡
 */
export function getWrongColor(wrongCount: number): string {
  if (wrongCount <= 0) return '';
  const maxWrong = 10;
  const lightness = Math.max(5, 85 - (wrongCount / maxWrong) * 80);
  return `hsl(0, 100%, ${lightness}%)`;
}

/**
 * 获取节点文字颜色（根据背景亮度自动切换黑/白文字）
 */
export function getWrongTextColor(wrongCount: number): string {
  if (wrongCount <= 0) return '';
  const maxWrong = 10;
  const lightness = Math.max(5, 85 - (wrongCount / maxWrong) * 80);
  return lightness > 45 ? 'hsl(0, 80%, 15%)' : 'hsl(0, 20%, 95%)';
}

/**
 * 获取知识点路径是否被点亮（黄色）
 */
export function isPathLitUp(
  node: { correctCount: number; children: Array<{ correctCount: number; children: unknown[] }> },
): boolean {
  if (node.correctCount > 0) return true;
  return node.children.some((child) => isPathLitUp(child as Parameters<typeof isPathLitUp>[0]));
}

/**
 * 统计节点及其所有后代的总错误次数
 */
export function getTotalWrongCount(node: { wrongCount: number; children: unknown[] }): number {
  let total = node.wrongCount;
  for (const child of node.children) {
    total += getTotalWrongCount(child as Parameters<typeof getTotalWrongCount>[0]);
  }
  return total;
}

/**
 * 获取节点的统计信息（含所有后代）
 */
export function getNodeStats(
  node: { correctCount: number; wrongCount: number; children: unknown[] },
): { correct: number; wrong: number } {
  let correct = node.correctCount;
  let wrong = node.wrongCount;
  for (const child of node.children) {
    const childStats = getNodeStats(child as Parameters<typeof getNodeStats>[0]);
    correct += childStats.correct;
    wrong += childStats.wrong;
  }
  return { correct, wrong };
}

export interface NodeWithStats {
  id: string;
  name: string;
  type: string;
  correctCount: number;
  wrongCount: number;
  children: NodeWithStats[];
}
