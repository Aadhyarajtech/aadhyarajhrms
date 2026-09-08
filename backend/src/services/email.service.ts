import nodemailer from "nodemailer";
import { env } from "@/config/env";

/* =========================================================
   SMTP CONFIGURATION
========================================================= */

const emailConfigured = Boolean(
  env.smtpHost &&
  env.smtpUser &&
  env.smtpPass &&
  env.smtpFrom &&
  !env.smtpUser.includes("your-email") &&
  !env.smtpPass.includes("your-gmail-app-password"),
);

/* =========================================================
   TRANSPORTER
========================================================= */

const transporter = emailConfigured
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
    console.warn("[Email] SMTP is not configured. Email skipped.");

    return {
      sent: false,
      skipped: true,
    };
  }

  try {
    const info = await transporter.sendMail({
      from: env.smtpFrom,

      to: input.to,

      subject: input.subject,

      text: input.text,

      html:
        input.html ??
        `<p>${escapeHtml(input.text).replace(/\n/g, "<br />")}</p>`,
    });

    console.log(`[Email] Sent to ${input.to}. Message ID: ${info.messageId}`);

    return {
      sent: true,
      skipped: false,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error(`[Email] Failed to send to ${input.to}:`, error);

    return {
      sent: false,
      skipped: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/* =========================================================
   SEND ANNOUNCEMENT EMAIL
========================================================= */

export async function sendAnnouncementEmail(input: {
  to: string;
  title: string;
  body: string;
}) {
  const title = escapeHtml(input.title);

  const body = escapeHtml(input.body).replace(/\n/g, "<br />");

  return sendEmail({
    to: input.to,

    subject: `[Aadhyaraj HRMS] ${input.title}`,

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
   RECRUITMENT EMAIL
========================================================= */

export async function sendRecruitmentEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  return sendEmail({
    to: input.to,
    subject: `[AadhyaRaj HRMS] ${input.subject}`,
    text: input.text,
    html: input.html,
  });
}

/* =========================================================
   ATTENDANCE REGULARIZATION REQUEST EMAIL
========================================================= */

export async function sendRegularizationRequestEmail(input: {
  to: string;
  employeeName: string;
  date: string;
  reason: string;
}) {
  const employeeName = escapeHtml(input.employeeName);
  const date = escapeHtml(input.date);
  const reason = escapeHtml(input.reason).replace(/\n/g, "<br />");

  return sendEmail({
    to: input.to,

    subject: "[Aadhyaraj HRMS] New Attendance Regularization Request",

    text:
      `New Attendance Regularization Request\n\n` +
      `Employee: ${input.employeeName}\n` +
      `Date: ${input.date}\n` +
      `Reason: ${input.reason}\n\n` +
      `Please log in to Aadhyaraj HRMS to review the request.`,

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
              New Attendance Regularization Request
            </h2>

            <p
              style="
                font-size:15px;
                line-height:1.7;
                color:#333333;
              "
            >
              A new attendance regularization request has been submitted
              and requires your review.
            </p>

            <div
              style="
                margin-top:20px;
                padding:18px;
                background:#f8fafc;
                border-radius:8px;
              "
            >
              <p><strong>Employee:</strong> ${employeeName}</p>
              <p><strong>Date:</strong> ${date}</p>
              <p><strong>Reason:</strong></p>
              <p>${reason}</p>
            </div>

            <div
              style="
                margin-top:25px;
              "
            >
              <a
                href="http://localhost:5173/app/attendance"
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
                Review Request
              </a>
            </div>

            <p
              style="
                margin-top:30px;
                color:#777777;
                font-size:12px;
              "
            >
              This email was sent by Aadhyaraj HRMS.
            </p>
          </div>
        </body>
      </html>
    `,
  });
}

/* =========================================================
   ATTENDANCE REGULARIZATION DECISION EMAIL
========================================================= */

export async function sendRegularizationDecisionEmail(input: {
  to: string;
  employeeName: string;
  date: string;
  status: "APPROVED" | "REJECTED";
  decisionNote?: string | null;
}) {
  const employeeName = escapeHtml(input.employeeName);
  const date = escapeHtml(input.date);

  const decision =
    input.status === "APPROVED"
      ? "approved"
      : "rejected";

  const title =
    input.status === "APPROVED"
      ? "Attendance Regularization Approved"
      : "Attendance Regularization Rejected";

  const decisionNote = input.decisionNote?.trim() ?? "";

  const escapedDecisionNote = escapeHtml(
    decisionNote,
  ).replace(/\n/g, "<br />");

  const noteText = decisionNote
    ? `\nDecision note: ${decisionNote}`
    : "";

  return sendEmail({
    to: input.to,

    subject: `[Aadhyaraj HRMS] ${title}`,

    text:
      `${title}\n\n` +
      `Hello ${input.employeeName},\n\n` +
      `Your attendance regularization request for ${input.date} has been ${decision}.` +
      noteText +
      `\n\nPlease log in to Aadhyaraj HRMS to view the updated attendance record.`,

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
              Hello ${employeeName},
            </p>

            <p
              style="
                font-size:15px;
                line-height:1.7;
                color:#333333;
              "
            >
              Your attendance regularization request for
              <strong>${date}</strong> has been
              <strong>${decision}</strong>.
            </p>

            ${
              decisionNote
                ? `
                  <div
                    style="
                      margin-top:20px;
                      padding:18px;
                      background:#f8fafc;
                      border-radius:8px;
                    "
                  >
                    <p style="margin-top:0;">
                      <strong>Decision Note</strong>
                    </p>

                    <p
                      style="
                        margin-bottom:0;
                        line-height:1.7;
                        color:#333333;
                      "
                    >
                      ${escapedDecisionNote}
                    </p>
                  </div>
                `
                : ""
            }

            <div
              style="
                margin-top:25px;
              "
            >
              <a
                href="http://localhost:5173/app/attendance"
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
                View Attendance
              </a>
            </div>

            <p
              style="
                margin-top:30px;
                color:#777777;
                font-size:12px;
              "
            >
              This email was sent by Aadhyaraj HRMS.
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
    console.warn("[Email] SMTP is not configured.");

    return false;
  }

  try {
    await transporter.verify();

    console.log("[Email] SMTP connection verified successfully.");

    return true;
  } catch (error) {
    console.error("[Email] SMTP connection failed:", error);

    return false;
  }
}

/* =========================================================
   HTML ESCAPE
========================================================= */

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
