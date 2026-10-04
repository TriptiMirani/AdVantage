import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// Load repo-root .env whether we start from /server or the repo root.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  // z.string().url() rejects postgresql:// on some Zod versions; require a non-empty string.
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment: ${issues}`);
}

export const config = parsed.data;
