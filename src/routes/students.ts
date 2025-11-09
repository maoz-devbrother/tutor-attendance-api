import { Hono } from "hono";
import { prisma } from "../lib/db";
import { Prisma } from "@prisma/client"; // ✅ สำคัญ

export const students = new Hono().basePath("/students");

// GET /api/students?q=&page=&pageSize=
students.get("/", async (c) => {
  const q = c.req.query("q")?.trim() ?? "";
  const page = Number(c.req.query("page") ?? "1");
  const pageSize = Math.min(
    50,
    Math.max(1, Number(c.req.query("pageSize") ?? "10"))
  );

  const where: Prisma.StudentWhereInput = q
    ? {
        OR: [
          { code: { contains: q, mode: "insensitive" as Prisma.QueryMode } },
          {
            fullName: { contains: q, mode: "insensitive" as Prisma.QueryMode },
          },
        ],
      }
    : {};

  const [total, items] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      orderBy: { code: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, code: true, fullName: true, phone: true },
    }),
  ]);

  return c.json({ items, total, page, pageSize });
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
