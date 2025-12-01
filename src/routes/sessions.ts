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
      records: true, // ✅ ดึง Attendance ของคาบนี้มาด้วย
    },
    orderBy: { startAt: "asc" },
  });

  const items = rows.map((s) => {
    // ✅ นับสถานะการเช็คชื่อ
    let present = 0;
    let absent = 0;
    let leave = 0;

    for (const r of s.records) {
      if (r.status === "PRESENT") present += 1;
      else if (r.status === "ABSENT") absent += 1;
      else if (r.status === "LEAVE") leave += 1;
    }

    const totalRecords = present + absent + leave;
    const hasAttendance = totalRecords > 0;

    return {
      id: s.id,
      startAt: s.startAt.toISOString(),
      endAt: s.endAt.toISOString(),
      teacher: s.teacher,
      courseTitle: s.course.title,
      subjectName: s.course.subject.name,
      branchName: s.branch.name,

      // ✅ ฟิลด์ใหม่สำหรับหน้าเช็คชื่อ
      hasAttendance,
      presentCount: present,
      absentCount: absent,
      leaveCount: leave,
      totalRecords,
    };
  });

  return c.json(items);
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

/** -------------------------
 *  GET /api/sessions/range?from=YYYY-MM-DD&to=YYYY-MM-DD&branchId=
 *  ใช้สำหรับดูคาบเรียนหลายวัน
 *  ------------------------- */
sessions.get("/range", async (c) => {
  const fromQ = c.req.query("from");
  const toQ = c.req.query("to");
  const branchId = c.req.query("branchId") ?? "";

  // default: 7 วันนับจากวันนี้
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10); // yyyy-mm-dd

  const defaultFromDate = new Date(today);
  defaultFromDate.setDate(defaultFromDate.getDate() - 3); // ย้อนหลัง 3 วัน
  const defaultToDate = new Date(today);
  defaultToDate.setDate(defaultToDate.getDate() + 3); // ล่วงหน้า 3 วัน

  const fromStr = fromQ ?? defaultFromDate.toISOString().slice(0, 10);
  const toStr = toQ ?? defaultToDate.toISOString().slice(0, 10);

  const { start } = bangkokDayRange(fromStr);
  const { end } = bangkokDayRange(toStr);

  const rows = await prisma.session.findMany({
    where: {
      startAt: { gte: start, lte: end },
      ...(branchId ? { branchId } : {}),
    },
    include: {
      course: { include: { subject: true } },
      branch: true,
      records: true, // เพื่อดูว่าเช็คชื่อแล้วหรือยัง
    },
    orderBy: [{ startAt: "asc" }],
  });

  const items = rows.map((s) => {
    let present = 0;
    let absent = 0;
    let leave = 0;

    for (const r of s.records) {
      if (r.status === "PRESENT") present += 1;
      else if (r.status === "ABSENT") absent += 1;
      else if (r.status === "LEAVE") leave += 1;
    }

    const totalRecords = present + absent + leave;
    const hasAttendance = totalRecords > 0;

    return {
      id: s.id,
      startAt: s.startAt.toISOString(),
      endAt: s.endAt.toISOString(),
      teacher: s.teacher,
      courseTitle: s.course.title,
      subjectName: s.course.subject.name,
      branchName: s.branch.name,
      branchId: s.branchId,

      hasAttendance,
      presentCount: present,
      absentCount: absent,
      leaveCount: leave,
      totalRecords,
    };
  });

  return c.json(items);
});
