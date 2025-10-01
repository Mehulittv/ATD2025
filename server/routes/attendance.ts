import { RequestHandler, Router } from "express";
import * as XLSX from "xlsx";
import fs from "fs";
import {
  AttendanceResponse,
  AttendanceSummary,
  Employee,
  EmployeesResponse,
  DailyAttendanceResponse,
  DayStatus,
} from "@shared/api";
import { getFilePath } from "./files";

export const attendanceRouter = Router();

function detectFirstDayCol(ws: XLSX.WorkSheet, dataRowIndex: number): number {
  // Heuristic: detect start of daily columns from the employee row itself
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  const maxC = range.e.c;
  const otRow = dataRowIndex + 1;
  let bestCol = 3; // default near D
  let bestScore = -1;
  for (let c = 3; c <= Math.min(maxC, 20); c++) {
    let score = 0;
    let codeHits = 0;
    for (let d = 0; d < 10 && c + d <= maxC; d++) {
      const v = normalizeStr(ws[XLSX.utils.encode_cell({ r: dataRowIndex, c: c + d })]?.v).toUpperCase();
      const cls = classifyCell(v);
      if (cls.present || cls.absent || cls.weekoff) {
        score += 3;
        codeHits++;
      } else if (!v) {
        score += 1; // blanks are common in daily grid
      } else if (v.length > 3) {
        score -= 3; // likely non-day text (e.g., Department)
      }
      const otV = normalizeStr(ws[XLSX.utils.encode_cell({ r: otRow, c: c + d })]?.v);
      if (otV && !Number.isNaN(Number.parseFloat(otV))) score += 1;
    }
    if (codeHits < 2) score -= 5; // ensure it's really a daily region
    if (score > bestScore) {
      bestScore = score;
      bestCol = c;
    }
  }
  return bestCol;
}

function getDailyStatuses(ws: XLSX.WorkSheet, rowIndex: number): DayStatus[] {
  const days: DayStatus[] = [];
  const startCol = detectFirstDayCol(ws, rowIndex);
  for (let day = 1; day <= 31; day++) {
    const c = startCol + (day - 1); // dynamic start for day 1
    const cell = ws[XLSX.utils.encode_cell({ r: rowIndex, c })];
    const cls = classifyCell(cell?.v);
    let code: DayStatus["code"] = "";
    if (cls.weekoff) code = "WO";
    else if (cls.absent) code = "A";
    else if (cls.present) code = "P";

    // Try to read OT from the same cell (e.g., "P OT 2")
    const sameCell = normalizeStr(cell?.v).toUpperCase();
    const otInlineMatch = sameCell.match(/OT\s*([0-9]+(?:\.[0-9]+)?)?/);
    let ot = otInlineMatch && otInlineMatch[1] ? parseFloat(otInlineMatch[1]) : 0;

    // If not present inline, look for OT value on the next row (rowIndex + 1) in the same day column
    if (!ot || Number.isNaN(ot)) {
      const nextCell = ws[XLSX.utils.encode_cell({ r: rowIndex + 1, c })];
      const nextVal = normalizeStr(nextCell?.v);
      const parsedNext = Number.parseFloat(nextVal);
      if (!Number.isNaN(parsedNext)) ot = parsedNext;
    }

    days.push({ day, code, ot: Number.isNaN(ot) ? 0 : ot });
  }
  return days;
}

function normalizeStr(v: unknown): string {
  return String(v ?? "").trim();
}

function isIgnored(v: string): boolean {
  const s = String(v ?? "").trim();
  if (!s) return true;
  if (/^no\.?$/i.test(s)) return true; // header/identifier
  if (s === ".") return true; // ignore rows where cell is only a dot
  return false;
}

function toUpperNoSpaces(s: string) {
  return s.replace(/\s+/g, " ").trim().toUpperCase();
}

