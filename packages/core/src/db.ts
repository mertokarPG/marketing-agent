import postgres from "postgres";

export interface Db {
  query<T = any>(text: string, params?: unknown[]): Promise<T[]>;
}

export function createPostgresDb(url: string): Db & { end(): Promise<void> } {
  // prepare:false keeps us compatible with Supabase's transaction pooler.
  const sql = postgres(url, { prepare: false, max: 5 });
  return {
    async query<T = any>(text: string, params: unknown[] = []) {
      return (await sql.unsafe(text, params as any[])) as unknown as T[];
    },
    end: () => sql.end(),
  };
}
