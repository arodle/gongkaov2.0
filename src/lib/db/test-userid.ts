import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function testUserId() {
  try {
    console.log('=== 检查数据库中的 user_id ===');
    
    const mindMapUsers = await sql`SELECT DISTINCT user_id FROM mind_maps`;
    console.log('思维导图的 user_id:', mindMapUsers.map(r => r.user_id));
    
    const questionUsers = await sql`SELECT DISTINCT user_id FROM question_bank`;
    console.log('题库的 user_id:', questionUsers.map(r => r.user_id));
    
    const practiceSetUsers = await sql`SELECT DISTINCT user_id FROM practice_sets`;
    console.log('练习套卷的 user_id:', practiceSetUsers.map(r => r.user_id));

    console.log('\n=== 使用用户实际的 user_id 查询数据 ===');
    const actualUserId = mindMapUsers[0]?.user_id || 'default';
    console.log('实际的 user_id:', actualUserId);
    
    const mindMaps = await sql`SELECT * FROM mind_maps WHERE user_id = ${actualUserId}`;
    console.log('查询到的思维导图:', mindMaps.length);
    
    const questions = await sql`SELECT COUNT(*) as count FROM question_bank WHERE user_id = ${actualUserId}`;
    console.log('查询到的题库数量:', questions[0].count);
    
    process.exit(0);
  } catch (error) {
    console.error('查询时出错:', error);
    process.exit(1);
  }
}

testUserId();
