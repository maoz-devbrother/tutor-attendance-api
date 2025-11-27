// routes/reports.ts
import { Hono } from "hono";
import { prisma } from "../lib/db";
import type { Prisma } from "@prisma/client";

export const reports = new Hono().basePath("/reports");

// GET /api/reports/enrollments
reports.get("/enrollments", async (c) => {
  const branchId = c.req.query("branchId") || undefined;
  const courseId = c.req.query("courseId") || undefined;
  const statusFilter = c.req.query("status") || undefined; // incomplete | complete | over
  const q = c.req.query("q")?.trim() || "";

  const where: Prisma.EnrollmentWhereInput = {};

  if (branchId) where.branchId = branchId;
  if (courseId) where.courseId = courseId;

  if (q) {
    where.student = {
      OR: [
        { code: { contains: q, mode: "insensitive" } },
        { fullName: { contains: q, mode: "insensitive" } },
      ],
    };
  }

  const enrollments = await prisma.enrollment.findMany({
    where,
    include: {
      student: true,
      course: { include: { subject: true } },
      branch: true,
    },
    orderBy: [{ student: { code: "asc" } }, { course: { title: "asc" } }],
  });

  const items = enrollments
    .map((e) => {
      const sessionsPurchased = e.sessionsPurchased;
      const sessionsAttended = e.sessionsAttended;

      let status: "COMPLETE" | "IN_PROGRESS" | "OVER";
      if (sessionsAttended > sessionsPurchased) status = "OVER";
      else if (sessionsAttended === sessionsPurchased) status = "COMPLETE";
      else status = "IN_PROGRESS";

      // แปลง statusFilter จาก query ให้ตรงกับ status
      if (statusFilter === "complete" && status !== "COMPLETE") return null;
      if (statusFilter === "incomplete" && status !== "IN_PROGRESS")
        return null;
      if (statusFilter === "over" && status !== "OVER") return null;

      const progressPercent =
        sessionsPurchased > 0
          ? Math.round((sessionsAttended / sessionsPurchased) * 100)
          : 0;

      return {
        id: e.id,
        studentId: e.studentId,
        studentCode: e.student.code,
        studentName: e.student.fullName,
        courseId: e.courseId,
        courseTitle: e.course.title,
        subjectName: e.course.subject.name,
        branchId: e.branchId,
        branchName: e.branch.name,
        sessionsPurchased,
        sessionsAttended,
        progressPercent,
        status, // "COMPLETE" | "IN_PROGRESS" | "OVER"
      };
    })
    .filter(Boolean); // ตัด null ออกหลัง filter status

  return c.json({ items });
});

reports.get("/teachers", async (c) => {
  const from = c.req.query("from");
  const to = c.req.query("to");
  const branchId = c.req.query("branchId");

  const whereSession: any = {
    // เอาเฉพาะที่มีชื่อครู
    teacher: { not: null },
  };

  if (branchId) {
    whereSession.branchId = branchId;
  }

  if (from || to) {
    whereSession.startAt = {};
    if (from) whereSession.startAt.gte = new Date(from);
    if (to) whereSession.startAt.lte = new Date(to + "T23:59:59.999Z");
  }

  const sessions = await prisma.session.findMany({
    where: whereSession,
    include: {
      records: true, // Attendance[]
      branch: true,
      course: { include: { subject: true } },
    },
  });

  type Acc = {
    teacher: string;
    sessions: number;
    studentsPresent: number;
    studentsAbsent: number;
    studentsLeave: number;
  };

  const map = new Map<string, Acc>();

  for (const s of sessions) {
    const teacherName = s.teacher?.trim() || "ไม่ระบุ";

    if (!map.has(teacherName)) {
      map.set(teacherName, {
        teacher: teacherName,
        sessions: 0,
        studentsPresent: 0,
        studentsAbsent: 0,
        studentsLeave: 0,
      });
    }

    const acc = map.get(teacherName)!;
    acc.sessions += 1;

    for (const r of s.records) {
      if (r.status === "PRESENT") acc.studentsPresent += 1;
      else if (r.status === "ABSENT") acc.studentsAbsent += 1;
      else if (r.status === "LEAVE") acc.studentsLeave += 1;
    }
  }

  const items = Array.from(map.values()).sort((a, b) =>
    a.teacher.localeCompare(b.teacher, "th")
  );

  return c.json({ items });
});
