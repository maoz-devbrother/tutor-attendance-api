// api/src/routes/subjects.ts
import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/db";

export const subjects = new Hono().basePath("/subjects");

const ToggleSchema = z.object({ isActive: z.boolean() });

const CreateSubjectSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
});

const UpdateSubjectSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200).optional(),
});

// POST /api/subjects (มีอยู่แล้ว)
subjects.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateSubjectSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { code, name } = parsed.data;

  const exists = await prisma.subject.findUnique({ where: { code } });
  if (exists)
    return c.json(
      { error: { code: "DUPLICATE_CODE", message: "รหัสวิชานี้ถูกใช้แล้ว" } },
      409
    );

  const created = await prisma.subject.create({ data: { code, name } });
  return c.json(created, 201);
});

// PATCH /api/subjects/:id
subjects.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = UpdateSubjectSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  // ถ้าจะเปลี่ยน code ต้องไม่ชน
  if (parsed.data.code) {
    const dup = await prisma.subject.findFirst({
      where: { code: parsed.data.code, NOT: { id } },
      select: { id: true },
    });
    if (dup)
      return c.json(
        { error: { code: "DUPLICATE_CODE", message: "รหัสวิชานี้ถูกใช้แล้ว" } },
        409
      );
  }

  const updated = await prisma.subject
    .update({
      where: { id },
      data: parsed.data,
      select: { id: true, code: true, name: true },
    })
    .catch(() => null);

  if (!updated) return c.json({ error: { message: "ไม่พบวิชา" } }, 404);
  return c.json(updated);
});

subjects.patch("/:id/active", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = ToggleSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  // กันปิดใช้งานถ้ามีคอร์สอ้างอิง (เลือกได้ว่าจะบังคับไหม)
  if (parsed.data.isActive === false) {
    const inUse = await prisma.course.count({ where: { subjectId: id } });
    if (inUse > 0) {
      return c.json(
        {
          error: {
            code: "SUBJECT_IN_USE",
            message: "มีคอร์สอ้างอิงอยู่ จึงปิดใช้งานไม่ได้",
          },
        },
        409
      );
    }
  }

  const updated = await prisma.subject
    .update({
      where: { id },
      data: { isActive: parsed.data.isActive },
      select: { id: true, code: true, name: true, isActive: true },
    })
    .catch(() => null);

  if (!updated) return c.json({ error: { message: "ไม่พบวิชา" } }, 404);
  return c.json(updated);
});

// DELETE /api/subjects/:id
subjects.delete("/:id", async (c) => {
  const id = c.req.param("id");

  // กันลบถ้ามีคอร์สอ้างอิง
  const count = await prisma.course.count({ where: { subjectId: id } });
  if (count > 0) {
    return c.json(
      {
        error: {
          code: "SUBJECT_IN_USE",
          message: "ไม่สามารถลบวิชาได้ เพราะมีคอร์สอ้างอิงอยู่",
        },
      },
      409
    );
  }

  const deleted = await prisma.subject
    .delete({ where: { id } })
    .catch(() => null);
  if (!deleted) return c.json({ error: { message: "ไม่พบวิชา" } }, 404);
  return c.json({ ok: true });
});
