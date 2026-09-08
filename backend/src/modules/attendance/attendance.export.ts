import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { Attendance } from "@/db/models";

export interface AttendanceExportRow {
  date: string;
  employee: string;
  employeeCode: string;
  department: string;
  checkIn: string;
  checkOut: string;
  workHours: number;
  effectiveWorkHours: number;
  breakMinutes: number;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  overtimeHours: number;
  status: string;
}

function safeNumber(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export function buildAttendanceRows(records: any[]): AttendanceExportRow[] {
  return records.map((record) => ({
    date: String(record.date ?? ""),
    employee: `${record.firstName ?? ""} ${record.lastName ?? ""}`.trim(),
    employeeCode: String(record.employeeCode ?? ""),
    department: String(record.departmentName ?? ""),
    checkIn: record.checkIn ? String(record.checkIn) : "",
    checkOut: record.checkOut ? String(record.checkOut) : "",
    workHours: safeNumber(record.workHours),
    effectiveWorkHours: safeNumber(record.effectiveWorkHours),
    breakMinutes: safeNumber(record.breakMinutes),
    lateMinutes: safeNumber(record.lateMinutes),
    earlyDepartureMinutes: safeNumber(record.earlyDepartureMinutes),
    overtimeHours: safeNumber(record.overtimeHours),
    status: String(record.status ?? ""),
  }));
}

export async function createAttendanceExcel(rows: AttendanceExportRow[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Attendance");
  sheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Employee", key: "employee", width: 24 },
    { header: "Employee Code", key: "employeeCode", width: 16 },
    { header: "Department", key: "department", width: 20 },
    { header: "Check-in", key: "checkIn", width: 24 },
    { header: "Check-out", key: "checkOut", width: 24 },
    { header: "Work Hours", key: "workHours", width: 14 },
    { header: "Effective Hours", key: "effectiveWorkHours", width: 17 },
    { header: "Break Minutes", key: "breakMinutes", width: 15 },
    { header: "Late Minutes", key: "lateMinutes", width: 14 },
    { header: "Early Departure", key: "earlyDepartureMinutes", width: 18 },
    { header: "Overtime Hours", key: "overtimeHours", width: 16 },
    { header: "Status", key: "status", width: 20 },
  ];
  rows.forEach((row) => sheet.addRow(row));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "M1" };
  return workbook.xlsx.writeBuffer();
}

export async function createAttendancePdf(rows: AttendanceExportRow[]) {
  const document = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 24,
  });
  const chunks: Buffer[] = [];
  document.on("data", (chunk) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  document.fontSize(16).text("Attendance Report", { align: "center" });
  document.moveDown();
  document.fontSize(8);

  const headers = [
    "Date",
    "Employee",
    "Code",
    "Check-in",
    "Check-out",
    "Work",
    "Effective",
    "Late",
    "Early",
    "OT",
    "Status",
  ];
  const widths = [55, 105, 55, 75, 75, 42, 48, 38, 38, 38, 75];
  const drawRow = (values: string[]) => {
    let x = document.page.margins.left;
    const y = document.y;
    values.forEach((value, index) => {
      document.text(value, x, y, { width: widths[index], ellipsis: true });
      x += widths[index];
    });
    document.moveDown(1.8);
  };

  drawRow(headers);
  document
    .moveTo(document.page.margins.left, document.y)
    .lineTo(818, document.y)
    .stroke();
  rows.forEach((row) => {
    if (document.y > 545) {
      document.addPage();
      document.fontSize(8);
      drawRow(headers);
    }
    drawRow([
      row.date,
      row.employee,
      row.employeeCode,
      row.checkIn,
      row.checkOut,
      row.workHours.toFixed(2),
      row.effectiveWorkHours.toFixed(2),
      String(row.lateMinutes),
      String(row.earlyDepartureMinutes),
      row.overtimeHours.toFixed(2),
      row.status,
    ]);
  });

  document.end();
  return finished;
}
