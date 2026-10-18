const MESSAGES: Record<string, string> = {
  caption_too_long: "That caption is too long for Instagram. Please shorten it.",
  in_past: "That time has already passed. Pick a time in the future.",
  invalid_input: "Please check what you entered and try again.",
  invalid_media: "Something is wrong with the images on this post. Please check them and try again.",
  needs_new_time: "This post needs a new time before it can be approved.",
  not_allowed: "You don't have permission to do that.",
  not_editable: "This post can't be changed any more.",
  not_found: "We couldn't find that post.",
  paused: "Posting is paused for this brand.",
  redo_limit: "You've used the redos for this post. Edit it yourself or skip it.",
  reworking: "The agent is already reworking this post. Give it a moment.",
  too_close: "Too close to posting time to rework. Edit it yourself or skip it.",
};
const FALLBACK = "Something went wrong. Please try again.";

export function rpcErrorMessage(err: { message?: string }): string {
  const m = /carepost:([a-z_]+)/.exec(err?.message ?? "");
  return (m && MESSAGES[m[1]]) || FALLBACK;
}
