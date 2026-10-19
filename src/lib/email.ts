import 'server-only';

import nodemailer from 'nodemailer';

// Plain SMTP so the provider can change through .env.local alone (currently Resend)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  // Port 465 uses TLS from the start; 587 upgrades with STARTTLS
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

interface SendEmailProps {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export const sendEmail = async ({ to, subject, text, html }: SendEmailProps) => {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    text,
    html,
  });
};

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

interface ActionEmailProps {
  to: string;
  name: string;
  subject: string;
  intro: string;
  buttonLabel: string;
  url: string;
  outro: string;
}

// A short message with one link, as both plain text and simple HTML
export const sendActionEmail = ({
  to,
  name,
  subject,
  intro,
  buttonLabel,
  url,
  outro,
}: ActionEmailProps) => {
  const greeting = `Hi ${name},`;

  const text = [greeting, intro, `${buttonLabel}: ${url}`, outro].join(
    '\n\n',
  );

  const html = `
    <p>${escapeHtml(greeting)}</p>
    <p>${escapeHtml(intro)}</p>
    <p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#ffffff;border-radius:6px;text-decoration:none">${escapeHtml(buttonLabel)}</a></p>
    <p style="color:#6b7280;font-size:13px">If the button doesn't work, copy this link into your browser:<br>${escapeHtml(url)}</p>
    <p style="color:#6b7280;font-size:13px">${escapeHtml(outro)}</p>
  `;

  return sendEmail({ to, subject, text, html });
};
