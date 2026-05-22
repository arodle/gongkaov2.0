import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function testData() {
  try {
    console.log('=== 测试数据库数据 ===');
    
    const mindMaps = await sql`SELECT COUNT(*) as count FROM mind_maps`;
    console.log(`思维导图数量: ${mindMaps[0].count}`);
    
    const questions = await sql`SELECT COUNT(*) as count FROM question_bank`;
    console.log(`题库数量: ${questions[0].count}`);
    
    const answers = await sql`SELECT COUNT(*) as count FROM answer_records`;
    console.log(`答题记录数量: ${answers[0].count}`);
    
    const practiceSets = await sql`SELECT COUNT(*) as count FROM practice_sets`;
    console.log(`练习套卷数量: ${practiceSets[0].count}`);

    console.log('\n=== 查看前3条题库数据 ===');
    const sampleQuestions = await sql`SELECT * FROM question_bank LIMIT 3`;
    sampleQuestions.forEach((q: any, i: number) => {
      console.log(`\n题目 ${i+1}:`);
      console.log(`ID: ${q.id}`);
      console.log(`内容: ${q.question_text?.substring(0, 50)}${q.question_text?.length > 50 ? '...' : ''}`);
      console.log(`选项A: ${q.option_a}`);
      console.log(`选项B: ${q.option_b}`);
      console.log(`正确答案: ${q.correct_answer}`);
    });

    console.log('\n=== 查看前3条思维导图数据 ===');
    const sampleMindMaps = await sql`SELECT * FROM mind_maps LIMIT 3`;
    sampleMindMaps.forEach((mm: any, i: number) => {
      console.log(`\n思维导图 ${i+1}:`);
      console.log(`ID: ${mm.id}`);
      console.log(`名称: ${mm.name}`);
      const data = mm.data ? JSON.parse(mm.data) : null;
      console.log(`数据大小: ${data ? JSON.stringify(data).length : 0} 字符`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('测试数据时出错:', error);
    process.exit(1);
  }
}

testData();
