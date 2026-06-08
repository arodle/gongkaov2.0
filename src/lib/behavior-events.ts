import type { BehaviorEventRecord, BehaviorEventType } from '@/types';

export const BEHAVIOR_EVENT_SCHEMA_VERSION = 1;

export const VALID_BEHAVIOR_EVENT_TYPES = new Set<BehaviorEventType>([
  'highlight',
  'circle',
  'strike',
  'answer_select',
  'answer_change',
  'note',
]);

function toFiniteNumber(value: unknown, fallback = 0) {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function toOptionalString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function normalizeBaseMetadata(metadata: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {
    schemaVersion: BEHAVIOR_EVENT_SCHEMA_VERSION,
  };

  if (metadata.order !== undefined) {
    normalized.order = Math.max(0, Math.floor(toFiniteNumber(metadata.order)));
  }

  if (metadata.elapsedMs !== undefined) {
    normalized.elapsedMs = Math.max(0, Math.floor(toFiniteNumber(metadata.elapsedMs)));
  }

  return normalized;
}

export function normalizeBehaviorEventMetadata(
  eventType: BehaviorEventType,
  metadata?: Record<string, unknown>
) {
  const source = metadata && typeof metadata === 'object' ? metadata : {};
  const normalized = normalizeBaseMetadata(source);

  if (eventType === 'highlight' || eventType === 'circle') {
    const startOffset = Math.max(0, Math.floor(toFiniteNumber(source.startOffset)));
    const endOffset = Math.max(startOffset, Math.floor(toFiniteNumber(source.endOffset, startOffset)));
    return {
      ...normalized,
      startOffset,
      endOffset,
      selectedText: toOptionalString(source.selectedText) || '',
    };
  }

  if (eventType === 'strike') {
    return {
      ...normalized,
      optionLabel: toOptionalString(source.optionLabel) || '',
      optionText: toOptionalString(source.optionText) || '',
      active: source.active !== false,
    };
  }

  if (eventType === 'answer_select') {
    return {
      ...normalized,
      selectedAnswer: toOptionalString(source.selectedAnswer) || '',
    };
  }

  if (eventType === 'answer_change') {
    return {
      ...normalized,
      from: toOptionalString(source.from) || '',
      to: toOptionalString(source.to) || '',
    };
  }

  if (eventType === 'note') {
    return {
      ...normalized,
      note: toOptionalString(source.note) || '',
    };
  }

  return normalized;
}

export function normalizeBehaviorEvent(event: BehaviorEventRecord): BehaviorEventRecord {
  return {
    ...event,
    schemaVersion: BEHAVIOR_EVENT_SCHEMA_VERSION,
    metadata: normalizeBehaviorEventMetadata(event.eventType, event.metadata),
  };
}

export function isValidBehaviorEvent(event: Partial<BehaviorEventRecord>): event is BehaviorEventRecord {
  if (!event.questionId || !event.userId || !event.target || !event.eventType) return false;
  if (!VALID_BEHAVIOR_EVENT_TYPES.has(event.eventType)) return false;
  if (!event.startTime || Number.isNaN(new Date(event.startTime).getTime())) return false;
  if (!event.endTime || Number.isNaN(new Date(event.endTime).getTime())) return false;
  if (event.metadata !== undefined && (typeof event.metadata !== 'object' || event.metadata === null)) return false;

  const metadata = normalizeBehaviorEventMetadata(event.eventType, event.metadata as Record<string, unknown>);
  if ((event.eventType === 'highlight' || event.eventType === 'circle')
    && toFiniteNumber(metadata.endOffset) <= toFiniteNumber(metadata.startOffset)) return false;
  if (event.eventType === 'strike' && !metadata.optionLabel) return false;
  if (event.eventType === 'answer_select' && !metadata.selectedAnswer) return false;
  if (event.eventType === 'answer_change' && !metadata.to) return false;
  if (event.eventType === 'note' && !metadata.note) return false;

  return true;
}
