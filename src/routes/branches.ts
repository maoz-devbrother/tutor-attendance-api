import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/db";

export const branches = new Hono().basePath("/branches");

const CreateBranchSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
});
const UpdateBranchSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200).optional(),
});
const ToggleSchema = z.object({ isActive: z.boolean() });

// POST /api/branches
branches.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateBranchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const dup = await prisma.branch.findUnique({
    where: { code: parsed.data.code },
  });
  if (dup)
    return c.json(
      { error: { code: "DUPLICATE_CODE", message: "รหัสสาขานี้ถูกใช้แล้ว" } },
      409
    );

  const created = await prisma.branch.create({ data: parsed.data });
  return c.json(created, 201);
});

// PATCH /api/branches/:id
branches.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = UpdateBranchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  if (parsed.data.code) {
    const dup = await prisma.branch.findFirst({
      where: { code: parsed.data.code, NOT: { id } },
      select: { id: true },
    });
    if (dup)
      return c.json(
        { error: { code: "DUPLICATE_CODE", message: "รหัสสาขานี้ถูกใช้แล้ว" } },
        409
      );
  }

  const updated = await prisma.branch
    .update({
      where: { id },
      data: parsed.data,
      select: { id: true, code: true, name: true, isActive: true },
    })
    .catch(() => null);

  if (!updated) return c.json({ error: { message: "ไม่พบสาขา" } }, 404);
  return c.json(updated);
});

// PATCH /api/branches/:id/active
branches.patch("/:id/active", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = ToggleSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const updated = await prisma.branch
    .update({
      where: { id },
      data: { isActive: parsed.data.isActive },
      select: { id: true, code: true, name: true, isActive: true },
    })
    .catch(() => null);

  if (!updated) return c.json({ error: { message: "ไม่พบสาขา" } }, 404);
  return c.json(updated);
});

// (ถ้าจำเป็น) DELETE: แนะนำเลี่ยงและใช้ toggle แทน
// branches.delete("/:id", async (c) => {
//   const id = c.req.param("id");
//   const refSessions = await prisma.session.count({ where: { branchId: id } });
//   const refCourses = await prisma.courseBranch.count({ where: { branchId: id } });
//   if (refSessions > 0 || refCourses > 0) {
//     return c.json({ error: { code: "BRANCH_IN_USE", message: "มีข้อมูลอ้างอิงอยู่ ลบไม่ได้" } }, 409);
//   }
//   await prisma.branch.delete({ where: { id } });
//   return c.json({ ok: true });
// });
