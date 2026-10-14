import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { Pool } from 'pg';

type QueryRow = Record<string, any>;
type SqlTag = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<QueryRow[]>;
  query: (text: string, params?: unknown[]) => Promise<QueryRow[]>;
};

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const databaseHost = new URL(databaseUrl).hostname;
const usesNeonHttp = databaseHost.endsWith('.neon.tech');

function createPgSql(connectionString: string): SqlTag {
  const globalDatabase = globalThis as typeof globalThis & { __gongkaoPgPool?: Pool };
  const pool = globalDatabase.__gongkaoPgPool ?? new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  globalDatabase.__gongkaoPgPool = pool;

  const pgSql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0];
    values.forEach((_, index) => {
      text += `$${index + 1}${strings[index + 1]}`;
    });
    const result = await pool.query(text, values);
    return result.rows;
  }) as SqlTag;

  pgSql.query = async (text: string, params: unknown[] = []) => {
    const result = await pool.query(text, params);
    return result.rows;
  };

  return pgSql;
}

function createNeonSql(connectionString: string): SqlTag {
  const neonSql = neon(connectionString);
  const sqlTag = ((strings: TemplateStringsArray, ...values: unknown[]) => (
    neonSql(strings, ...values)
  )) as unknown as SqlTag;
  sqlTag.query = async (text: string, params: unknown[] = []) => neonSql.query(text, params) as Promise<QueryRow[]>;
  return sqlTag;
}

export const sql = usesNeonHttp ? createNeonSql(databaseUrl) : createPgSql(databaseUrl);
export const databaseDriver = usesNeonHttp ? 'neon-http' : 'postgres-pool';
