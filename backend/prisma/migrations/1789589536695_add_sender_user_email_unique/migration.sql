-- Add a compound unique constraint on Sender (userId, email) so a user cannot
-- register the same sending address twice, and to power Prisma's generated
-- compound-unique input used by POST /api/senders idempotency checks.
ALTER TABLE "Sender" ADD CONSTRAINT "Sender_userId_email_key" UNIQUE ("userId", "email");
