// routes/teachers.ts
import { Hono } from "hono";
import { prisma } from "../lib/db";
import z from "zod";

export const teachers = new Hono().basePath("/teachers");

const CreateTeacherSchema = z.object({
  code: z.string().min(1).max(50),
  fullName: z.string().min(1).max(200),
  phone: z.string().min(3).max(30).optional().nullable(),
});

const UpdateTeacherSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  fullName: z.string().min(1).max(200).optional(),
  phone: z.string().min(3).max(30).optional().nullable(),
});

const ToggleSchema = z.object({ isActive: z.boolean() });

// GET /api/teachers?includeInactive=true
teachers.get("/", async (c) => {
  const includeInactive = c.req.query("includeInactive") === "true";

  const where = includeInactive ? {} : { isActive: true };

  const items = await prisma.teacher.findMany({
    where,
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      fullName: true,
      phone: true,
      isActive: true,
    },
  });

  return c.json(items);
});

// POST /api/teachers
teachers.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateTeacherSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const dup = await prisma.teacher.findUnique({
    where: { code: parsed.data.code },
  });
  if (dup) {
    return c.json(
      {
        error: {
          code: "DUPLICATE_CODE",
          message: "รหัสครูคนนี้ถูกใช้แล้ว",
        },
      },
      409
    );
  }

  const created = await prisma.teacher.create({
    data: parsed.data,
    select: {
      id: true,
      code: true,
      fullName: true,
      phone: true,
      isActive: true,
    },
  });

  return c.json(created, 201);
});

// PATCH /api/teachers/:id
teachers.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = UpdateTeacherSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  if (parsed.data.code) {
    const dup = await prisma.teacher.findFirst({
      where: { code: parsed.data.code, NOT: { id } },
      select: { id: true },
    });
    if (dup) {
      return c.json(
        {
          error: {
            code: "DUPLICATE_CODE",
            message: "รหัสครูคนนี้ถูกใช้แล้ว",
          },
        },
        409
      );
    }
  }

  const updated = await prisma.teacher
    .update({
      where: { id },
      data: parsed.data,
      select: {
        id: true,
        code: true,
        fullName: true,
        phone: true,
        isActive: true,
      },
    })
    .catch(() => null);

  if (!updated) {
    return c.json({ error: { message: "ไม่พบข้อมูลครู" } }, 404);
  }

  return c.json(updated);
});

// PATCH /api/teachers/:id/active
teachers.patch("/:id/active", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = ToggleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const updated = await prisma.teacher
    .update({
      where: { id },
      data: { isActive: parsed.data.isActive },
      select: {
        id: true,
        code: true,
        fullName: true,
        phone: true,
        isActive: true,
      },
    })
    .catch(() => null);

  if (!updated) {
    return c.json({ error: { message: "ไม่พบข้อมูลครู" } }, 404);
  }

  return c.json(updated);
});
