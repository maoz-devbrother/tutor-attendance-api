import { Hono } from "hono";
import { prisma } from "../lib/db";

export const meta = new Hono();

meta.get("/branches", async (c) => {
  const data = await prisma.branch.findMany({ orderBy: { name: "asc" } });
  return c.json(data);
});

meta.get("/subjects", async (c) => {
  const includeInactive = c.req.query("includeInactive") === "1";
  const data = await prisma.subject.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  return c.json(
    data.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      isActive: s.isActive,
    }))
  );
});

meta.get("/courses", async (c) => {
  const data = await prisma.course.findMany({
    include: { subject: true, branches: { include: { branch: true } } },
    orderBy: { title: "asc" },
  });
  return c.json(
    data.map((c0) => ({
      id: c0.id,
      subjectId: c0.subjectId,
      subjectName: c0.subject.name,
      title: c0.title,
      totalSessions: c0.totalSessions,
      branchIds: c0.branches.map((b) => b.branchId),
    }))
  );
});
