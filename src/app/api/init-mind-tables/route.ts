import { sql } from '@/lib/db/neon-service';
import { authErrorResponse, requireAdmin } from '@/lib/server/auth';

export async function POST(request: Request) {
  try {
    await requireAdmin(request);

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
        pos_x FLOAT DEFAULT 0,
        pos_y FLOAT DEFAULT 0,
        width FLOAT DEFAULT 120,
        height FLOAT DEFAULT 40,
        expanded BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (mind_map_id) REFERENCES mind_map(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES map_node(id) ON DELETE CASCADE
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (mind_map_id) REFERENCES mind_map(id) ON DELETE CASCADE,
        FOREIGN KEY (source_node_id) REFERENCES map_node(id) ON DELETE CASCADE,
        FOREIGN KEY (target_node_id) REFERENCES map_node(id) ON DELETE CASCADE
      );
    `;

    await sql`
      ALTER TABLE mind_map ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'default_user';
    `;

    await sql`
      ALTER TABLE mind_map ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;
    `;

    await sql`
      ALTER TABLE map_node ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'default_user';
    `;

    await sql`
      ALTER TABLE map_node ADD COLUMN IF NOT EXISTS ps_score INTEGER DEFAULT 50;
    `;

    await sql`
      ALTER TABLE map_node ADD COLUMN IF NOT EXISTS last_practiced_at TIMESTAMP;
    `;

    await sql`
      ALTER TABLE map_edge ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT 'default_user';
    `;

    await sql`
      ALTER TABLE question_bank ADD COLUMN IF NOT EXISTS exam_paper TEXT;
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

    await sql`
      CREATE INDEX IF NOT EXISTS idx_map_node_mind_map_id ON map_node(mind_map_id);
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_mind_map_user_id ON mind_map(user_id);
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_map_node_user_id ON map_node(user_id);
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_map_edge_user_id ON map_edge(user_id);
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_map_node_parent_id ON map_node(parent_id);
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_map_edge_mind_map_id ON map_edge(mind_map_id);
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_behavior_events_user_id ON behavior_events(user_id);
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_behavior_events_question_id ON behavior_events(question_id);
    `;

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Mind map tables created successfully',
      }),
      { status: 200 }
    );
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;

    console.error('Failed to create mind map tables:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Failed to create mind map tables',
        error: (error as Error).message,
      }),
      { status: 500 }
    );
  }
}
