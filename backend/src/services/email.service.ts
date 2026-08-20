import nodemailer from "nodemailer";
import { env } from "@/config/env";

/* =========================================================
   SMTP CONFIGURATION
========================================================= */

const emailConfigured =
  Boolean(
    env.smtpHost &&
      env.smtpUser &&
      env.smtpPass &&
      env.smtpFrom &&
      !env.smtpUser.includes(
        "your-email",
      ) &&
      !env.smtpPass.includes(
        "your-gmail-app-password",
      ),
  );

/* =========================================================
   TRANSPORTER
========================================================= */

const transporter =
  emailConfigured
    ? nodemailer.createTransport({
        host: env.smtpHost,

        port: env.smtpPort,

        secure: env.smtpSecure,

        auth: {
          user: env.smtpUser,
          pass: env.smtpPass,
        },
      })
    : null;

/* =========================================================
   SEND EMAIL
========================================================= */

export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  if (!transporter) {
    console.warn(
      "[Email] SMTP is not configured. Email skipped.",
    );

    return {
      sent: false,
      skipped: true,
    };
  }

  try {
    const info =
      await transporter.sendMail({
        from: env.smtpFrom,

        to: input.to,

        subject:
          input.subject,

        text:
          input.text,

        html:
          input.html ??
          `<p>${escapeHtml(
            input.text,
          ).replace(
            /\n/g,
            "<br />",
          )}</p>`,
      });

    console.log(
      `[Email] Sent to ${input.to}. Message ID: ${info.messageId}`,
    );

    return {
      sent: true,
      skipped: false,
      messageId:
        info.messageId,
    };
  } catch (error) {
    console.error(
      `[Email] Failed to send to ${input.to}:`,
      error,
    );

    return {
      sent: false,
      skipped: false,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    };
  }
}

/* =========================================================
   SEND ANNOUNCEMENT EMAIL
========================================================= */

export async function sendAnnouncementEmail(
  input: {
    to: string;
    title: string;
    body: string;
  },
) {
  const title =
    escapeHtml(input.title);

  const body =
    escapeHtml(input.body).replace(
      /\n/g,
      "<br />",
    );

  return sendEmail({
    to: input.to,

    subject:
      `[Aadhyaraj HRMS] ${input.title}`,

    text:
      `${input.title}\n\n` +
      `${input.body}\n\n` +
      `View announcement: ` +
      `http://localhost:5173/app/announcements`,

    html: `
      <!DOCTYPE html>
      <html>
        <body
          style="
            margin:0;
            padding:0;
            background:#f5f7fb;
            font-family:Arial,Helvetica,sans-serif;
          "
        >
          <div
            style="
              max-width:600px;
              margin:30px auto;
              background:#ffffff;
              border-radius:12px;
              padding:30px;
              box-sizing:border-box;
            "
          >
            <h2
              style="
                margin-top:0;
                margin-bottom:20px;
              "
            >
              ${title}
            </h2>

            <p
              style="
                font-size:15px;
                line-height:1.7;
                color:#333333;
              "
            >
              ${body}
            </p>

            <div
              style="
                margin-top:25px;
              "
            >
              <a
                href="http://localhost:5173/app/announcements"
                target="_blank"
                rel="noopener noreferrer"
                style="
                  display:inline-block;
                  padding:12px 20px;
                  background:#4f46e5;
                  color:#ffffff;
                  text-decoration:none;
                  border-radius:8px;
                "
              >
                View Announcement
              </a>
            </div>

            <p
              style="
                margin-top:30px;
                color:#777777;
                font-size:12px;
              "
            >
              This email was sent by
              Aadhyaraj HRMS.
            </p>
          </div>
        </body>
      </html>
    `,
  });
}

/* =========================================================
   VERIFY SMTP CONNECTION
========================================================= */

export async function verifyEmailConnection() {
  if (!transporter) {
    console.warn(
      "[Email] SMTP is not configured.",
    );

    return false;
  }

  try {
    await transporter.verify();

    console.log(
      "[Email] SMTP connection verified successfully.",
    );

    return true;
  } catch (error) {
    console.error(
      "[Email] SMTP connection failed:",
      error,
    );

    return false;
  }
}

/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHtml(
  value: string,
) {
  return value
    .replace(
      /&/g,
      "&amp;",
    )
    .replace(
      /</g,
      "&lt;",
    )
    .replace(
      />/g,
      "&gt;",
    )
    .replace(
      /"/g,
      "&quot;",
    )
    .replace(
      /'/g,
      "&#039;",
    );
}