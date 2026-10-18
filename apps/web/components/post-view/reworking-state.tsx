"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { reworkingText } from "@/lib/redo";

const POLL_MS = 10_000;

/**
 * Shown while the agent reworks the post. Re-reads the post every 10 seconds; once the status
 * changes this unmounts, which stops the polling (as does closing the post).
 */
export function ReworkingState({ feedback, minutes }: { feedback: string | null; minutes: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) router.refresh(); }, POLL_MS);
    return () => clearInterval(t);
  }, [router]);
  return (
    <div className="pv-note reworking" role="status">
      <p className="rw-t">{reworkingText(feedback, minutes)}</p>
      <p className="cap-help">You can close this. The new version comes back here for your OK.</p>
    </div>
  );
}
