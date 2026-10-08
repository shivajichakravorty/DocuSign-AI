export type TabType = "signature" | "initials" | "date" | "text";

export interface SignatureTab {
  id?: string;
  document_id?: string;
  signer_id?: string | null;
  tab_type: TabType;
  page_number: number;
  pos_x: number; // Stored as percentage (0 to 100)
  pos_y: number; // Stored as percentage (0 to 100)
  width?: number;
  height?: number;
  is_required?: boolean;
  value?: string | null;
}
