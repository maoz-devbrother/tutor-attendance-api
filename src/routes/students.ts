import { Hono } from "hono";
import { prisma } from "../lib/db";
import { Prisma } from "@prisma/client"; // ✅ สำคัญ
import z from "zod";

const CreateStudentSchema = z.object({
  code: z.string().min(1).max(50),
  fullName: z.string().min(1).max(200),
  phone: z.string().min(3).max(30).optional().nullable(),
  isActive: z.boolean().optional(),
});

const UpdateStudentSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  fullName: z.string().min(1).max(200).optional(),
  phone: z.string().min(3).max(30).optional().nullable(),
});

const ToggleSchema = z.object({ isActive: z.boolean() });

export const students = new Hono().basePath("/students");

// GET /api/students?q=&page=&pageSize=
students.get("/", async (c) => {
  const q = c.req.query("q")?.trim() ?? "";
  const status = c.req.query("status") ?? "active"; // active | inactive | all

  const page = Math.max(1, Number(c.req.query("page") ?? "1"));
  const pageSize = Math.min(
    50,
    Math.max(1, Number(c.req.query("pageSize") ?? "10"))
  );

  const where: Prisma.StudentWhereInput = {};

  // filter สถานะ
  if (status === "active") {
    where.isActive = true;
  } else if (status === "inactive") {
    where.isActive = false;
  }

  // filter ค้นหา (code, name, phone)
  if (q) {
    where.OR = [
      { code: { contains: q, mode: "insensitive" } },
      { fullName: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      orderBy: { code: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        code: true,
        fullName: true,
        phone: true,
        isActive: true,
        createdAt: true,
      },
    }),
  ]);

  return c.json({
    items: items.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  });
});

// GET /api/students/:id
students.get("/:id", async (c) => {
  const id = c.req.param("id");
  const s = await prisma.student.findUnique({
    where: { id },
    select: { id: true, code: true, fullName: true, phone: true },
  });
  if (!s) return c.notFound();
  return c.json(s);
});

// GET /api/students/:id/enrollments
students.get("/:id/enrollments", async (c) => {
  const id = c.req.param("id");
  const data = await prisma.enrollment
    .findMany({
      where: { studentId: id },
      include: { course: { include: { subject: true } } },
      orderBy: { createdAt: "desc" },
    })
    .catch(async () => {
      // fallback ถ้าไม่มี createdAt ใน schema คุณลบ orderBy ออกได้
      return prisma.enrollment.findMany({
        where: { studentId: id },
        include: { course: { include: { subject: true } } },
      });
    });

  const items = data.map((e) => ({
    id: e.id,
    courseId: e.courseId,
    courseTitle: e.course.title,
    subjectName: e.course.subject.name,
    sessionsPurchased: e.sessionsPurchased,
    sessionsAttended: e.sessionsAttended,
  }));
  return c.json(items);
});

// GET /api/students/:id/attendance?from=&to=
students.get("/:id/attendance", async (c) => {
  const id = c.req.param("id");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const where: any = { studentId: id };
  if (from || to) {
    where.session = { startAt: {} as any };
    if (from) where.session.startAt.gte = new Date(from);
    if (to) where.session.startAt.lte = new Date(to + "T23:59:59.999Z");
  }

  const rows = await prisma.attendance.findMany({
    where,
    include: {
      session: {
        include: { course: { include: { subject: true } }, branch: true },
      },
    },
    orderBy: { session: { startAt: "desc" } },
  });

  const items = rows.map((r) => ({
    sessionId: r.sessionId,
    date: r.session.startAt,
    subjectName: r.session.course.subject.name,
    courseTitle: r.session.course.title,
    branchName: r.session.branch.name,
    status: r.status,
    note: r.note ?? null,
  }));
  return c.json(items);
});

