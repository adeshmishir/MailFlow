-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "deliveryMessageId" TEXT,
ADD COLUMN     "deliveryPreviewUrl" TEXT,
ADD COLUMN     "deliveryProvider" TEXT;
