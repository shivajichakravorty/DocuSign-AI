import hashlib
import fitz # PyMuPDF
from datetime import datetime, timezone


def compute_sha256(file_bytes: bytes) -> str:
    return hashlib.sha256(file_bytes).hexdigest()


def flatten_and_certify_pdf(
    input_path: str,
    output_path: str,
    redactions: list[dict] | None = None,
    tabs: list[dict] | None = None,
    certificate_data: dict | None = None,
) -> dict:
    """
    1. Permanently scrubs PII bounding boxes from the PDF binary stream.
    2. Burns completed signature/date/text tabs onto the PDF pages.
    3. Appends a cryptographic Certificate of Completion page (if certificate_data is provided).
    Returns pre- and post-processing SHA-256 hashes.
    """
    redactions = redactions or []
    tabs = tabs or []

    with open(input_path, "rb") as f:
        original_bytes = f.read()
    original_hash = compute_sha256(original_bytes)

    doc = fitz.open(input_path)

    # 1. Apply true binary redactions per page
    for page_idx in range(len(doc)):
        page = doc[page_idx]
        page_num = page_idx + 1
        pw = page.rect.width
        ph = page.rect.height

        page_redactions = [
            r for r in redactions
            if r.get("page_number") == page_num and r.get("is_masked", True)
        ]

        if page_redactions:
            for r in page_redactions:
                x0 = (float(r["pos_x"]) / 100.0) * pw
                y0 = (float(r["pos_y"]) / 100.0) * ph
                x1 = x0 + (float(r["width"]) / 100.0) * pw
                y1 = y0 + (float(r["height"]) / 100.0) * ph

                rect = fitz.Rect(x0, y0, x1, y1)
                page.add_redact_annot(
                    rect,
                    text=f"[{r.get('entity_type', 'REDACTED')}]",
                    fill=(0.07, 0.09, 0.14),
                    text_color=(1, 1, 1),
                    fontsize=7,
                )
            # Scrubs underlying characters from the PDF content stream
            page.apply_redactions()

    # 2. Burn completed signature/date/text tabs onto pages
    for page_idx in range(len(doc)):
        page = doc[page_idx]
        page_num = page_idx + 1
        pw = page.rect.width
        ph = page.rect.height

        page_tabs = [
            t for t in tabs
            if t.get("page_number") == page_num and t.get("value")
        ]

        for t in page_tabs:
            # Frontend centers tabs at (pos_x%, pos_y%)
            cx = (float(t["pos_x"]) / 100.0) * pw
            cy = (float(t["pos_y"]) / 100.0) * ph
            box_w = float(t.get("width") or 130)
            box_h = float(t.get("height") or 34)

            rect = fitz.Rect(
                max(10, cx - box_w / 2),
                max(10, cy - box_h / 2),
                min(pw - 10, cx + box_w / 2),
                min(ph - 10, cy + box_h / 2),
            )

            tab_type = t.get("tab_type", "signature")
            val = str(t["value"])

            # Draw subtle verification stamp border & fill
            page.draw_rect(
                rect,
                color=(0.06, 0.72, 0.50),
                fill=(0.94, 0.99, 0.97),
                width=0.8,
            )

            fontname = "times-italic" if tab_type in ("signature", "initials") else "helv"
            fontsize = 11 if tab_type in ("signature", "initials") else 9

            page.insert_textbox(
                rect,
                val,
                fontsize=fontsize,
                fontname=fontname,
                color=(0.02, 0.37, 0.27),
                align=fitz.TEXT_ALIGN_CENTER,
            )

    # 3. Append Cryptographic Audit Certificate Page
    if certificate_data:
        cert_page = doc.new_page(width=612, height=792)  # Standard US Letter
        y = 54

        # Header banner
        cert_page.draw_rect(fitz.Rect(36, 36, 576, 102), fill=(0.06, 0.09, 0.16))
        cert_page.insert_text(
            (52, 66),
            "DOCUSHIELD AI — CRYPTOGRAPHIC CERTIFICATE OF COMPLETION",
            fontsize=12,
            fontname="helv",
            color=(1, 1, 1),
        )
        cert_page.insert_text(
            (52, 86),
            f"Generated UTC: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}",
            fontsize=8.5,
            fontname="helv",
            color=(0.64, 0.71, 0.82),
        )

        y = 130
        cert_page.insert_text((40, y), "ENVELOPE & INTEGRITY METADATA", fontsize=10, fontname="helv", color=(0.15, 0.23, 0.37))
        y += 18

        meta_lines = [
            f"Document Title: {certificate_data.get('title', 'Untitled Document')}",
            f"Document ID: {certificate_data.get('document_id', 'N/A')}",
            f"Original SHA-256: {original_hash}",
            f"Compliance Score: {certificate_data.get('compliance_score', 'N/A')} / 100 ({certificate_data.get('risk_level', 'Unscanned')})",
            f"Redacted PII Entities Scrubbed: {sum(1 for r in redactions if r.get('is_masked', True))}",
        ]
        for line in meta_lines:
            cert_page.insert_text((44, y), line, fontsize=8.5, fontname="courier", color=(0.1, 0.1, 0.15))
            y += 16

        y += 14
        cert_page.draw_line((40, y), (572, y), color=(0.82, 0.85, 0.90), width=0.8)
        y += 22

        cert_page.insert_text((40, y), "SIGNER VERIFICATION LOG", fontsize=10, fontname="helv", color=(0.15, 0.23, 0.37))
        y += 18

        signers = certificate_data.get("signers", [])
        if not signers:
            cert_page.insert_text((44, y), "No external signers attached (Sanitized Export Only).", fontsize=9, fontname="helv", color=(0.4, 0.45, 0.5))
            y += 18
        else:
            for s in signers:
                signer_line = (
                    f"• {s.get('full_name', 'Signer')} <{s.get('email', '')}> | "
                    f"Status: {str(s.get('status', 'pending')).upper()} | "
                    f"Signed At: {s.get('signed_at') or 'Pending'}"
                )
                cert_page.insert_text((44, y), signer_line, fontsize=8.5, fontname="helv", color=(0.1, 0.15, 0.2))
                y += 16

    doc.save(output_path, garbage=4, deflate=True)
    doc.close()

    with open(output_path, "rb") as f:
        final_bytes = f.read()
    final_hash = compute_sha256(final_bytes)

    return {
        "original_sha256": original_hash,
        "final_sha256": final_hash,
        "redactions_applied": sum(1 for r in redactions if r.get("is_masked", True)),
        "tabs_burned": sum(1 for t in tabs if t.get("value")),
    }
