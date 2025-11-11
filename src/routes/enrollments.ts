// api/src/routes/enrollments.ts
import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/db";

export const enrollments = new Hono().basePath("/enrollments");

const CreateEnrollmentSchema = z.object({
  studentId: z.string().min(1),
  courseId: z.string().min(1),
  branchId: z.string().min(1),
  sessionsPurchased: z.number().int().positive(),
});

enrollments.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateEnrollmentSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { studentId, courseId, branchId, sessionsPurchased } = parsed.data;

  // ตรวจว่าคอร์สและสาขาสัมพันธ์กันจริง
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { branches: { select: { branchId: true } } },
  });
  if (!course) return c.json({ error: { message: "ไม่พบคอร์ส" } }, 404);

  const allowedBranchIds = new Set(course.branches.map((b) => b.branchId));
  if (!allowedBranchIds.has(branchId)) {
    return c.json(
      {
        error: {
          code: "BRANCH_NOT_ALLOWED",
          message: "สาขานี้ไม่ได้เปิดสอนคอร์สดังกล่าว",
        },
      },
      409
    );
  }

  // กันซ้ำ: นักเรียนเดียวกัน-คอร์สเดียวกัน
  const dup = await prisma.enrollment.findUnique({
    where: { studentId_courseId: { studentId, courseId } },
    select: { id: true },
  });
  if (dup) {
    return c.json(
      {
        error: {
          code: "DUPLICATE_ENROLLMENT",
          message: "มีการลงทะเบียนคอร์สนี้แล้ว",
        },
      },
      409
    );
  }

  const created = await prisma.enrollment.create({
    data: {
      studentId,
      courseId,
      branchId,
      sessionsPurchased,
      sessionsAttended: 0,
      status: "ACTIVE",
    },
    include: {
      course: { include: { subject: true } },
      branch: true,
    },
  });

  return c.json(
    {
      id: created.id,
      courseId: created.courseId,
      courseTitle: created.course.title,
      subjectName: created.course.subject.name,
      sessionsPurchased: created.sessionsPurchased,
      sessionsAttended: created.sessionsAttended,
      branchId: created.branchId,
      branchName: created.branch.name,
    },
    201
  );
});
