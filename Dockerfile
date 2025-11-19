# ---------- deps ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY . .
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma/

# Prisma client (generate ที่ build stage)
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/postgres?schema=public"
RUN if [ -d prisma ]; then npx prisma generate; fi

# Build TypeScript -> dist
RUN if [ -f tsconfig.build.json ]; then yarn build; else echo "no ts build"; fi

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
COPY prisma ./prisma/

# 🧩 Prisma runtime deps บน Alpine
RUN apk add --no-cache libc6-compat openssl

# ใช้ package.json
COPY --from=build /app/package.json ./

# ✅ สำคัญ: เอา node_modules จาก build (ซึ่งมีไฟล์ generate แล้ว)
COPY --from=build /app/node_modules ./node_modules

# โค้ดคอมไพล์แล้ว + prisma schema (ถ้าต้อง migration/seed ภายหลัง)
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

# (ทางเลือกความชัวร์) รัน generate อีกครั้งใน runtime — ไม่บังคับ แต่กันพลาด
# RUN npx prisma generate

# ถ้า package.json ยังมี "type":"module" และคุณ build เป็น CJS ให้ลบออก
RUN node -e "const fs=require('fs');const p=require('./package.json');delete p.type;fs.writeFileSync('package.json',JSON.stringify(p,null,2));"

EXPOSE 8787
CMD ["node", "dist/index.js"]
