// api/src/routes/courses.ts
import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/db";

export const courses = new Hono().basePath("/courses");

const CreateCourseSchema = z.object({
  subjectId: z.string().min(1, "กรุณาเลือกวิชา"),
  title: z.string().min(1, "กรุณากรอกชื่อคอร์ส").max(200),
  totalSessions: z.number().int().positive("จำนวนคาบต้องมากกว่า 0"),
  branchIds: z.array(z.string().min(1)).min(1, "ต้องเลือกอย่างน้อย 1 สาขา"),
});

// POST /api/courses
courses.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateCourseSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }
  const { subjectId, title, totalSessions, branchIds } = parsed.data;

  // สร้างคอร์ส + ผูกสาขา (ผ่านตารางเชื่อม CourseBranch)
  const created = await prisma.course.create({
    data: {
      subjectId,
      title,
      totalSessions,
      branches: {
        create: branchIds.map((bid) => ({ branchId: bid })),
      },
    },
    include: { subject: true, branches: { include: { branch: true } } },
  });

  // คืน shape ให้สอดคล้องกับ GET /api/courses (ถ้าใช้ meta.ts)
  return c.json({
    id: created.id,
    subjectId: created.subjectId,
    subjectName: created.subject.name,
    title: created.title,
    totalSessions: created.totalSessions,
    branchIds: created.branches.map((b) => b.branchId),
  });
});
