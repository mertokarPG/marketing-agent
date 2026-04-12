import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendNotification } from "../../src/tools/notify.js";

vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: vi.fn().mockResolvedValue({ messageId: "msg-123" }),
    }),
  },
}));

beforeEach(() => {
  vi.stubEnv("SMTP_HOST", "smtp.test.com");
  vi.stubEnv("SMTP_PORT", "587");
  vi.stubEnv("SMTP_USER", "user@test.com");
  vi.stubEnv("SMTP_PASS", "password");
  vi.stubEnv("NOTIFY_EMAIL", "mert@test.com");
});

describe("sendNotification", () => {
  it("sends email and returns confirmation", async () => {
    const result = await sendNotification(
      "Daily Summary",
      "Posted 1 image today."
    );
    expect(result).toContain("sent");
  });

  it("falls back to console when SMTP not configured", async () => {
    vi.stubEnv("SMTP_HOST", "");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await sendNotification("Test", "Body");
    expect(result).toContain("logged to console");

    consoleSpy.mockRestore();
  });
});
