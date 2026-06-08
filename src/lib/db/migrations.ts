import { sql } from './neon-service';

export async function initTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS mind_map (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default_user',
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      root_node_id TEXT,
      settings JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`ALTER TABLE mind_map ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb`;
  await sql`
    CREATE TABLE IF NOT EXISTS map_node (
      id TEXT PRIMARY KEY,
      mind_map_id TEXT NOT NULL REFERENCES mind_map(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL DEFAULT 'default_user',
      parent_id TEXT REFERENCES map_node(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      content TEXT,
      markdown TEXT,
      node_type TEXT DEFAULT 'topic',
      color_tag TEXT DEFAULT '#3b82f6',
      ps_score INTEGER DEFAULT 50,
      last_practiced_at TIMESTAMP,
      pos_x DOUBLE PRECISION DEFAULT 0,
      pos_y DOUBLE PRECISION DEFAULT 0,
      width DOUBLE PRECISION DEFAULT 120,
      height DOUBLE PRECISION DEFAULT 40,
      expanded BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS map_edge (
      id TEXT PRIMARY KEY,
      mind_map_id TEXT NOT NULL REFERENCES mind_map(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL DEFAULT 'default_user',
      source_node_id TEXT NOT NULL REFERENCES map_node(id) ON DELETE CASCADE,
      target_node_id TEXT NOT NULL REFERENCES map_node(id) ON DELETE CASCADE,
      edge_type TEXT DEFAULT 'parent',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`ALTER TABLE map_node ADD COLUMN IF NOT EXISTS ps_score INTEGER DEFAULT 50`;
  await sql`ALTER TABLE map_node ADD COLUMN IF NOT EXISTS last_practiced_at TIMESTAMP`;

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
      type VARCHAR(50) DEFAULT 'real',
      reference TEXT,
      exam_paper TEXT,
      mind_map_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'real'`;
  await sql`ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS reference TEXT`;
  await sql`ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS exam_paper TEXT`;
  await sql`ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`;

  await sql`
    CREATE TABLE IF NOT EXISTS exam_papers (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      description TEXT,
      type VARCHAR(50) DEFAULT 'real',
      question_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, normalized_name)
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

  await sql`CREATE INDEX IF NOT EXISTS idx_mind_map_user_id ON mind_map(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_map_node_user_id ON map_node(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_map_node_mind_map_id ON map_node(mind_map_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_map_node_parent_id ON map_node(parent_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_map_edge_user_id ON map_edge(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_map_edge_mind_map_id ON map_edge(mind_map_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_question_bank_user_id ON question_bank(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_question_bank_deleted_at ON question_bank(user_id, deleted_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_exam_papers_user_id ON exam_papers(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_exam_papers_normalized_name ON exam_papers(user_id, normalized_name)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_answer_records_user_id ON answer_records(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_practice_sets_user_id ON practice_sets(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_behavior_events_user_id ON behavior_events(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_behavior_events_question_id ON behavior_events(question_id)`;
}
