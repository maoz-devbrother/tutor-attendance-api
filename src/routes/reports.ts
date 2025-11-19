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
