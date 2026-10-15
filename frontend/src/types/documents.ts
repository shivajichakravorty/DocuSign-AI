export interface DocumentItem {
  id: string;
  title: string;
  file_path: string;
  original_filename: string;
  status: string;
  created_at: string;
  user_id?: string;

  // Phase 1 Async Audit fields
  audit_status?:
    | "idle"
    | "queued"
    | "processing"
    | "completed"
    | "failed"
    | string;
  audit_job_id?: string | null;
  risk_score?: number | null;
  completed_at?: string | null;
}
