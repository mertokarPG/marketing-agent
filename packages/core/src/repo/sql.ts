/** ISO-8601 UTC text for a timestamptz column, e.g. 2026-10-19T08:00:00Z (keeps legacy string consumers working). */
export const iso = (col: string) => `to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