function normalizeForCompare(s: string) {
  return s.replace(/[.]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

function findPresentSheet(wb: XLSX.WorkBook): XLSX.WorkSheet | null {
  const sheetName = wb.SheetNames.find((n) => {
    const s = n.toLowerCase().trim();
    return s.includes("present") || s.includes("presant");
  });
  if (!sheetName) return null;
  return wb.Sheets[sheetName] ?? null;
}

function readEmployeesFromSheet(ws: XLSX.WorkSheet): Employee[] {
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  const employees: Employee[] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const cellB = ws[XLSX.utils.encode_cell({ r, c: 1 })]; // column B (1)
    const cellC = ws[XLSX.utils.encode_cell({ r, c: 2 })]; // column C (2)
    const number = normalizeStr(cellB?.v);
    const name = normalizeStr(cellC?.v);
    if (isIgnored(number) || isIgnored(name)) continue;
    employees.push({ number, name });
  }
  // Dedupe by employee number or name
  const map = new Map<string, Employee>();
  for (const e of employees) {
    const key = e.number || e.name;
    if (!map.has(key)) map.set(key, e);
  }
  return Array.from(map.values());
}

function classifyCell(raw: any) {
  const s = normalizeStr(raw).toUpperCase();
  if (!s) return { present: 0, absent: 0, weekoff: 0, ot: 0 } as const;
  let present = 0;
  let absent = 0;
  let weekoff = 0;
  let ot = 0;

  const otMatch = s.match(/OT\s*([0-9]+(?:\.[0-9]+)?)?/);
  if (otMatch) {
    const n = otMatch[1] ? parseFloat(otMatch[1]) : 0;
    if (!Number.isNaN(n)) ot += n;
  }

  if (s === "P" || s.startsWith("P/") || s === "PR" || s === "PRESENT")
    present = 1;
  else if (s === "A" || s === "ABSENT") absent = 1;
  else if (s === "WO" || s === "W/O" || s === "WEEKOFF" || s === "WEEK OFF")
    weekoff = 1;

  return { present, absent, weekoff, ot } as const;
}

function summarizeRow(ws: XLSX.WorkSheet, rowIndex: number): AttendanceSummary {
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  let present = 0;
  let absent = 0;
  let weekoff = 0;
  let otHours = 0;
  // daily values start dynamically based on detected daily pattern at the employee row
  const startCol = detectFirstDayCol(ws, rowIndex);
  const lastDayCol = Math.min(range.e.c, startCol + 30);
  for (let c = startCol; c <= lastDayCol; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: rowIndex, c })];
    const cls = classifyCell(cell?.v);
    present += cls.present;
    absent += cls.absent;
    weekoff += cls.weekoff;
    otHours += cls.ot;
  }
  // Override with summary columns when present: AJ (35) Present, AK (36) Absent, AL (37) Weekoff, AN (39) Minus, AO (40) ATD, AP (41) OT, AQ (42) Kitchen
  const presentCell = ws[XLSX.utils.encode_cell({ r: rowIndex, c: 35 })];
  const absentCell = ws[XLSX.utils.encode_cell({ r: rowIndex, c: 36 })];
  const weekoffCell = ws[XLSX.utils.encode_cell({ r: rowIndex, c: 37 })];
  const minusCell = ws[XLSX.utils.encode_cell({ r: rowIndex, c: 39 })];
  const atdCell = ws[XLSX.utils.encode_cell({ r: rowIndex, c: 40 })];
  const otCell = ws[XLSX.utils.encode_cell({ r: rowIndex, c: 41 })];
  const kitchenCell = ws[XLSX.utils.encode_cell({ r: rowIndex, c: 42 })];

  const parsedP = Number.parseFloat(String(presentCell?.v ?? ""));
  if (!Number.isNaN(parsedP)) present = parsedP;
  const parsedA = Number.parseFloat(String(absentCell?.v ?? ""));
  if (!Number.isNaN(parsedA)) absent = parsedA;
  const parsedWO = Number.parseFloat(String(weekoffCell?.v ?? ""));
  if (!Number.isNaN(parsedWO)) weekoff = parsedWO;
  const parsedMinus = Number.parseFloat(String(minusCell?.v ?? ""));
  const minus = !Number.isNaN(parsedMinus) ? parsedMinus : undefined;
  const parsedOT = Number.parseFloat(String(otCell?.v ?? ""));
  if (!Number.isNaN(parsedOT)) otHours = parsedOT;
  const parsedKitchen = Number.parseFloat(String(kitchenCell?.v ?? ""));
  const kitchen = !Number.isNaN(parsedKitchen) ? parsedKitchen : undefined;

  let atd = present + weekoff;
  const parsedATD = Number.parseFloat(String(atdCell?.v ?? ""));
  if (!Number.isNaN(parsedATD)) atd = parsedATD;
  return { present, absent, weekoff, otHours, atd, minus, kitchen };
}

attendanceRouter.get("/employees", ((req, res) => {
  const { file } = req.query as { file?: string };
  if (!file) return res.status(400).json({ error: "Missing file param" });
  const filePath = getFilePath(file);
  let wb: XLSX.WorkBook;
  try {
    const data = fs.readFileSync(filePath);
    wb = XLSX.read(data, { type: "buffer" });
  } catch (e: any) {
    if (e && e.code === "ENOENT")
      return res.status(404).json({ error: "File not found" });
    return res.status(400).json({ error: "Unable to read Excel file" });
  }
  const sheet = findPresentSheet(wb);
  if (!sheet)
    return res.status(400).json({ error: "Sheet 'present' not found" });
  const employees = readEmployeesFromSheet(sheet);
  const response: EmployeesResponse = { file, employees };
  res.json(response);
}) as RequestHandler);

