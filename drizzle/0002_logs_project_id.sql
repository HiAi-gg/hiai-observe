ALTER TABLE "logs" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "logs_project_timestamp_idx" ON "logs" USING btree ("project_id","timestamp");
