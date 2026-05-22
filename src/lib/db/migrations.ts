import { sql } from './neon-service';

export async function initTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS mind_maps (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      data JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS question_bank (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      question_text TEXT NOT NULL,
      option_a TEXT,
      option_b TEXT,
      option_c TEXT,
      option_d TEXT,
      correct_answer VARCHAR(10) NOT NULL,
      explanation TEXT,
      knowledge_path VARCHAR(500),
      linked_angle_id VARCHAR(255),
      source VARCHAR(50) DEFAULT 'manual',
      mind_map_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS answer_records (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      question_id VARCHAR(255) NOT NULL,
      selected_answer VARCHAR(10),
      is_correct BOOLEAN NOT NULL,
      practice_mode VARCHAR(50) DEFAULT 'single',
      practice_set_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS practice_sets (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      question_ids JSONB,
      mode VARCHAR(50) DEFAULT 'exam',
      time_limit INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_mind_maps_user_id ON mind_maps(user_id);
    CREATE INDEX IF NOT EXISTS idx_question_bank_user_id ON question_bank(user_id);
    CREATE INDEX IF NOT EXISTS idx_answer_records_user_id ON answer_records(user_id);
    CREATE INDEX IF NOT EXISTS idx_practice_sets_user_id ON practice_sets(user_id);
  `;
}
