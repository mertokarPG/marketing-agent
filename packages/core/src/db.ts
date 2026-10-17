import postgres from "postgres";

export interface Db {
  query<T = any>(text: string, params?: unknown[]): Promise<T[]>;
}

// Callers pass json/jsonb params already stringified (JSON.stringify(...)); postgres.js's default
// serializer would stringify them again and store a JSON *string*. Strings pass through as-is.
export function serializeJsonParam(x: unknown): string {
  return typeof x === "string" ? x : JSON.stringify(x);
}

export function createPostgresDb(url: string): Db & { end(): Promise<void> } {
  // prepare:false keeps us compatible with Supabase's transaction pooler.
  const sql = postgres(url, {
    prepare: false,
    max: 5,
    types: { json: { to: 114, from: [114, 3802], serialize: serializeJsonParam, parse: (x: string) => JSON.parse(x) } },
  });
  return {
    async query<T = any>(text: string, params: unknown[] = []) {
      return (await sql.unsafe(text, params as any[])) as unknown as T[];
    },
    end: () => sql.end(),
  };
}
