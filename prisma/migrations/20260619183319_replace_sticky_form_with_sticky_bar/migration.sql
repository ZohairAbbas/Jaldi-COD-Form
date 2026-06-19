-- Remove form-level sticky checkout button
ALTER TABLE "FormConfig" DROP COLUMN "stickyCheckoutButton";

-- Add page sticky bar settings (mobile)
ALTER TABLE "Settings" ADD COLUMN "stickyBarEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "stickyBarPosition" TEXT NOT NULL DEFAULT 'bottom',
ADD COLUMN "stickyBarAlwaysVisible" BOOLEAN NOT NULL DEFAULT true;
