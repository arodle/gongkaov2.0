import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { DEFAULT_USER_ID } from '@/lib/server/auth';
import { createExamPaperId, normalizeExamPaperName } from '@/lib/exam-papers';
import { normalizeBehaviorEvent } from '@/lib/behavior-events';
import type { BehaviorEventRecord } from '@/types';

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const sql = neon(databaseUrl);
export { sql };

function toMapNodeId(id: string | null | undefined) {
  if (!id) return null;
  return id.startsWith('mn_') ? id : `mn_${id}`;
}

function fromMapNodeId(id: string | null | undefined) {
  if (!id) return null;
  return id.startsWith('mn_') ? id.slice(3) : id;
}

async function getActiveMindMapId(userId: string) {
  const rows = await sql`
    SELECT id
    FROM mind_map
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  return rows[0]?.id as string | undefined;
}

async function ensureActiveMindMap(userId: string) {
  const existingId = await getActiveMindMapId(userId);
  if (existingId) return existingId;

  const id = `mm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  await sql`
    INSERT INTO mind_map (id, user_id, name, description, category, updated_at)
    VALUES (${id}, ${userId}, '行测知识导图', 'MindCanvas 默认导图', '行测', NOW())
  `;
  return id;
}

export async function getKnowledgeNodes(userId: string = DEFAULT_USER_ID) {
  const activeMapId = await getActiveMindMapId(userId);
  if (!activeMapId) return [];

  const result = await sql`
    SELECT
      id, user_id, name, parent_id, pos_x, pos_y,
      COALESCE(ps_score, 50)::int AS ps_score,
      last_practiced_at,
      COALESCE(color_tag, 'default') AS color_tag,
      COALESCE(node_type, 'topic') AS node_type,
      content,
      markdown AS annotation,
      updated_at
    FROM map_node
    WHERE user_id = ${userId}
      AND mind_map_id = ${activeMapId}
    ORDER BY updated_at DESC
  `;

  return result.map(row => ({
    ...row,
    id: fromMapNodeId(row.id),
    parent_id: fromMapNodeId(row.parent_id),
  }));
}

export async function upsertKnowledgeNode(
  userId: string,
  node: {
    id: string;
    name?: string;
    parent_id?: string | null;
    pos_x?: number;
    pos_y?: number;
    ps_score?: number;
    node_type?: string;
    content?: string;
    annotation?: string;
  }
) {
  const mapNodeId = toMapNodeId(node.id);
  const existing = await sql`
    SELECT id
    FROM map_node
    WHERE user_id = ${userId}
      AND (id = ${node.id} OR id = ${mapNodeId})
    ORDER BY updated_at DESC
    LIMIT 1
  `;

  const parentProvided = Object.prototype.hasOwnProperty.call(node, 'parent_id');
  const parentId = parentProvided ? toMapNodeId(node.parent_id) : null;
  const hasPsScore = node.ps_score !== undefined;

  if (existing.length > 0) {
    await sql`
      UPDATE map_node
      SET name = COALESCE(${node.name ?? null}, name),
          parent_id = CASE WHEN ${parentProvided} THEN ${parentId} ELSE parent_id END,
          pos_x = COALESCE(${node.pos_x ?? null}, pos_x),
          pos_y = COALESCE(${node.pos_y ?? null}, pos_y),
          ps_score = COALESCE(${node.ps_score ?? null}, ps_score),
          last_practiced_at = CASE WHEN ${hasPsScore} THEN NOW() ELSE last_practiced_at END,
          node_type = COALESCE(${node.node_type ?? null}, node_type),
          content = COALESCE(${node.content ?? null}, content),
          markdown = COALESCE(${node.annotation ?? null}, markdown),
          updated_at = NOW()
      WHERE id = ${existing[0].id} AND user_id = ${userId}
    `;
    return existing[0].id;
  }

  if (!node.name) return null;

  const mindMapId = await ensureActiveMindMap(userId);
  await sql`
    INSERT INTO map_node (
      id, mind_map_id, user_id, parent_id, name, pos_x, pos_y, ps_score,
      node_type, content, markdown, updated_at
    ) VALUES (
      ${mapNodeId},
      ${mindMapId},
      ${userId},
      ${parentId},
      ${node.name},
      ${node.pos_x || 0},
      ${node.pos_y || 0},
      ${node.ps_score ?? 50},
      ${node.node_type || 'topic'},
      ${node.content || null},
      ${node.annotation || null},
      NOW()
    )
  `;

  return mapNodeId;
}

export async function deleteKnowledgeNodes(userId: string, nodeIds: string[]) {
  if (nodeIds.length === 0) return 0;
  const ids = Array.from(new Set(nodeIds.flatMap(id => [id, toMapNodeId(id)].filter(Boolean))));
  await sql`
    DELETE FROM map_node
    WHERE user_id = ${userId} AND id = ANY(${ids})
  `;
  return nodeIds.length;
}

