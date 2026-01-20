-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentMethod" TEXT NOT NULL DEFAULT 'cod';

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "enableCartPermalink" BOOLEAN NOT NULL DEFAULT false;
