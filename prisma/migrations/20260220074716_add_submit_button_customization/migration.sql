-- AlterTable
ALTER TABLE "FormConfig" ADD COLUMN     "submitButtonBgColor" TEXT NOT NULL DEFAULT 'rgba(0,0,0,1)',
ADD COLUMN     "submitButtonFontSize" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "submitButtonIcon" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "submitButtonTextColor" TEXT NOT NULL DEFAULT 'rgba(255,255,255,1)';
