-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tabletops" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tabletops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploaded_files" (
    "id" UUID NOT NULL,
    "tabletopId" UUID NOT NULL,
    "blobContainer" TEXT NOT NULL,
    "blobPath" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "contentType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deleteStatus" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "uploaded_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_runs" (
    "id" UUID NOT NULL,
    "tabletopId" UUID NOT NULL,
    "model" TEXT NOT NULL,
    "promptType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deletion_logs" (
    "id" UUID NOT NULL,
    "tabletopId" UUID NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "deletion_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "tabletops_userId_idx" ON "tabletops"("userId");

-- CreateIndex
CREATE INDEX "tabletops_status_idx" ON "tabletops"("status");

-- CreateIndex
CREATE INDEX "tabletops_deletedAt_idx" ON "tabletops"("deletedAt");

-- CreateIndex
CREATE INDEX "uploaded_files_tabletopId_idx" ON "uploaded_files"("tabletopId");

-- CreateIndex
CREATE INDEX "uploaded_files_deleteStatus_idx" ON "uploaded_files"("deleteStatus");

-- CreateIndex
CREATE INDEX "uploaded_files_deletedAt_idx" ON "uploaded_files"("deletedAt");

-- CreateIndex
CREATE INDEX "ai_runs_tabletopId_idx" ON "ai_runs"("tabletopId");

-- CreateIndex
CREATE INDEX "ai_runs_promptType_idx" ON "ai_runs"("promptType");

-- CreateIndex
CREATE INDEX "deletion_logs_tabletopId_idx" ON "deletion_logs"("tabletopId");

-- CreateIndex
CREATE INDEX "deletion_logs_status_idx" ON "deletion_logs"("status");

-- AddForeignKey
ALTER TABLE "tabletops" ADD CONSTRAINT "tabletops_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_tabletopId_fkey" FOREIGN KEY ("tabletopId") REFERENCES "tabletops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_tabletopId_fkey" FOREIGN KEY ("tabletopId") REFERENCES "tabletops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deletion_logs" ADD CONSTRAINT "deletion_logs_tabletopId_fkey" FOREIGN KEY ("tabletopId") REFERENCES "tabletops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
