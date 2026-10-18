import { describe, it, expect } from "vitest";
import { rpcErrorMessage } from "./rpc-errors";

const codes = ["caption_too_long","in_past","invalid_input","invalid_media","needs_new_time","not_allowed","not_editable","not_found","paused","redo_limit","reworking","too_close"];
describe("rpcErrorMessage", () => {
  it.each(codes)("maps carepost:%s to plain copy", (c) => {
    const m = rpcErrorMessage({ message: `carepost:${c}` });
    expect(m).not.toContain("carepost:");
    expect(m).not.toBe("Something went wrong. Please try again.");
  });
  it("specific copy", () => {
    expect(rpcErrorMessage({ message: "carepost:too_close" })).toBe("Too close to posting time to rework. Edit it yourself or skip it.");
    expect(rpcErrorMessage({ message: "carepost:redo_limit" })).toBe("You've used the redos for this post. Edit it yourself or skip it.");
    expect(rpcErrorMessage({ message: "carepost:invalid_input" })).toBe("Please check what you entered and try again.");
  });
  it("tolerates wrapped messages and unknowns", () => {
    expect(rpcErrorMessage({ message: "ERROR: carepost:paused (P0001)" })).not.toBe("Something went wrong. Please try again.");
    expect(rpcErrorMessage({ message: "boom" })).toBe("Something went wrong. Please try again.");
    expect(rpcErrorMessage({})).toBe("Something went wrong. Please try again.");
  });
});