export async function getMindMaps(userId: string = DEFAULT_USER_ID) {
  const result = await sql`
    SELECT id, name, description, category, root_node_id, settings, NULL::jsonb AS data, created_at, updated_at
    FROM mind_map
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
  `;
  return result;
}

export async function upsertMindMap(
  userId: string,
  mindMap: { id?: string; name?: string; data?: unknown; settings?: unknown }
) {
  const id = mindMap.id || `mm_${Date.now()}`;
  const result = await sql`
    INSERT INTO mind_map (id, user_id, name, updated_at)
    VALUES (${id}, ${userId}, ${mindMap.name || '我的思维导图'}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      updated_at = NOW()
    WHERE mind_map.user_id = ${userId}
    RETURNING id
  `;
  return result[0]?.id;
}

export async function getQuestions(userId: string = DEFAULT_USER_ID) {
  const result = await sql`
    SELECT id, question_text, option_a, option_b, option_c, option_d, 
           correct_answer, explanation, knowledge_path, linked_angle_id, 
           source, mind_map_id, type, reference, exam_paper, created_at
    FROM question_bank
    WHERE user_id = ${userId}
      AND deleted_at IS NULL
    ORDER BY created_at DESC
  `;
  return result;
}

export async function getExamPapers(userId: string = DEFAULT_USER_ID) {
  const result = await sql`
    SELECT
      ep.id,
      ep.name,
      ep.description,
      ep.type,
      ep.question_count,
      ep.created_at,
      ep.updated_at,
      COALESCE(array_remove(array_agg(q.id ORDER BY q.created_at DESC), NULL), ARRAY[]::varchar[]) AS question_ids
    FROM exam_papers ep
    LEFT JOIN question_bank q
      ON q.user_id = ep.user_id
      AND q.exam_paper = ep.normalized_name
    WHERE ep.user_id = ${userId}
    GROUP BY ep.id, ep.name, ep.description, ep.type, ep.question_count, ep.created_at, ep.updated_at
    ORDER BY ep.updated_at DESC
  `;
  return result;
}

export async function upsertExamPapers(
  userId: string,
  papers: Array<Record<string, unknown>>
) {
  let saved = 0;

  for (const paper of papers) {
    const normalizedName = normalizeExamPaperName(paper.name as string);
    if (!normalizedName) continue;

    const id = (paper.id as string) || createExamPaperId(normalizedName);
    const type = ((paper.type as string) || 'real') === 'simulated' ? 'simulated' : 'real';
    const questionIds = Array.isArray(paper.question_ids)
      ? paper.question_ids
      : Array.isArray(paper.questions)
        ? paper.questions
        : [];
    const questionCount = Number(paper.question_count ?? paper.questionCount ?? questionIds.length) || 0;

    await sql`
      INSERT INTO exam_papers (
        id, user_id, name, normalized_name, description, type, question_count, updated_at
      ) VALUES (
        ${id},
        ${userId},
        ${normalizedName},
        ${normalizedName},
        ${paper.description as string || null},
        ${type},
        ${questionCount},
        NOW()
      )
      ON CONFLICT (user_id, normalized_name) DO UPDATE SET
        name = EXCLUDED.name,
        description = COALESCE(EXCLUDED.description, exam_papers.description),
        type = EXCLUDED.type,
        question_count = GREATEST(exam_papers.question_count, EXCLUDED.question_count),
        updated_at = NOW()
    `;
    saved += 1;
  }

  return saved;
}

