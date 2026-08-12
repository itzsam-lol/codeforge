/*
  Warnings:

  - Added the required column `originApiUrl` to the `support_ticket` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "support_ticket" ADD COLUMN     "originApiUrl" TEXT NOT NULL;
