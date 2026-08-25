-- Add recordedBy relation for Contribution model
-- The recordedById column already exists; this adds the foreign key constraint
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
