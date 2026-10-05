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
   NEW EMPLOYEE TEMPORARY CREDENTIALS EMAIL
========================================================= */

export async function sendEmployeeWelcomeCredentialsEmail(input: {
  to: string;
  firstName: string;
  lastName: string;
  temporaryPassword: string;
}) {
  const firstName = escapeHtml(input.firstName);
  const lastName = escapeHtml(input.lastName);
  const email = escapeHtml(input.to);
  const password = escapeHtml(input.temporaryPassword);

  return sendEmail({
    to: input.to,
    subject: "Welcome to Aadhyaraj HRMS - Your Login Details",
    text:
      `Hello ${input.firstName} ${input.lastName},\n\n` +
      `Your Aadhyaraj HRMS account has been created.\n\n` +
      `Login email: ${input.to}\n` +
      `Temporary password: ${input.temporaryPassword}\n\n` +
      `Please sign in and change your password immediately. Do not share these credentials.\n\n` +
      `Regards,\nAadhyaraj HRMS Team`,
    html: `
      <!DOCTYPE html>
      <html>
        <body style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
          <div style="max-width:600px;margin:auto;background:#fff;border-radius:12px;padding:28px;">
            <h2 style="margin-top:0;color:#111827;">Welcome to Aadhyaraj HRMS</h2>
            <p>Hello ${firstName} ${lastName},</p>
            <p>Your employee account has been created. Use the credentials below to sign in:</p>
            <div style="padding:16px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;">
              <p style="margin:4px 0;"><strong>Login email:</strong> ${email}</p>
              <p style="margin:12px 0 4px;"><strong>Temporary password:</strong></p>
              <p style="margin:4px 0;font-family:monospace;font-size:16px;word-break:break-all;">${password}</p>
            </div>
            <p style="margin-top:20px;"><strong>Important:</strong> Change your password immediately after your first login. Do not share these credentials.</p>
            <p>Regards,<br />Aadhyaraj HRMS Team</p>
          </div>
        </body>
      </html>
    `,
  });
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

    subject: `Aadhyaraj Technologies ${input.title}`,

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
   TICKET EMAILS
========================================================= */

export async function sendTicketEmail(input: {
  to: string;
  event: "CREATED" | "REPLY" | "STATUS" | "ESCALATED";
  ticketId: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  description?: string | null;
  response?: string | null;
  responderName?: string | null;
  responderRole?: string | null;
  reason?: string | null;
  attachment?: string | null;
}) {
  const safeTicketId = escapeHtml(input.ticketId);
  const safeSubject = escapeHtml(input.subject);
  const safeCategory = escapeHtml(input.category);
  const safePriority = escapeHtml(input.priority);
  const safeStatus = escapeHtml(input.status);
  const safeDescription = escapeHtml(input.description || "").replace(/\n/g, "<br />");
  const safeResponse = escapeHtml(input.response || "").replace(/\n/g, "<br />");
  const safeResponder = escapeHtml(input.responderName || "HRMS User");
  const safeRole = escapeHtml(input.responderRole || "");
  const safeReason = escapeHtml(input.reason || "").replace(/\n/g, "<br />");

  let title = "Ticket Update";
  let text = "";

  if (input.event === "CREATED") {
    title = "New Ticket Created";
    text =
      `Your ticket has been created successfully.\n\n` +
      `Ticket ID: ${input.ticketId}\n` +
      `Subject: ${input.subject}\n` +
      `Category: ${input.category}\n` +
      `Priority: ${input.priority}\n` +
      `Status: ${input.status}\n\n` +
      `Description:\n${input.description || ""}`;
  } else if (input.event === "REPLY") {
    title = "New Response on Your Ticket";
    text =
      `There is a new response on your ticket.\n\n` +
      `Ticket ID: ${input.ticketId}\n` +
      `Subject: ${input.subject}\n` +
      `Status: ${input.status}\n` +
      `Responded by: ${input.responderName || "HRMS User"}` +
      (input.responderRole ? ` (${input.responderRole})` : "") +
      `\n\nResponse:\n${input.response || ""}`;
  } else if (input.event === "STATUS") {
    title = "Ticket Status Updated";
    text =
      `The status of your ticket has been updated.\n\n` +
      `Ticket ID: ${input.ticketId}\n` +
      `Subject: ${input.subject}\n` +
      `New Status: ${input.status}\n` +
      `Updated by: ${input.responderName || "HRMS User"}` +
      (input.responderRole ? ` (${input.responderRole})` : "");
  } else {
    title = "Ticket Escalated";
    text =
      `Your ticket has been escalated.\n\n` +
      `Ticket ID: ${input.ticketId}\n` +
      `Subject: ${input.subject}\n` +
      `Status: ${input.status}\n` +
      `Escalated by: ${input.responderName || "HRMS User"}\n\n` +
      `Reason:\n${input.reason || ""}`;
  }

  const extraHtml =
    input.event === "CREATED"
      ? `<h3 style="margin:22px 0 8px;color:#111827;">Description</h3><p style="font-size:14px;line-height:1.7;color:#374151;">${safeDescription}</p>`
      : input.event === "REPLY"
        ? `<h3 style="margin:22px 0 8px;color:#111827;">Response</h3><div style="padding:14px;background:#f8fafc;border-radius:8px;font-size:14px;line-height:1.7;color:#374151;">${safeResponse}</div>`
        : input.event === "ESCALATED"
          ? `<h3 style="margin:22px 0 8px;color:#111827;">Escalation Reason</h3><p style="font-size:14px;line-height:1.7;color:#374151;">${safeReason}</p>`
          : "";

  const responderHtml =
    input.event === "REPLY" || input.event === "STATUS" || input.event === "ESCALATED"
      ? `<p style="font-size:14px;color:#4b5563;"><strong>Updated by:</strong> ${safeResponder}${safeRole ? ` (${safeRole})` : ""}</p>`
      : "";

  const attachmentHtml = input.attachment
    ? `<p style="font-size:13px;color:#6b7280;"><strong>Attachment:</strong> ${escapeHtml(input.attachment)}</p>`
    : "";

  return sendEmail({
    to: input.to,
    subject: `[Aadhyaraj HRMS] ${title} - ${input.ticketId}`,
    text,
    html: `
      <!DOCTYPE html>
      <html>
        <body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;">
          <div style="max-width:640px;margin:30px auto;background:#ffffff;border-radius:12px;padding:30px;box-sizing:border-box;">
            <h2 style="margin:0 0 20px;color:#111827;">${escapeHtml(title)}</h2>
            <div style="padding:16px;background:#f8fafc;border-radius:10px;">
              <p style="margin:0 0 8px;font-size:14px;color:#374151;"><strong>Ticket ID:</strong> ${safeTicketId}</p>
              <p style="margin:0 0 8px;font-size:14px;color:#374151;"><strong>Subject:</strong> ${safeSubject}</p>
              <p style="margin:0 0 8px;font-size:14px;color:#374151;"><strong>Category:</strong> ${safeCategory}</p>
              <p style="margin:0 0 8px;font-size:14px;color:#374151;"><strong>Priority:</strong> ${safePriority}</p>
              <p style="margin:0;font-size:14px;color:#374151;"><strong>Status:</strong> ${safeStatus}</p>
            </div>
            ${responderHtml}
            ${extraHtml}
            ${attachmentHtml}
            <p style="margin-top:28px;color:#777;font-size:12px;">This email was sent automatically by Aadhyaraj HRMS.</p>
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
   PASSWORD RESET OTP EMAIL
========================================================= */

export async function sendPasswordResetOtpEmail(input: {
  to: string;
  otp: string;
  expiresInMinutes: number;
}) {
  const otp = escapeHtml(input.otp);
  const expiresInMinutes = input.expiresInMinutes;

  return sendEmail({
    to: input.to,
    subject: "Aadhyaraj Technologies - Password Reset OTP",
    text:
      `Your Aadhyaraj HRMS password reset OTP is: ${input.otp}\n\n` +
      `This OTP expires in ${expiresInMinutes} minutes.\n` +
      `If you did not request a password reset, you can ignore this email.`,
    html: `
      <!DOCTYPE html>
      <html>
        <body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;">
          <div style="max-width:600px;margin:30px auto;background:#ffffff;border-radius:12px;padding:30px;box-sizing:border-box;">
            <h2 style="margin-top:0;color:#111827;">Reset your Aadhyaraj HRMS password</h2>
            <p style="font-size:15px;line-height:1.7;color:#333333;">
              Use the OTP below to reset your password.
            </p>
            <div style="margin:24px 0;padding:18px;text-align:center;background:#f8fafc;border-radius:10px;">
              <span style="font-size:32px;letter-spacing:8px;font-weight:700;color:#4f46e5;">${otp}</span>
            </div>
            <p style="font-size:14px;color:#555555;">This OTP expires in ${expiresInMinutes} minutes.</p>
            <p style="font-size:12px;color:#777777;margin-top:28px;">
              If you did not request a password reset, you can safely ignore this email.
            </p>
            <p style="font-size:12px;color:#777777;">This email was sent by Aadhyaraj Technologies.</p>
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
