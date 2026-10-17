import type { RunKind, StorageClient } from "@carepost/core";
export interface RunWindow { start: Date; end: Date }
export type NotifyFn = (subject: string, body: string, to: string[]) => Promise<unknown>;
export interface ToolContext { storage: StorageClient; runId: string | null; kind: RunKind; window: RunWindow; notify: NotifyFn }
