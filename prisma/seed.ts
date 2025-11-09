import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // branches
  const bkk = await prisma.branch.upsert({
    where: { code: "bkk" },
    update: {},
    create: { code: "bkk", name: "สาขากรุงเทพ" },
  });
  const cnx = await prisma.branch.upsert({
    where: { code: "cnx" },
    update: {},
    create: { code: "cnx", name: "สาขาเชียงใหม่" },
  });

  // subjects
  const math = await prisma.subject.upsert({
    where: { code: "math" },
    update: {},
    create: { code: "math", name: "คณิตศาสตร์" },
  });
  const eng = await prisma.subject.upsert({
    where: { code: "eng" },
    update: {},
    create: { code: "eng", name: "ภาษาอังกฤษ" },
  });

  // courses
  const cMath = await prisma.course.create({
    data: {
      subjectId: math.id,
      title: "Math G.9 Intensive",
      totalSessions: 12,
      branches: { create: [{ branchId: bkk.id }, { branchId: cnx.id }] },
    },
  });
  const cEng = await prisma.course.create({
    data: {
      subjectId: eng.id,
      title: "ENG Speaking A1",
      totalSessions: 10,
      branches: { create: [{ branchId: bkk.id }] },
    },
  });

  // students
  const s1 = await prisma.student.create({
    data: { code: "S001", fullName: "ธีรภัทร ชาญวิทย์" },
  });
  const s2 = await prisma.student.create({
    data: { code: "S002", fullName: "ชนัญชิดา ศรีรัตน์" },
  });
  const s3 = await prisma.student.create({
    data: { code: "S003", fullName: "จักรินทร์ ณภัทร" },
  });

  // enrollments
  await prisma.enrollment.createMany({
    data: [
      {
        studentId: s1.id,
        courseId: cMath.id,
        sessionsPurchased: 12,
        sessionsAttended: 3,
      },
      {
        studentId: s2.id,
        courseId: cMath.id,
        sessionsPurchased: 12,
        sessionsAttended: 2,
      },
      {
        studentId: s3.id,
        courseId: cEng.id,
        sessionsPurchased: 10,
        sessionsAttended: 1,
      },
    ],
    skipDuplicates: true,
  });

  // sessions today
  const now = new Date();
  const at = (h: number) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate(), h);
  await prisma.session.createMany({
    data: [
      {
        courseId: cMath.id,
        branchId: bkk.id,
        startAt: at(10),
        endAt: at(12),
        teacher: "ครูปอ",
      },
      {
        courseId: cEng.id,
        branchId: bkk.id,
        startAt: at(13),
        endAt: at(15),
        teacher: "ครูแอน",
      },
    ],
  });

  console.log("Seed completed ✔");
}

main().finally(() => prisma.$disconnect());
