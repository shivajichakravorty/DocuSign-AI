export interface DocumentItem {
  id: string;
  user_id?: string;
  title: string;
  original_filename: string;
  file_path: string;
  file_size_bytes: string | number;
  status: "uploaded" | "processing" | "pending" | "completed" | "flagged";
  page_count?: number;
  created_at: string;
}
