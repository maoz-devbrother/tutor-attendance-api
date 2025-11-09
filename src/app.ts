import { Hono } from "hono";
import { cors } from "hono/cors";
import { sessions } from "./routes/sessions"; // ไม่มี basePath
import { meta } from "./routes/meta"; // GET branches/subjects/courses
import { students } from "./routes/students"; // มี basePath("/students")
import { courses } from "./routes/courses"; // มี basePath("/courses")
import { subjects } from "./routes/subjects"; // มี basePath("/subjects")

export const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:3000", // ชี้ไป Next dev
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"], // กันเคส browser ส่ง headers อื่น ๆ
    exposeHeaders: ["*"],
    maxAge: 86400,
    credentials: false, // ถ้าไม่ใช้ cookies/JWT ผ่าน browser storage
  })
);

app.get("/", (c) => c.json({ ok: true, name: "Tutor Attendance API" }));

// ✅ sessions ไม่มี basePath → mount ที่ /api/sessions
app.route("/api/sessions", sessions);
app.route("/api", meta);
app.route("/api", students);
app.route("/api", courses); // POST /api/courses
app.route("/api", subjects); // POST /api/subjects

app.notFound((c) => c.json({ error: "Not Found" }, 404));
