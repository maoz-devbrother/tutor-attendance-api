// routes/stats.ts
import { Hono } from "hono";
import { prisma } from "../lib/db";
import { Prisma } from "@prisma/client";
export const stats = new Hono().basePath("/stats");

function bangkokDayRange(yyyyMmDd: string) {
  const start = new Date(`${yyyyMmDd}T00:00:00+07:00`);
  const end = new Date(`${yyyyMmDd}T23:59:59.999+07:00`);
  return { start, end };
}

stats.get("/", async (c) => {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10); // yyyy-mm-dd
  const { start, end } = bangkokDayRange(todayStr);

  // นับจำนวน object หลัก ๆ
  const [
    studentsCount,
    coursesCount,
    subjectsCount,
    branchesCount,
    enrollmentsCount,
  ] = await Promise.all([
    prisma.student.count({ where: { isActive: true } }),
    prisma.course.count(),
    prisma.subject.count({ where: { isActive: true } }),
    prisma.branch.count({ where: { isActive: true } }),
    prisma.enrollment.count(),
  ]);

  // คาบเรียนวันนี้ (เอาเรื่องเช็คชื่อ + สถานะเวลา)
  const sessions = await prisma.session.findMany({
    where: {
      startAt: { gte: start, lte: end },
    },
    include: {
      records: true,
    },
    orderBy: { startAt: "asc" },
  });

  type SessionTimeStatus =
    | "NOT_STARTED"
    | "STARTING_SOON"
    | "IN_PROGRESS"
    | "FINISHED";

  function getSessionTimeStatus(
    startAt: Date,
    endAt: Date,
    now: Date
  ): SessionTimeStatus {
    const thirtyMinutes = 30 * 60 * 1000;
    const startSoon = startAt.getTime() - thirtyMinutes;

    if (now.getTime() > endAt.getTime()) return "FINISHED";
    if (now.getTime() >= startAt.getTime() && now.getTime() <= endAt.getTime())
      return "IN_PROGRESS";
    if (now.getTime() >= startSoon && now.getTime() < startAt.getTime())
      return "STARTING_SOON";
    return "NOT_STARTED";
  }

  const now = new Date();

  let todayTotalSessions = 0;
  let todayInProgress = 0;
  let todayStartingSoon = 0;
  let todayNotStarted = 0;
  let todayFinished = 0;
  let todayChecked = 0;
  let todayNotChecked = 0;

  for (const s of sessions) {
    todayTotalSessions += 1;

    const status = getSessionTimeStatus(s.startAt, s.endAt, now);
    if (status === "IN_PROGRESS") todayInProgress += 1;
    else if (status === "STARTING_SOON") todayStartingSoon += 1;
    else if (status === "NOT_STARTED") todayNotStarted += 1;
    else if (status === "FINISHED") todayFinished += 1;

    const hasAttendance = s.records.length > 0;
    if (hasAttendance) todayChecked += 1;
    else todayNotChecked += 1;
  }

  return c.json({
    counts: {
      students: studentsCount,
      courses: coursesCount,
      subjects: subjectsCount,
      branches: branchesCount,
      enrollments: enrollmentsCount,
    },
    today: {
      date: todayStr,
      totalSessions: todayTotalSessions,
      inProgress: todayInProgress,
      startingSoon: todayStartingSoon,
      notStarted: todayNotStarted,
      finished: todayFinished,
      checked: todayChecked,
      notChecked: todayNotChecked,
    },
  });
});

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
