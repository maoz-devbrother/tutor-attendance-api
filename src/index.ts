// src/index.ts
import { serve } from "@hono/node-server";
import { app } from "./app"; // ✅ ใช้ app ที่รวมทุก route จาก app.ts

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`);
});
