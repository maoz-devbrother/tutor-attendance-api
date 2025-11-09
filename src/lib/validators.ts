import { z } from "zod";

export const saveAttendanceSchema = z.object({
  items: z.array(z.object({
    studentId: z.string().min(1),
    status: z.enum(["PRESENT", "ABSENT", "LEAVE"]),
    note: z.string().optional()
  }))
});

export const listSessionsQuerySchema = z.object({
  date: z.string().optional(),       // ISO yyyy-mm-dd
  branchId: z.string().optional(),
  subjectId: z.string().optional()
});
