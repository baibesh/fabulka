-- Admin «Team»: staff and their rights live here; Keycloak only says who someone is. Staff rows are
-- made by invites in the admin and, for holders of the Keycloak realm roles admin and seo, on their
-- next sign-in. Roles are rows too, seeded with what the code had (ROLE_PERMISSIONS before this).
CREATE TYPE "StaffStatus" AS ENUM ('invited', 'active', 'disabled');

CREATE TABLE "StaffMember" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "keycloakId" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "status" "StaffStatus" NOT NULL DEFAULT 'invited',
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "realmRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastLoginAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StaffRole" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scoped" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffRole_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX "StaffMember_email_key" ON "StaffMember"("email");

CREATE UNIQUE INDEX "StaffMember_keycloakId_key" ON "StaffMember"("keycloakId");

INSERT INTO "StaffRole" ("key", "name", "rights", "scoped", "locked", "updatedAt") VALUES
    ('admin', 'Superadmin', ARRAY['dashboard','books','orders','catalog','examples','methodologies','themes','reference','journal','seo','team'], false, true, CURRENT_TIMESTAMP),
    ('seo', 'SEO', ARRAY['seo'], false, false, CURRENT_TIMESTAMP),
    ('country_manager', 'Country manager', ARRAY['examples','catalog','orders','reference.prices','reference.landing'], true, false, CURRENT_TIMESTAMP);
