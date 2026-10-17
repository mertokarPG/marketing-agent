import nodemailer from "nodemailer";

export async function sendNotification(
  subject: string,
  body: string,
  opts: { to?: string[] } = {}
): Promise<string> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const notifyEmail = process.env.NOTIFY_EMAIL;

  const recipients = opts.to && opts.to.length > 0 ? opts.to : notifyEmail ? [notifyEmail] : [];

  if (!smtpHost || recipients.length === 0) {
    console.log(`[Notification] ${subject}\n${body}`);
    return `Notification logged to console (SMTP not configured): "${subject}"`;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(smtpPort ?? 587),
      secure: Number(smtpPort ?? 587) === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: smtpUser,
      to: recipients.join(", "),
      subject: `[Marketing Agent] ${subject}`,
      text: body,
    });

    return `Notification sent to ${recipients.join(", ")}: "${subject}"`;
  } catch (error) {
    console.log(`[Notification FAILED] ${subject}\n${body}`);
    return `Failed to send notification: ${error instanceof Error ? error.message : String(error)}. Logged to console instead.`;
  }
}
