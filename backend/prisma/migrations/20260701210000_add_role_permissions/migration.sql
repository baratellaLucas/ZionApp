-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "role" TEXT NOT NULL,
    "permKey" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT false
);

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_role_permKey_key" ON "RolePermission"("role", "permKey");