students.get("/:id/summary", async (c) => {
  const id = c.req.param("id");

  const student = await prisma.student.findUnique({
    where: { id },
  });

  if (!student) {
    return c.json({ error: "Student not found" }, 404);
  }

  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: id },
    include: {
      course: { include: { subject: true } },
      branch: true,
    },
    orderBy: [{ createdAt: "desc" }, { course: { title: "asc" } }],
  });

  const rows = enrollments.map((e) => {
    const sessionsPurchased = e.sessionsPurchased;
    const sessionsAttended = e.sessionsAttended;
    const remaining = Math.max(sessionsPurchased - sessionsAttended, 0);

    let status: "COMPLETE" | "IN_PROGRESS" | "OVER";
    if (sessionsAttended > sessionsPurchased) status = "OVER";
    else if (sessionsAttended === sessionsPurchased) status = "COMPLETE";
    else status = "IN_PROGRESS";

    const progressPercent =
      sessionsPurchased > 0
        ? Math.round((sessionsAttended / sessionsPurchased) * 100)
        : 0;

    return {
      enrollmentId: e.id,
      courseId: e.courseId,
      courseTitle: e.course.title,
      subjectName: e.course.subject.name,
      branchId: e.branchId,
      branchName: e.branch.name,
      sessionsPurchased,
      sessionsAttended,
      remaining,
      progressPercent,
      status,
      createdAt: e.createdAt.toISOString(),
    };
  });

  // สรุปรวม
  const totalEnrollments = rows.length;
  const totalSessionsPurchased = rows.reduce(
    (sum, r) => sum + r.sessionsPurchased,
    0
  );
  const totalSessionsAttended = rows.reduce(
    (sum, r) => sum + r.sessionsAttended,
    0
  );

  const summary = {
    totalEnrollments,
    totalSessionsPurchased,
    totalSessionsAttended,
  };

  return c.json({
    student: {
      id: student.id,
      code: student.code,
      fullName: student.fullName,
      phone: student.phone,
      isActive: student.isActive,
      createdAt: student.createdAt.toISOString(),
    },
    enrollments: rows,
    summary,
  });
});

students.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateStudentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          type: "VALIDATION_ERROR",
          details: parsed.error.flatten(),
        },
      },
      400
    );
  }

  const { code, fullName, phone, isActive } = parsed.data;

  // เช็ครหัสซ้ำ
  const exists = await prisma.student.findUnique({
    where: { code },
    select: { id: true },
  });
  if (exists) {
    return c.json(
      {
        error: {
          type: "DUPLICATE_CODE",
          message: "มีรหัสนักเรียนนี้ในระบบแล้ว",
        },
      },
      409
    );
  }

  const created = await prisma.student.create({
    data: {
      code,
      fullName,
      phone: phone ?? null,
      isActive: isActive ?? true,
    },
  });

  return c.json(
    {
      id: created.id,
      code: created.code,
      fullName: created.fullName,
      phone: created.phone,
      isActive: created.isActive,
      createdAt: created.createdAt.toISOString(),
    },
    201
  );
});

students.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = UpdateStudentSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  if (parsed.data.code) {
    const dup = await prisma.student.findFirst({
      where: { code: parsed.data.code, NOT: { id } },
      select: { id: true },
    });
    if (dup)
      return c.json(
        {
          error: {
            code: "DUPLICATE_CODE",
            message: "รหัสนักเรียนนี้ถูกใช้แล้ว",
          },
        },
        409
      );
  }

  const updated = await prisma.student
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

  if (!updated) return c.json({ error: { message: "ไม่พบนักเรียน" } }, 404);
  return c.json(updated);
});

// PATCH /api/students/:id/active
students.patch("/:id/active", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = ToggleSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const updated = await prisma.student
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

  if (!updated) return c.json({ error: { message: "ไม่พบนักเรียน" } }, 404);
  return c.json(updated);
});

students.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateStudentSchema.partial().safeParse(body);
  // partial = ไม่บังคับทุก field

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const data = parsed.data;

  const existing = await prisma.student.findUnique({ where: { id } });
  if (!existing) {
    return c.json({ error: { message: "ไม่พบนักเรียน" } }, 404);
  }

  const updated = await prisma.student.update({
    where: { id },
    data: {
      code: data.code ?? existing.code,
      fullName: data.fullName ?? existing.fullName,
      phone: data.phone !== undefined ? data.phone : existing.phone, // แยก undefined กับ null
      isActive: data.isActive !== undefined ? data.isActive : existing.isActive,
    },
  });

  return c.json({
    id: updated.id,
    code: updated.code,
    fullName: updated.fullName,
    phone: updated.phone,
    isActive: updated.isActive,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
});
