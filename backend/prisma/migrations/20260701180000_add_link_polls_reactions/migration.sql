-- AlterTable
ALTER TABLE "LinkMessage" ADD COLUMN "pollOptions" TEXT;

-- CreateTable
CREATE TABLE "LinkMessageReaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emoji" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LinkMessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "LinkMessage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PollVote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "optionIndex" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PollVote_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "LinkMessage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "LinkMessageReaction_messageId_userId_emoji_key" ON "LinkMessageReaction"("messageId", "userId", "emoji");

-- CreateIndex
CREATE UNIQUE INDEX "PollVote_messageId_userId_key" ON "PollVote"("messageId", "userId");
