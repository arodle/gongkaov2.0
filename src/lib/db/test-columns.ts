import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function testColumns() {
  try {
    console.log('=== knowledge_nodes 表结构 ===');
    const nodeCols = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'knowledge_nodes'
      ORDER BY ordinal_position
    `;
    nodeCols.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));
    
    console.log('\n=== question_bank 表结构 ===');
    const questionCols = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'question_bank'
      ORDER BY ordinal_position
    `;
    questionCols.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));

    // 看一条 knowledge_nodes 的实际数据
    console.log('\n=== 第一条 knowledge_nodes 完整数据 ===');
    const firstNode = await sql`SELECT * FROM knowledge_nodes LIMIT 1`;
    console.log(JSON.stringify(firstNode[0], null, 2));

    // 看一条 question_bank 的实际数据  
    console.log('\n=== 第一条 question_bank 完整数据 ===');
    const firstQuestion = await sql`SELECT * FROM question_bank LIMIT 1`;
    console.log(JSON.stringify(firstQuestion[0], null, 2));

    // 看 mind_maps 的数据
    console.log('\n=== mind_maps 数据 ===');
    const mindMap = await sql`SELECT id, name, data FROM mind_maps LIMIT 1`;
    if (mindMap[0]) {
      console.log('  id:', mindMap[0].id);
      console.log('  name:', mindMap[0].name);
      console.log('  data length:', mindMap[0].data ? mindMap[0].data.length : 0);
      if (mindMap[0].data) {
        const parsed = JSON.parse(mindMap[0].data);
        console.log('  data keys:', Object.keys(parsed));
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testColumns();
