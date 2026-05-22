import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function testNodes() {
  try {
    console.log('=== 检查数据库中的所有表 ===');
    
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    console.log('所有表:', tables.map(t => t.table_name).join(', '));

    console.log('\n=== 检查 knowledge_nodes 表 ===');
    const nodeCount = await sql`SELECT COUNT(*) as count FROM knowledge_nodes`;
    console.log('知识节点数量:', nodeCount[0].count);

    const nodeUsers = await sql`SELECT DISTINCT user_id FROM knowledge_nodes`;
    console.log('知识节点的 user_id:', nodeUsers.map(r => r.user_id));

    console.log('\n=== 检查 mind_maps 表 ===');
    const mindMapCount = await sql`SELECT COUNT(*) as count FROM mind_maps`;
    console.log('思维导图数量:', mindMapCount[0].count);

    const mmUsers = await sql`SELECT DISTINCT user_id FROM mind_maps`;
    console.log('思维导图的 user_id:', mmUsers.map(r => r.user_id));

    console.log('\n=== 检查 question_bank 表 ===');
    const questionCount = await sql`SELECT COUNT(*) as count FROM question_bank`;
    console.log('题库数量:', questionCount[0].count);

    const qUsers = await sql`SELECT DISTINCT user_id FROM question_bank`;
    console.log('题库的 user_id:', qUsers.map(r => r.user_id));

    // 检查 knowledge_nodes 的实际内容
    console.log('\n=== 知识节点的前5条数据 ===');
    const sampleNodes = await sql`SELECT id, name, parent_id, ps_score FROM knowledge_nodes LIMIT 5`;
    sampleNodes.forEach((n: any, i: number) => {
      console.log(`${i+1}. ID: ${n.id}, 名称: ${n.name}, 父节点: ${n.parent_id}, PS分数: ${n.ps_score}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('查询时出错:', error);
    process.exit(1);
  }
}

testNodes();
