import { Hono } from "hono";
import { prisma } from "../lib/db";
import {
  listSessionsQuerySchema,
  saveAttendanceSchema,
} from "../lib/validators";

export const sessions = new Hono();

// GET /api/sessions?date=&branchId=&subjectId=
sessions.get("/", async (c) => {
  const parsed = listSessionsQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { date, branchId, subjectId } = parsed.data;

  const where: any = {};
  if (date) {
    // day range
    const d0 = new Date(date);
    const d1 = new Date(d0);
    d1.setDate(d1.getDate() + 1);
    where.startAt = { gte: d0, lt: d1 };
  }
  if (branchId) where.branchId = branchId;
  if (subjectId) where.course = { subjectId };

  const data = await prisma.session.findMany({
    where,
    include: { course: { include: { subject: true } }, branch: true },
    orderBy: { startAt: "asc" },
  });

  return c.json(
    data.map((s) => ({
      sessionId: s.id,
      courseTitle: s.course.title,
      subjectName: s.course.subject.name,
      branchName: s.branch.name,
      startAt: s.startAt,
      endAt: s.endAt,
      teacher: s.teacher ?? null,
    }))
  );
});

// GET /api/sessions/:id/attendance  → shape ที่ Front ใช้
sessions.get("/:id/attendance", async (c) => {
  const id = c.req.param("id");

  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      course: {
        include: { subject: true, enrollments: { include: { student: true } } },
      },
      branch: true,
      records: true,
    },
  });
  if (!session) return c.notFound();

  const rows = session.course.enrollments.map((e) => {
    const r = session.records.find((x) => x.studentId === e.studentId);
    return {
      studentId: e.studentId,
      studentName: `${e.student.code} - ${e.student.fullName}`,
      status: r?.status ?? null,
      note: r?.note ?? null,
      enrolled: true,
    };
  });

  return c.json({
    sessionId: session.id,
    courseTitle: session.course.title,
    subjectName: session.course.subject.name,
    branchName: session.branch.name,
    startAt: session.startAt,
    endAt: session.endAt,
    teacher: session.teacher,
    rows,
  });
});

// POST /api/sessions/:id/attendance
sessions.post("/:id/attendance", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = saveAttendanceSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  await prisma.$transaction(async (tx) => {
    await tx.attendance.deleteMany({ where: { sessionId: id } });
    if (parsed.data.items.length) {
      await tx.attendance.createMany({
        data: parsed.data.items.map((it) => ({
          sessionId: id,
          studentId: it.studentId,
          status: it.status,
          note: it.note ?? null,
        })),
      });
    }
  });

  return c.json({ ok: true });
});
