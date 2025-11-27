// routes/stats.ts
import { Hono } from "hono";
import { prisma } from "../lib/db";
import { Prisma } from "@prisma/client";
export const stats = new Hono().basePath("/stats");

stats.get("/overview", async (c) => {
  // กำหนดช่วง "วันนี้" แบบง่าย ๆ (ตาม timezone เครื่อง server)
  const now = new Date();
  const startOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0
  );
  const endOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0
  );

  const whereIncomplete: Prisma.EnrollmentWhereInput = {
    sessionsAttended: {
      lt: Prisma.Decimal ? (undefined as any) : undefined,
    } as any,
  };

  const [
    totalStudents,
    activeStudents,
    totalSubjects,
    activeSubjects,
    totalCourses,
    totalBranches,
    todaySessions,
    enrollments,
  ] = await Promise.all([
    prisma.student.count(),
    prisma.student.count({ where: { isActive: true } }),
    prisma.subject.count(),
    prisma.subject.count({ where: { isActive: true } }),
    prisma.course.count(),
    prisma.branch.count(),
    prisma.session.count({
      where: { startAt: { gte: startOfDay, lt: endOfDay } },
    }),
    prisma.enrollment.findMany({
      select: {
        sessionsPurchased: true,
        sessionsAttended: true,
      },
    }),
  ]);

  let inProgressEnrollments = 0;
  let completedEnrollments = 0;
  let overUsedEnrollments = 0;

  for (const e of enrollments) {
    const purchased = e.sessionsPurchased;
    const attended = e.sessionsAttended;

    if (attended > purchased) overUsedEnrollments++;
    else if (attended === purchased) completedEnrollments++;
    else inProgressEnrollments++;
  }

  return c.json({
    totalStudents,
    activeStudents,
    totalSubjects,
    activeSubjects,
    totalCourses,
    totalBranches,
    todaySessions,
    inProgressEnrollments,
    completedEnrollments,
    overUsedEnrollments,
  });
});
