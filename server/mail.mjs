import nodemailer from "nodemailer";

// SMTP is configured through env vars so any provider works
// (SES, Resend, Gmail app password, Mailgun, ...):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
let transport = null;

function getTransport() {
  if (!process.env.SMTP_HOST) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return transport;
}

export function mailConfigured() {
  return Boolean(process.env.SMTP_HOST);
}

export async function sendVerificationEmail(email, name, code) {
  const smtp = getTransport();
  if (!smtp) {
    // Dev fallback: no SMTP configured, surface the code in the server log so
    // local signups still work. Never rely on this in production.
    console.warn(`[mail] SMTP not configured. Verification code for ${email}: ${code}`);
    return;
  }
  await smtp.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: email,
    subject: `${code} is your LinguaSure code`,
    text: [
      `Hi ${name},`,
      "",
      `Your LinguaSure verification code is: ${code}`,
      "",
      "It expires in 15 minutes. If you did not create an account, ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 420px; margin: 0 auto;">
        <h2 style="margin: 24px 0 8px;">LinguaSure</h2>
        <p>Hi ${name},</p>
        <p>Your verification code is:</p>
        <p style="font-size: 32px; letter-spacing: 8px; font-weight: 700; margin: 16px 0;">${code}</p>
        <p style="color: #666;">It expires in 15 minutes. If you did not create an account, ignore this email.</p>
      </div>
    `,
  });
}
