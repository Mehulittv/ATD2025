import { RequestHandler, Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { FilesListResponse, UploadedFile } from "@shared/api";

const UPLOAD_DIR = path.resolve(process.cwd(), "server", "uploads");

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

ensureUploadDir();

// Configure multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadDir();
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, "_");
    cb(null, `${timestamp}__${safeOriginal}`);
  },
});

const upload = multer({ storage });

export const filesRouter = Router();

// List files
filesRouter.get("/", ((_req, res) => {
  ensureUploadDir();
  const files = fs
    .readdirSync(UPLOAD_DIR)
    .filter((f) => {
      if (f.startsWith(".")) return false;
      const lower = f.toLowerCase();
      return lower.endsWith(".xls") || lower.endsWith(".xlsx");
    })
    .map((filename) => {
      const stat = fs.statSync(path.join(UPLOAD_DIR, filename));
      const parts = filename.split("__");
      const originalName =
        parts.length > 1 ? parts.slice(1).join("__") : filename;
      const uploaded: UploadedFile = {
        filename,
        originalName,
        size: stat.size,
        uploadedAt: stat.birthtime.toISOString(),
      };
      return uploaded;
    })
    .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));

  const response: FilesListResponse = { files };
  res.json(response);
}) as RequestHandler);

// Upload a new file
filesRouter.post("/upload", upload.single("file"), ((req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  const stat = fs.statSync(req.file.path);
  const uploaded: UploadedFile = {
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: stat.size,
    uploadedAt: stat.birthtime.toISOString(),
  };
  res.status(201).json(uploaded);
}) as RequestHandler);

// Delete a file
filesRouter.delete("/:filename", ((req, res) => {
  const { filename } = req.params as { filename: string };
  const filePath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }
  fs.unlinkSync(filePath);
  res.status(204).end();
}) as RequestHandler);

// Helper exported for other routes
export function getFilePath(filename: string) {
  return path.join(UPLOAD_DIR, filename);
}
