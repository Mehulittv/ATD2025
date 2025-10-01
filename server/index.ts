import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { handleDemo } from "./routes/demo";
import { filesRouter } from "./routes/files";
import { attendanceRouter } from "./routes/attendance";
import { whatsappRouter } from "./routes/whatsapp";

const UPLOAD_DIR = path.resolve(process.cwd(), "server", "uploads");
const TEMP_UPLOAD_DIR = path.resolve(process.cwd(), "server", "uploads_tmp");
const MEDIA_SIGN_KEY = process.env.MEDIA_SIGN_KEY || "dev-secret";
const MEDIA_URL_TTL_MS = Number(process.env.MEDIA_URL_TTL_MS || 5 * 60 * 1000);

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function signMedia(filename: string, exp: string) {
  return crypto
    .createHmac("sha256", MEDIA_SIGN_KEY)
    .update(`${filename}:${exp}`)
    .digest("hex");
}

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Health/demo routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });
  app.get("/api/demo", handleDemo);

  // Files management
  app.use("/api/files", filesRouter);
  // Attendance APIs
  app.use("/api/attendance", attendanceRouter);
  // WhatsApp APIs
  app.use("/api/whatsapp", whatsappRouter);

  // Serve uploaded files statically (read-only)
  ensureDir(UPLOAD_DIR);
  app.use("/uploads", express.static(UPLOAD_DIR));

  // Signed, temporary URL for temp uploads (path-based signature to keep extension at end)
  // Format: /uploads-temp/:exp/:sig/:filename
  ensureDir(TEMP_UPLOAD_DIR);
  app.get("/uploads-temp/:exp/:sig/:filename", (req, res) => {
    const { filename, exp, sig } = req.params as {
      filename: string;
      exp: string;
      sig: string;
    };

    const now = Date.now();
    const expNum = Number(exp);
    if (!Number.isFinite(expNum))
      return res.status(400).json({ error: "Invalid exp" });
    if (now > expNum) return res.status(410).json({ error: "Link expired" });

    const expected = signMedia(filename, String(exp));
    if (sig !== expected)
      return res.status(403).json({ error: "Invalid signature" });

    const filePath = path.join(TEMP_UPLOAD_DIR, filename);
    if (!fs.existsSync(filePath))
      return res.status(404).json({ error: "File not found" });

    res.sendFile(filePath);
  });

  // Compact temporary URLs: /i/:id and /i/:id.:ext -> serves a short-named file "<ts>-<id>.<ext>" with TTL
  const serveShort = (req: any, res: any) => {
    const paramId = String(req.params.id || "");
    const id = paramId.split(".")[0];
    if (!id) return res.status(400).json({ error: "Missing id" });
    const entries = fs.readdirSync(TEMP_UPLOAD_DIR);
    const match = entries.find((name) => {
      const m = name.match(/^(\d+)-([A-Za-z0-9_-]{4,})\.[^.]+$/);
      return m && m[2] === id;
    });
    if (!match) return res.status(404).json({ error: "File not found" });
    const ts = Number(match.split("-")[0]);
    if (!Number.isFinite(ts))
      return res.status(400).json({ error: "Invalid id" });
    const now = Date.now();
    if (now > ts + MEDIA_URL_TTL_MS)
      return res.status(410).json({ error: "Link expired" });
    const filePath = path.join(TEMP_UPLOAD_DIR, match);
    res.sendFile(filePath);
  };
  app.get("/i/:id.:ext", serveShort);
  app.get("/i/:id", serveShort);

  return app;
}
