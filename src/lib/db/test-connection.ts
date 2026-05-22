import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function testConnection() {
  try {
    console.log('Testing database connection...');
    
    const result = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    
    console.log('Tables in database:', result.map(r => r.table_name));
    
    process.exit(0);
  } catch (error) {
    console.error('Connection error:', error);
    process.exit(1);
  }
}

testConnection();
