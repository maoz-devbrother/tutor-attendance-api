// src/app.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { sessions } from "./routes/sessions";
import { meta } from "./routes/meta";
import { students } from "./routes/students";
import { courses } from "./routes/courses";
import { subjects } from "./routes/subjects";
import { branches } from "./routes/branches";
import { enrollments } from "./routes/enrollments";
import { reports } from "./routes/reports";

export const app = new Hono();

// ✅ รองรับหลายโดเมน: CORS_ORIGIN="https://tutor-attendance.netlify.app,https://<your>.ngrok-free.dev,http://localhost:3000"
const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ฟังก์ชันตรวจ origin แบบไดนามิก
const allowOrigin = (requestOrigin?: string) => {
  if (!requestOrigin) return "";
  if (allowedOrigins.includes("*")) return "*"; // (ใช้แค่ dev)
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : "";
};

// ใช้กับทุกเส้นทางใต้ /api/*
app.use(
  "/api/*",
  cors({
    origin: allowOrigin,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
    exposeHeaders: ["Content-Length"],
    maxAge: 86400,
    credentials: false, // ถ้าจะส่ง cookie ข้ามโดเมน ค่อยเปลี่ยนเป็น true และห้ามใช้ "*" เป็น origin
  })
);

// บางโฮสต์อยากได้ OPTIONS ชัด ๆ (preflight)
app.options("/api/*", (c) => c.body(null, 204));

app.get("/", (c) => c.json({ ok: true, name: "Tutor Attendance API" }));

app.route("/api", meta);
app.route("/api", students);
app.route("/api", courses);
app.route("/api", subjects);
app.route("/api", branches);
app.route("/api", enrollments);
app.route("/api", sessions);
app.route("/api", reports);

app.notFound((c) => c.json({ error: "Not Found" }, 404));

// แนะนำ log ดู origin ที่อนุญาตจริง
console.log("[CORS] Allowed origins:", allowedOrigins);
