export interface PSParams {
  currentPS: number;
  isCorrect: boolean;
  scenarioCoefficient: number;
  lastPracticedAt: Date | null;
}

export const SCENARIO_COEFFICIENTS = {
  GLANCE: 0.5,
  PRACTICE: 1.0,
  MOCK_EXAM: 1.5,
  REAL_EXAM: 2.0,
} as const;

export function calculatePS(params: PSParams): number {
  const { currentPS, isCorrect, scenarioCoefficient, lastPracticedAt } = params;

  let elapsedDays = 0;
  if (lastPracticedAt) {
    elapsedDays = (Date.now() - lastPracticedAt.getTime()) / (1000 * 60 * 60 * 24);
  }

  const H = 3 + (Math.min(currentPS, 150) / 150) * 12;

  const retentionRate = Math.pow(0.5, elapsedDays / H);

  let newPS = currentPS * retentionRate;

  if (isCorrect) {
    newPS += scenarioCoefficient * 20 * (1 - retentionRate);
  } else {
    newPS -= scenarioCoefficient * 15 * retentionRate;
  }

  return Math.max(0, Math.min(200, Math.round(newPS)));
}

export function calculateHalfLife(psScore: number): number {
  return 3 + (Math.min(psScore, 150) / 150) * 12;
}

export function estimateRetentionRate(psScore: number, daysSincePractice: number): number {
  const H = calculateHalfLife(psScore);
  return Math.pow(0.5, daysSincePractice / H);
}

export function getScenarioLabel(coefficient: number): string {
  switch (coefficient) {
    case SCENARIO_COEFFICIENTS.GLANCE:
      return '看了一眼';
    case SCENARIO_COEFFICIENTS.PRACTICE:
      return '练习';
    case SCENARIO_COEFFICIENTS.MOCK_EXAM:
      return '模拟考试';
    case SCENARIO_COEFFICIENTS.REAL_EXAM:
      return '真题考试';
    default:
      return '未知场景';
  }
}
