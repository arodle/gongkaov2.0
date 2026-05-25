import { NextResponse } from 'next/server';
import {
  upsertMindMap,
  upsertKnowledgeNode,
  upsertQuestions,
  upsertPracticeSets,
} from '@/lib/db/neon-service';
import { SAMPLE_MIND_MAP, SAMPLE_PRACTICE_SETS, SAMPLE_QUESTION_BANK } from '@/lib/sample-data';

function flattenNodes(node: any, parentId: string | null = null): any[] {
  const nodes = [{
    id: node.id,
    name: node.name,
    parent_id: parentId,
    pos_x: node.pos_x || 0,
    pos_y: node.pos_y || 0,
    ps_score: node.ps_score || 50,
    node_type: node.type || 'topic',
    content: node.content || null,
    annotation: node.annotation || null,
  }];
  
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      nodes.push(...flattenNodes(child, node.id));
    }
  }
  
  return nodes;
}

export async function POST() {
  try {
    const userId = 'default_user';
    
    const nodes = flattenNodes(SAMPLE_MIND_MAP);
    for (const node of nodes) {
      await upsertKnowledgeNode(userId, node);
    }
    console.log(`Inserted ${nodes.length} knowledge nodes`);
    
    await upsertMindMap(userId, {
      id: 'default_mindmap',
      name: '行测思维导图',
      data: SAMPLE_MIND_MAP,
    });
    console.log('Inserted mind map');
    
    const questions = SAMPLE_QUESTION_BANK.map(q => ({
      id: q.id,
      question_text: q.content,
      option_a: q.options.find(o => o.label === 'A')?.text || null,
      option_b: q.options.find(o => o.label === 'B')?.text || null,
      option_c: q.options.find(o => o.label === 'C')?.text || null,
      option_d: q.options.find(o => o.label === 'D')?.text || null,
      correct_answer: q.correctAnswer,
      explanation: q.explanation,
      knowledge_path: q.knowledgePath,
      linked_angle_id: q.linkedAngleId,
      source: q.source,
      type: 'real',
      reference: null,
      mind_map_id: 'default_mindmap',
    }));
    await upsertQuestions(userId, questions);
    console.log(`Inserted ${questions.length} questions`);
    
    const practiceSets = SAMPLE_PRACTICE_SETS.map(ps => ({
      id: ps.id,
      name: ps.name,
      description: null,
      question_ids: ps.questions.map(q => q.id),
      mode: 'exam',
      time_limit: null,
    }));
    await upsertPracticeSets(userId, practiceSets);
    console.log(`Inserted ${practiceSets.length} practice sets`);
    
    return NextResponse.json({ success: true, message: 'Sample data initialized successfully' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Init sample data error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
