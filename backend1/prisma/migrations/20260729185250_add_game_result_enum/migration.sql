/*
  Warnings:

  - The `winner` column on the `Game` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "GameResult" AS ENUM ('white', 'black', 'draw');

-- AlterTable
ALTER TABLE "Game" DROP COLUMN "winner",
ADD COLUMN     "winner" "GameResult";
