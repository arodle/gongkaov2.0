import 'dotenv/config';
import { neon, neonConfig } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);
export { sql };

const DEFAULT_USER_ID = 'default_user';

export async function getKnowledgeNodes(userId: string = DEFAULT_USER_ID) {
  const result = await sql`
    SELECT id, user_id, name, parent_id, pos_x, pos_y, ps_score,
           last_practiced_at, color_tag, node_type, content, annotation,
           created_at, updated_at
    FROM knowledge_nodes
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
  `;
  return result;
}

export async function getMindMaps(userId: string = DEFAULT_USER_ID) {
  const result = await sql`
    SELECT id, name, data, created_at, updated_at
    FROM mind_maps
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
  `;
  return result;
}

export async function upsertMindMap(
  userId: string,
  mindMap: { id?: string; name?: string; data: unknown }
) {
  const id = mindMap.id || `mm_${Date.now()}`;
  const result = await sql`
    INSERT INTO mind_maps (id, user_id, name, data, updated_at)
    VALUES (${id}, ${userId}, ${mindMap.name || '我的思维导图'}, ${JSON.stringify(mindMap.data)}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      data = EXCLUDED.data,
      updated_at = NOW()
    RETURNING id
  `;
  return result[0]?.id;
}

export async function getQuestions(userId: string = DEFAULT_USER_ID) {
  const result = await sql`
    SELECT id, question_text, option_a, option_b, option_c, option_d, 
           correct_answer, explanation, knowledge_path, linked_angle_id, 
           source, mind_map_id, type, reference, created_at
    FROM question_bank
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;
  return result;
}

export async function upsertQuestions(
  userId: string,
  questions: Array<Record<string, unknown>>
) {
  for (const q of questions) {
    const id = (q.id as string) || `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await sql`
      INSERT INTO question_bank (
        id, user_id, question_text, option_a, option_b, option_c, option_d,
        correct_answer, explanation, knowledge_path, linked_angle_id, source, mind_map_id
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
        ${q.linked_angle_id as string || null},
        ${(q.source as string) || 'manual'},
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
        mind_map_id = EXCLUDED.mind_map_id
    `;
  }
  return questions.length;
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
