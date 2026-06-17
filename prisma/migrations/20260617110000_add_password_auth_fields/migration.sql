-- AlterTable
ALTER TABLE "users"
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "passwordSalt" TEXT,
ADD COLUMN     "passwordIterations" INTEGER;
