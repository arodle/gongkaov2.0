import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase-client';

// GET /api/sync — load all user data from cloud
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') || 'default';
    const client = getSupabaseClient();

    // Fetch mind maps
    const { data: mindMaps, error: mmError } = await client
      .from('mind_maps')
      .select('id, name, data, created_at, updated_at')
      .eq('user_id', userId);
    if (mmError) throw new Error(`查询思维导图失败: ${mmError.message}`);

    // Fetch question bank
    const { data: questions, error: qError } = await client
      .from('question_bank')
      .select('id, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, knowledge_path, linked_angle_id, source, mind_map_id, created_at')
      .eq('user_id', userId);
    if (qError) throw new Error(`查询题库失败: ${qError.message}`);

    // Fetch answer records
    const { data: answers, error: aError } = await client
      .from('answer_records')
      .select('id, question_id, selected_answer, is_correct, practice_mode, practice_set_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5000);
    if (aError) throw new Error(`查询做题记录失败: ${aError.message}`);

    // Fetch practice sets
    const { data: practiceSets, error: psError } = await client
      .from('practice_sets')
      .select('id, name, description, question_ids, mode, time_limit, created_at')
      .eq('user_id', userId);
    if (psError) throw new Error(`查询套卷失败: ${psError.message}`);

    return NextResponse.json({
      success: true,
      data: { mindMaps: mindMaps ?? [], questions: questions ?? [], answers: answers ?? [], practiceSets: practiceSets ?? [] },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/sync — save all user data to cloud (upsert)
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') || 'default';
    const client = getSupabaseClient();
    const body = await request.json();
    const { mindMap, questions, answers, practiceSets } = body as {
      mindMap?: { id?: string; name?: string; data: unknown };
      questions?: Array<Record<string, unknown>>;
      answers?: Array<Record<string, unknown>>;
      practiceSets?: Array<Record<string, unknown>>;
    };

    const results: Record<string, unknown> = {};

    // Upsert mind map
    if (mindMap) {
      const { data, error } = await client
        .from('mind_maps')
        .upsert(
          {
            id: mindMap.id || undefined,
            user_id: userId,
            name: mindMap.name || '我的思维导图',
            data: mindMap.data,
          },
          { onConflict: 'id' }
        )
        .select('id')
        .maybeSingle();
      if (error) throw new Error(`同步思维导图失败: ${error.message}`);
      results.mindMapId = data?.id;
    }

    // Upsert questions (batch)
    if (questions && questions.length > 0) {
      const rows = questions.map((q) => ({
        id: (q.id as string) || undefined,
        user_id: userId,
        question_text: q.question_text as string,
        option_a: q.option_a as string | null,
        option_b: q.option_b as string | null,
        option_c: q.option_c as string | null,
        option_d: q.option_d as string | null,
        correct_answer: q.correct_answer as string,
        explanation: q.explanation as string | null,
        knowledge_path: q.knowledge_path as string | null,
        linked_angle_id: q.linked_angle_id as string | null,
        source: q.source as string || 'manual',
        mind_map_id: q.mind_map_id as string | null,
      }));

      const { error } = await client.from('question_bank').upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`同步题库失败: ${error.message}`);
      results.questionCount = rows.length;
    }

    // Insert answer records (no upsert, just append)
    if (answers && answers.length > 0) {
      const rows = answers.map((a) => ({
        id: (a.id as string) || undefined,
        user_id: userId,
        question_id: a.question_id as string,
        selected_answer: a.selected_answer as string | null,
        is_correct: a.is_correct as boolean,
        practice_mode: a.practice_mode as string || 'single',
        practice_set_id: a.practice_set_id as string | null,
      }));

      const { error } = await client.from('answer_records').insert(rows);
      if (error) throw new Error(`同步做题记录失败: ${error.message}`);
      results.answerCount = rows.length;
    }

    // Upsert practice sets
    if (practiceSets && practiceSets.length > 0) {
      const rows = practiceSets.map((ps) => ({
        id: (ps.id as string) || undefined,
        user_id: userId,
        name: ps.name as string,
        description: ps.description as string | null,
        question_ids: ps.question_ids as unknown[],
        mode: ps.mode as string || 'exam',
        time_limit: ps.time_limit as number | null,
      }));

      const { error } = await client.from('practice_sets').upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`同步套卷失败: ${error.message}`);
      results.practiceSetCount = rows.length;
    }

    return NextResponse.json({ success: true, data: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
