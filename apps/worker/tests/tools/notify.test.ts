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

  it("sends to explicit recipients when given", async () => {
    const result = await sendNotification("Timely post", "body", { to: ["a@x.be", "b@x.be"] });
    expect(result).toContain("a@x.be, b@x.be");
  });

  it("falls back to OWNER_EMAIL when NOTIFY_EMAIL is unset", async () => {
    vi.stubEnv("NOTIFY_EMAIL", "");
    vi.stubEnv("OWNER_EMAIL", "owner@x.be");
    expect(await sendNotification("Weekly plan", "body")).toBe('Notification sent to owner@x.be: "Weekly plan"');
  });

  it("prefers NOTIFY_EMAIL over OWNER_EMAIL", async () => {
    vi.stubEnv("OWNER_EMAIL", "owner@x.be");
    expect(await sendNotification("Weekly plan", "body")).toBe('Notification sent to mert@test.com: "Weekly plan"');
  });
});
