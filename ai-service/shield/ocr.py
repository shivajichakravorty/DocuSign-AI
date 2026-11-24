import io
import fitz  # PyMuPDF
from PIL import Image
import pytesseract
from pytesseract import Output


def ocr_pdf_page(pdf_path: str, page_index: int, dpi: int = 200) -> dict:
    """
    Renders a 0-indexed PDF page to an image using PyMuPDF and runs Tesseract OCR.
    Returns:
      {
        "text": str,
        "words": [{"text": str, "x0": float, "top": float, "x1": float, "bottom": float}, ...],
        "width": float,
        "height": float,
      }
    """
    doc = fitz.open(pdf_path)
    try:
        page = doc[page_index]
        page_width = float(page.rect.width)
        page_height = float(page.rect.height)

        zoom = dpi / 72.0
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
        img = Image.open(io.BytesIO(pix.tobytes("png")))

        ocr_data = pytesseract.image_to_data(img, output_type=Output.DICT)
        words = []
        text_tokens = []

        n_boxes = len(ocr_data["text"])
        for i in range(n_boxes):
            word_text = (ocr_data["text"][i] or "").strip()
            conf = float(ocr_data["conf"][i])
            if not word_text or conf < 30:
                continue

            # Scale pixel coordinates back to PDF point coordinates (72 DPI)
            x0 = ocr_data["left"][i] / zoom
            top = ocr_data["top"][i] / zoom
            x1 = (ocr_data["left"][i] + ocr_data["width"][i]) / zoom
            bottom = (ocr_data["top"][i] + ocr_data["height"][i]) / zoom

            words.append({
                "text": word_text,
                "x0": x0,
                "top": top,
                "x1": x1,
                "bottom": bottom,
            })
            text_tokens.append(word_text)

        return {
            "text": " ".join(text_tokens),
            "words": words,
            "width": page_width,
            "height": page_height,
        }
    finally:
        doc.close()


def extract_full_text_with_ocr_fallback(pdf_path: str) -> str:
    """
    Extracts text from all pages using pdfplumber first; falls back to Tesseract OCR
    on any page where extracted text is empty (e.g., scanned/image-only pages).
    """
    import pdfplumber

    full_text_parts = []
    with pdfplumber.open(pdf_path) as pdf:
        for idx, page in enumerate(pdf.pages):
            text = (page.extract_text() or "").strip()
            if not text:
                ocr_res = ocr_pdf_page(pdf_path, idx)
                text = ocr_res["text"]
            full_text_parts.append(text)
    return "\n".join(full_text_parts)