export async function upsertQuestions(
  userId: string,
  questions: Array<Record<string, unknown>>
) {
  const papersByName = new Map<string, Record<string, unknown>>();

  for (const q of questions) {
    const id = (q.id as string) || `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const examPaper = normalizeExamPaperName(q.exam_paper as string);

    if (examPaper) {
      papersByName.set(examPaper, {
        name: examPaper,
        type: (q.type as string) || (q.source as string) || 'real',
        question_count: (papersByName.get(examPaper)?.question_count as number || 0) + 1,
      });
    }

    await sql`
      INSERT INTO question_bank (
        id, user_id, question_text, option_a, option_b, option_c, option_d,
        correct_answer, explanation, knowledge_path, linked_angle_id, source, type, reference, exam_paper, mind_map_id
      ) VALUES (
        ${id},
        ${userId},
        ${q.question_text as string},
        ${q.option_a as string || null},
        ${q.option_b as string || null},
        ${q.option_c as string || null},
        ${q.option_d as string || null},
        ${q.correct_answer as string},
        ${q.explanation as string || null},
        ${q.knowledge_path as string || null},
        ${fromMapNodeId(q.linked_angle_id as string) || null},
        ${(q.source as string) || (q.type as string) || 'manual'},
        ${(q.type as string) || (q.source as string) || 'real'},
        ${q.reference as string || null},
        ${examPaper || null},
        ${q.mind_map_id as string || null}
      )
      ON CONFLICT (id) DO UPDATE SET
        question_text = EXCLUDED.question_text,
        option_a = EXCLUDED.option_a,
        option_b = EXCLUDED.option_b,
        option_c = EXCLUDED.option_c,
        option_d = EXCLUDED.option_d,
        correct_answer = EXCLUDED.correct_answer,
        explanation = EXCLUDED.explanation,
        knowledge_path = EXCLUDED.knowledge_path,
        linked_angle_id = EXCLUDED.linked_angle_id,
        source = EXCLUDED.source,
        type = EXCLUDED.type,
        reference = EXCLUDED.reference,
        exam_paper = EXCLUDED.exam_paper,
        mind_map_id = EXCLUDED.mind_map_id,
        deleted_at = NULL
    `;
  }

  if (papersByName.size > 0) {
    await upsertExamPapers(userId, Array.from(papersByName.values()));
  }

  return questions.length;
}

export async function softDeleteQuestions(
  userId: string,
  questionIds: string[]
) {
  const ids = Array.from(new Set(questionIds.filter(Boolean)));
  if (ids.length === 0) return 0;

  await sql`
    UPDATE question_bank
    SET deleted_at = NOW()
    WHERE user_id = ${userId}
      AND id = ANY(${ids})
      AND deleted_at IS NULL
  `;

  return ids.length;
}

export async function getAnswerRecords(userId: string = DEFAULT_USER_ID, limit: number = 5000) {
  const result = await sql`
    SELECT id, question_id, selected_answer, is_correct, practice_mode, practice_set_id, created_at
    FROM answer_records
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return result;
}

export async function insertAnswerRecords(
  userId: string,
  answers: Array<Record<string, unknown>>
) {
  for (const a of answers) {
    const id = (a.id as string) || `ar_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await sql`
      INSERT INTO answer_records (
        id, user_id, question_id, selected_answer, is_correct, practice_mode, practice_set_id
      ) VALUES (
        ${id},
        ${userId},
        ${a.question_id as string},
        ${a.selected_answer as string || null},
        ${a.is_correct as boolean},
        ${(a.practice_mode as string) || 'single'},
        ${a.practice_set_id as string || null}
      )
    `;
  }
  return answers.length;
}

export async function getPracticeSets(userId: string = DEFAULT_USER_ID) {
  const result = await sql`
    SELECT id, name, description, question_ids, mode, time_limit, created_at
    FROM practice_sets
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;
  return result;
}

export async function getBehaviorEvents(userId: string = DEFAULT_USER_ID, limit: number = 5000, questionId?: string) {
  if (questionId) {
    return sql`
      SELECT id, question_id, event_type, target, start_time, end_time, metadata, created_at
      FROM behavior_events
      WHERE user_id = ${userId} AND question_id = ${questionId}
      ORDER BY created_at ASC
      LIMIT ${limit}
    `;
  }

  return sql`
    SELECT id, question_id, event_type, target, start_time, end_time, metadata, created_at
    FROM behavior_events
    WHERE user_id = ${userId}
    ORDER BY created_at ASC
    LIMIT ${limit}
  `;
}

export async function insertBehaviorEvents(
  userId: string,
  events: BehaviorEventRecord[]
) {
  await sql`
    CREATE TABLE IF NOT EXISTS behavior_events (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      question_id VARCHAR(255) NOT NULL,
      event_type VARCHAR(50) NOT NULL,
      target TEXT NOT NULL,
      start_time TIMESTAMP NOT NULL,
      end_time TIMESTAMP NOT NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  for (const event of events) {
    const normalizedEvent = normalizeBehaviorEvent(event);
    const id = (event.id as string) || `be_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    await sql`
      INSERT INTO behavior_events (
        id, user_id, question_id, event_type, target, start_time, end_time, metadata
      ) VALUES (
        ${id},
        ${userId},
        ${normalizedEvent.questionId as string},
        ${normalizedEvent.eventType as string},
        ${normalizedEvent.target as string},
        ${normalizedEvent.startTime as string},
        ${normalizedEvent.endTime as string},
        ${JSON.stringify(normalizedEvent.metadata)}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  return events.length;
}

export async function upsertPracticeSets(
  userId: string,
  practiceSets: Array<Record<string, unknown>>
) {
  for (const ps of practiceSets) {
    const id = (ps.id as string) || `ps_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await sql`
      INSERT INTO practice_sets (
        id, user_id, name, description, question_ids, mode, time_limit
      ) VALUES (
        ${id},
        ${userId},
        ${ps.name as string},
        ${ps.description as string || null},
        ${JSON.stringify(ps.question_ids as unknown[])},
        ${(ps.mode as string) || 'exam'},
        ${ps.time_limit as number || null}
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        question_ids = EXCLUDED.question_ids,
        mode = EXCLUDED.mode,
        time_limit = EXCLUDED.time_limit
    `;
  }
  return practiceSets.length;
}
