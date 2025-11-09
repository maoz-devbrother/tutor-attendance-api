import { Hono } from "hono";
import { cors } from "hono/cors";
import { sessions } from "./routes/sessions";
import { meta } from "./routes/meta";

export const app = new Hono();

// CORS (อนุญาต Next dev)
app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:8787",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.get("/", (c) => c.json({ ok: true, name: "Tutor Attendance API" }));

app.route("/api/sessions", sessions);
app.route("/api", meta); // /api/branches, /api/subjects, /api/courses

// 404
app.notFound((c) => c.json({ error: "Not Found" }, 404));