attendanceRouter.get("/summary", ((req, res) => {
  const { file, number, name } = req.query as {
    file?: string;
    number?: string;
    name?: string;
  };
  if (!file) return res.status(400).json({ error: "Missing file param" });
  if (!number && !name)
    return res.status(400).json({ error: "Provide number or name" });

  const filePath = getFilePath(file);
  let wb: XLSX.WorkBook;
  try {
    const data = fs.readFileSync(filePath);
    wb = XLSX.read(data, { type: "buffer" });
  } catch (e: any) {
    if (e && e.code === "ENOENT")
      return res.status(404).json({ error: "File not found" });
    return res.status(400).json({ error: "Unable to read Excel file" });
  }
  const sheet = findPresentSheet(wb);
  if (!sheet)
    return res.status(400).json({ error: "Sheet 'present' not found" });

  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  const normNumber = number ? normalizeForCompare(number) : undefined;
  const normName = name ? normalizeForCompare(name) : undefined;

  let foundRow = -1;
  let foundEmp: Employee | null = null;
  for (let r = range.s.r; r <= range.e.r; r++) {
    const cellB = sheet[XLSX.utils.encode_cell({ r, c: 1 })];
    const cellC = sheet[XLSX.utils.encode_cell({ r, c: 2 })];
    const b = normalizeStr(cellB?.v);
    const c = normalizeStr(cellC?.v);
    if (isIgnored(b) || isIgnored(c)) continue;

    const matchNumber = normNumber && normalizeForCompare(b) === normNumber;
    const matchName = normName && normalizeForCompare(c) === normName;

    if ((normNumber && matchNumber) || (normName && matchName)) {
      foundRow = r;
      foundEmp = { number: b, name: c };
      break;
    }
  }

  if (foundRow === -1 || !foundEmp) {
    return res.status(404).json({ error: "Employee not found" });
  }

  const summary = summarizeRow(sheet, foundRow);
  const aw = String(
    sheet[XLSX.utils.encode_cell({ r: foundRow, c: 48 })]?.v ?? "",
  ).trim();
  const bb = String(
    sheet[XLSX.utils.encode_cell({ r: foundRow, c: 53 })]?.v ?? "",
  ).trim();
  const bc = String(
    sheet[XLSX.utils.encode_cell({ r: foundRow, c: 54 })]?.v ?? "",
  ).trim();
  const br = String(
    sheet[XLSX.utils.encode_cell({ r: foundRow, c: 69 })]?.v ?? "",
  ).trim();
  const response: AttendanceResponse = {
    file,
    employee: foundEmp,
    summary,
    details: {
      mobile1: bb || undefined,
      mobile2: bc || undefined,
      presentAddress: br || undefined,
      department: aw || undefined,
    },
  };
  res.json(response);
}) as RequestHandler);

attendanceRouter.get("/daily", ((req, res) => {
  const { file, number, name } = req.query as {
    file?: string;
    number?: string;
    name?: string;
  };
  if (!file) return res.status(400).json({ error: "Missing file param" });
  if (!number && !name)
    return res.status(400).json({ error: "Provide number or name" });

  const filePath = getFilePath(file);
  let wb: XLSX.WorkBook;
  try {
    const data = fs.readFileSync(filePath);
    wb = XLSX.read(data, { type: "buffer" });
  } catch (e: any) {
    if (e && e.code === "ENOENT")
      return res.status(404).json({ error: "File not found" });
    return res.status(400).json({ error: "Unable to read Excel file" });
  }
  const sheet = findPresentSheet(wb);
  if (!sheet)
    return res.status(400).json({ error: "Sheet 'present' not found" });

  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  const normNumber = number ? normalizeForCompare(number) : undefined;
  const normName = name ? normalizeForCompare(name) : undefined;

  let foundRow = -1;
  let foundEmp: Employee | null = null;
  for (let r = range.s.r; r <= range.e.r; r++) {
    const cellB = sheet[XLSX.utils.encode_cell({ r, c: 1 })];
    const cellC = sheet[XLSX.utils.encode_cell({ r, c: 2 })];
    const b = normalizeStr(cellB?.v);
    const c = normalizeStr(cellC?.v);
    if (isIgnored(b) || isIgnored(c)) continue;

    const matchNumber = normNumber && normalizeForCompare(b) === normNumber;
    const matchName = normName && normalizeForCompare(c) === normName;
    if ((normNumber && matchNumber) || (normName && matchName)) {
      foundRow = r;
      foundEmp = { number: b, name: c };
      break;
    }
  }
  if (foundRow === -1 || !foundEmp) {
    return res.status(404).json({ error: "Employee not found" });
  }

  const days = getDailyStatuses(sheet, foundRow);
  const aw = String(
    sheet[XLSX.utils.encode_cell({ r: foundRow, c: 48 })]?.v ?? "",
  ).trim();
  const bb = String(
    sheet[XLSX.utils.encode_cell({ r: foundRow, c: 53 })]?.v ?? "",
  ).trim();
  const bc = String(
    sheet[XLSX.utils.encode_cell({ r: foundRow, c: 54 })]?.v ?? "",
  ).trim();
  const br = String(
    sheet[XLSX.utils.encode_cell({ r: foundRow, c: 69 })]?.v ?? "",
  ).trim();
  const responseDaily: DailyAttendanceResponse = {
    file,
    employee: foundEmp,
    days,
    details: {
      mobile1: bb || undefined,
      mobile2: bc || undefined,
      presentAddress: br || undefined,
      department: aw || undefined,
    },
  };
  res.json(responseDaily);
}) as RequestHandler);
