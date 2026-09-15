import cron from "node-cron";
import { Employee, User, DocumentRecord } from "@/db/models";
import { notify } from "@/modules/notifications/notifications.repository";
import { nowIso } from "@/db/connection";

function dateOnly(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function getExpiryBucket(diffDays: number) {
  if (diffDays < 0) return "expired";
  if (diffDays <= 7) return "7d";
  return "30d";
}

function getExpiryMessage(
  documentName: string,
  employeeName: string,
  expiryDate: string,
  diffDays: number,
) {
  if (diffDays < 0) {
    return `${documentName} for ${employeeName} expired on ${expiryDate}.`;
  }

  return `${documentName} for ${employeeName} expires on ${expiryDate} (${diffDays} day${
    diffDays === 1 ? "" : "s"
  } remaining).`;
}

async function sendExpiryNotification({
  employeeId,
  employeeUserId,
  employeeName,
  documentName,
  expiryDate,
  recipients,
}: {
  employeeId: string;
  employeeUserId?: string | null;
  employeeName: string;
  documentName: string;
  expiryDate: string;
  recipients: string[];
}) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const expiry = dateOnly(expiryDate);

  if (Number.isNaN(expiry.getTime())) {
    return;
  }

  const diffDays = Math.ceil(
    (expiry.getTime() - today.getTime()) / 86400000,
  );

  // Only notify for expired documents or documents expiring
  // within the next 30 days.
  if (diffDays > 30) {
    return;
  }

  const bucket = getExpiryBucket(diffDays);

  const title =
    diffDays < 0
      ? "Document expired"
      : "Document expiry reminder";

  const message = getExpiryMessage(
    documentName,
    employeeName,
    expiryDate.slice(0, 10),
    diffDays,
  );

  const uniqueRecipients = new Set(recipients);

  if (employeeUserId) {
    uniqueRecipients.add(employeeUserId);
  }

  for (const userId of uniqueRecipients) {
    await notify({
      userId,
      type: "DOCUMENT_EXPIRY",
      title,
      message,
      link: `/employees/${employeeId}`,
      dedupeKey:
        `document-expiry:${employeeId}:${documentName}:${expiryDate.slice(
          0,
          10,
        )}:${bucket}:${userId}`,
    });
  }
}

export async function checkDocumentExpiryAlerts() {
  const employees = await Employee.find({
    status: {
      $in: [
        "ACTIVE",
        "ON_PROBATION",
        "ONBOARDING",
        "NOTICE_PERIOD",
      ],
    },
  })
    .select("_id userId firstName lastName certifications")
    .lean();

  const hrUsers = await User.find({
    role: {
      $in: ["SUPER_ADMIN", "HR_ADMIN"],
    },
    isActive: true,
  })
    .select("_id")
    .lean();

  const hrUserIds = hrUsers.map((user) => user._id);

  /*
   * ---------------------------------------------------------
   * 1. Employee certifications / documents
   * ---------------------------------------------------------
   */

  for (const employee of employees) {
    const employeeName =
      `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() ||
      "Employee";

    for (const certification of employee.certifications ?? []) {
      if (!certification.expiryDate) {
        continue;
      }

      await sendExpiryNotification({
        employeeId: employee._id,
        employeeUserId: employee.userId,
        employeeName,
        documentName:
          certification.name || "Certification/document",
        expiryDate: certification.expiryDate,
        recipients: hrUserIds,
      });
    }
  }

  /*
   * ---------------------------------------------------------
   * 2. Uploaded employee documents
   * ---------------------------------------------------------
   */

  const documentRecords = await DocumentRecord.find({
    expiryDate: {
      $ne: null,
    },
    employeeId: {
      $in: employees.map((employee) => employee._id),
    },
  })
    .select("_id employeeId fileName type expiryDate")
    .lean();

  const employeeMap = new Map(
    employees.map((employee) => [
      employee._id.toString(),
      employee,
    ]),
  );

  for (const document of documentRecords) {
    if (!document.expiryDate) {
      continue;
    }

    const employee = employeeMap.get(
      document.employeeId.toString(),
    );

    if (!employee) {
      continue;
    }

    const employeeName =
      `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() ||
      "Employee";

    await sendExpiryNotification({
      employeeId: employee._id,
      employeeUserId: employee.userId,
      employeeName,
      documentName:
        document.fileName ||
        document.type ||
        "Employee document",
      expiryDate: document.expiryDate,
      recipients: hrUserIds,
    });
  }

  console.log(
    `[Document Expiry] Alerts processed at ${nowIso()}`,
  );
}

export function startDocumentExpiryJob() {
  cron.schedule(
    "0 9 * * *",
    async () => {
      try {
        await checkDocumentExpiryAlerts();
      } catch (error) {
        console.error(
          "[Document Expiry] Failed to process alerts:",
          error,
        );
      }
    },
    {
      timezone: "Asia/Kolkata",
    },
  );

  console.log(
    "[Document Expiry] Job scheduled for 09:00 IST daily.",
  );
}