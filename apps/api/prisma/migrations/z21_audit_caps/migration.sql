-- The admin's «Activity» (who changed what) and daily caps on staff generation. Additive only.

CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorStaffId" TEXT,
    "actorEmail" TEXT,
    "actorRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "section" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "country" TEXT,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditEvent_at_idx" ON "AuditEvent"("at");
CREATE INDEX "AuditEvent_country_at_idx" ON "AuditEvent"("country", "at");
CREATE INDEX "AuditEvent_actorEmail_at_idx" ON "AuditEvent"("actorEmail", "at");
CREATE INDEX "AuditEvent_section_at_idx" ON "AuditEvent"("section", "at");

-- Staff generation: who started a model call and the country it was for (null for every old row).
ALTER TABLE "ModelCall" ADD COLUMN "staffEmail" TEXT;
ALTER TABLE "ModelCall" ADD COLUMN "staffCountry" TEXT;
CREATE INDEX "ModelCall_staffEmail_createdAt_idx" ON "ModelCall"("staffEmail", "createdAt");
CREATE INDEX "ModelCall_staffCountry_createdAt_idx" ON "ModelCall"("staffCountry", "createdAt");

-- Per-person overrides of the daily cap (the defaults live in Setting staff.caps).
ALTER TABLE "StaffMember" ADD COLUMN "capUsd" DOUBLE PRECISION;
ALTER TABLE "StaffMember" ADD COLUMN "uncapped" BOOLEAN NOT NULL DEFAULT false;

-- The new right `audit` (Activity): the superadmin's list shows it; the built-in country manager
-- gets it and its countries' dashboard, keeping any rights the owner gave it.
UPDATE "StaffRole"
SET "rights" = "rights" || ARRAY(SELECT 'audit' WHERE NOT 'audit' = ANY("rights")),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'admin';
UPDATE "StaffRole"
SET "rights" = "rights" || ARRAY(
      SELECT r FROM unnest(ARRAY['dashboard', 'audit']) AS r
      WHERE NOT r = ANY("rights")
    ),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'country_manager';
