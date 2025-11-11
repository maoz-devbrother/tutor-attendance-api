import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/db";

export const sessions = new Hono().basePath("/sessions");

/** Utils: day range in Asia/Bangkok (UTC+7) */
function bangkokDayRange(yyyyMmDd: string) {
  // yyyy-mm-dd -> build with +07:00 then convert to Date
  const start = new Date(`${yyyyMmDd}T00:00:00+07:00`);
  const end = new Date(`${yyyyMmDd}T23:59:59.999+07:00`);
  return { start, end };
}

/** -------------------------
 *  GET /api/sessions?date=YYYY-MM-DD&branchId=
 *  ------------------------- */
sessions.get("/", async (c) => {
  const date = c.req.query("date") ?? new Date().toISOString().slice(0, 10);
  const branchId = c.req.query("branchId") ?? "";

  const { start, end } = bangkokDayRange(date);

  const rows = await prisma.session.findMany({
    where: {
      startAt: { gte: start, lte: end },
      ...(branchId ? { branchId } : {}),
    },
    include: {
      course: { include: { subject: true } },
      branch: true,
    },
    orderBy: { startAt: "asc" },
  });

  const items = rows.map((s) => ({
    id: s.id,
    startAt: s.startAt.toISOString(),
    endAt: s.endAt.toISOString(),
    teacher: s.teacher,
    courseTitle: s.course.title,
    subjectName: s.course.subject.name,
    branchName: s.branch.name,
  }));

  return c.json(items);
});

/** -------------------------
 *  POST /api/sessions
 *  ------------------------- */
const CreateSessionSchema = z.object({
  courseId: z.string().min(1),
  branchId: z.string().min(1),
  startAt: z.string().datetime(), // ISO
  endAt: z.string().datetime(),
  teacher: z.string().min(1).optional().nullable(),
});

sessions.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateSessionSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { courseId, branchId, startAt, endAt, teacher } = parsed.data;

  // ตรวจว่าคอร์สเปิดสอนสาขานี้
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { branches: { select: { branchId: true } } },
  });
  if (!course) return c.json({ error: { message: "ไม่พบคอร์ส" } }, 404);

  const allowed = new Set(course.branches.map((b) => b.branchId));
  if (!allowed.has(branchId)) {
    return c.json(
      {
        error: {
          code: "BRANCH_NOT_ALLOWED",
          message: "คอร์สนี้ไม่ได้เปิดที่สาขานี้",
        },
      },
      409
    );
  }

  const created = await prisma.session.create({
    data: {
      courseId,
      branchId,
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      teacher: teacher ?? null,
    },
    include: {
      course: { include: { subject: true } },
      branch: true,
    },
  });

  return c.json(
    {
      id: created.id,
      startAt: created.startAt,
      endAt: created.endAt,
      teacher: created.teacher,
      courseTitle: created.course.title,
      subjectName: created.course.subject.name,
      branchName: created.branch.name,
    },
    201
  );
});

/** -------------------------
 *  GET /api/sessions/:id/attendance
 *  (สำหรับหน้าเช็คชื่อ)
 *  ------------------------- */
sessions.get("/:id/attendance", async (c) => {
  const id = c.req.param("id");

  const s = await prisma.session.findUnique({
    where: { id },
    include: {
      course: { include: { subject: true } },
      branch: true,
    },
  });
  if (!s) return c.json({ error: "Session not found" }, 404);

  // enrollments ของคอร์สนี้ (ทุกสาขา) แต่เราจะแสดงเฉพาะนักเรียนที่ลงคอร์สนี้
  const enrolls = await prisma.enrollment.findMany({
    where: { courseId: s.courseId },
    include: { student: true },
    orderBy: { student: { fullName: "asc" } },
  });

  // attendance ที่เคยบันทึกไปแล้วของคาบนี้
  const att = await prisma.attendance.findMany({
    where: { sessionId: id },
    select: { studentId: true, status: true, note: true },
  });
  const mapAtt = new Map(att.map((a) => [a.studentId, a]));

  const rows = enrolls.map((e) => {
    const a = mapAtt.get(e.studentId);
    return {
      studentId: e.studentId,
      studentName: e.student.fullName,
      status: a?.status ?? null,
      note: a?.note ?? null,
    };
  });

  return c.json({
    sessionId: s.id,
    courseTitle: s.course.title,
    subjectName: s.course.subject.name,
    branchName: s.branch.name,
    startAt: s.startAt.toISOString(),
    endAt: s.endAt.toISOString(),
    teacher: s.teacher,
    rows,
  });
});

/** -------------------------
 *  POST /api/sessions/:id/attendance
 *  ------------------------- */
const SaveAttendanceSchema = z.object({
  items: z
    .array(
      z.object({
        studentId: z.string().min(1),
        status: z.enum(["PRESENT", "ABSENT", "LEAVE"]),
        note: z.string().max(200).optional(),
      })
    )
    .min(1),
});

sessions.post("/:id/attendance", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = SaveAttendanceSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const session = await prisma.session.findUnique({ where: { id } });
  if (!session) return c.json({ error: "Session not found" }, 404);

  // ลบของเก่า (เฉพาะ session นี้) แล้วใส่ใหม่
  await prisma.$transaction([
    prisma.attendance.deleteMany({ where: { sessionId: id } }),
    prisma.attendance.createMany({
      data: parsed.data.items.map((it) => ({
        sessionId: id,
        studentId: it.studentId,
        status: it.status,
        note: it.note ?? null,
      })),
    }),
  ]);

  return c.json({ ok: true });
});
