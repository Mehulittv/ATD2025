/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */

/**
 * Example response type for /api/demo
 */
export interface DemoResponse {
  message: string;
}

// Attendance domain types
export interface UploadedFile {
  filename: string; // stored filename on server
  originalName: string; // original uploaded filename
  size: number; // bytes
  uploadedAt: string; // ISO string
}

export interface FilesListResponse {
  files: UploadedFile[];
}

export interface Employee {
  number: string;
  name: string;
}

export interface EmployeesResponse {
  file: string;
  employees: Employee[];
}

export interface AttendanceSummary {
  present: number;
  absent: number;
  weekoff: number;
  otHours: number; // total OT hours, if present in sheet
  atd: number; // present + weekoff
  minus?: number; // from AN
  kitchen?: number; // from AQ
}

export interface EmployeeDetails {
  mobile1?: string; // from BB
  mobile2?: string; // from BC
  presentAddress?: string; // from BR
  department?: string; // from AW
}

export interface AttendanceResponse {
  file: string;
  employee: Employee;
  summary: AttendanceSummary;
  details?: EmployeeDetails;
}

export interface DayStatus {
  day: number;
  code: "P" | "A" | "WO" | "";
  ot: number;
}

export interface DailyAttendanceResponse {
  file: string;
  employee: Employee;
  days: DayStatus[];
  details?: EmployeeDetails;
}
