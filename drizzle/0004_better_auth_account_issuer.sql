-- Better Auth 1.7.2 requires account.issuer (same as Post 0005 / Admin 0012).
ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "issuer" text;
