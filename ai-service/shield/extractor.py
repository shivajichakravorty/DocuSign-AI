import pdfplumber
from presidio_analyzer import AnalyzerEngine, PatternRecognizer, Pattern
from presidio_anonymizer import AnonymizerEngine

analyzer = AnalyzerEngine()
anonymizer = AnonymizerEngine()

# Add a reliable SSN regex recognizer if not active by default
ssn_pattern = Pattern(name="ssn_regex", regex=r"\b\d{3}-\d{2}-\d{4}\b", score=0.85)
ssn_recognizer = PatternRecognizer(supported_entity="US_SSN", patterns=[ssn_pattern])
analyzer.registry.add_recognizer(ssn_recognizer)

def extract_pdf_pii(file_path: str):
    """
    Extracts text from each PDF page, detects PII entities, 
    and computes normalized page-relative bounding boxes for the frontend viewer.
    """
    results = []
    
    with pdfplumber.open(file_path) as pdf:
        for page_idx, page in enumerate(pdf.pages):
            page_num = page_idx + 1
            page_width = float(page.width)
            page_height = float(page.height)
            
            # Extract words with spatial bounding boxes
            words = page.extract_words(use_text_flow=True, extra_attrs=["fontname", "size"])
            if not words:
                continue

            # Construct continuous text and track character-to-word mappings
            page_text = ""
            char_word_map = []
            
            for word_idx, w in enumerate(words):
                word_text = w["text"]
                start_char = len(page_text)
                page_text += word_text + " "
                end_char = len(page_text) - 1
                
                char_word_map.append({
                    "start": start_char,
                    "end": end_char,
                    "word": w
                })

            if not page_text.strip():
                continue

            # Run Presidio analysis on the reconstructed page text
            detections = analyzer.analyze(text=page_text, language="en")

            # Map detected entity character spans to word coordinates
            page_entities = []
            for det in detections:
                matched_words = [
                    item["word"] for item in char_word_map
                    if not (item["end"] < det.start or item["start"] > det.end)
                ]

                if not matched_words:
                    continue

                # Compute combined bounding box for matched tokens
                min_x0 = min(w["x0"] for w in matched_words)
                min_top = min(w["top"] for w in matched_words)
                max_x1 = max(w["x1"] for w in matched_words)
                max_bottom = max(w["bottom"] for w in matched_words)

                # Convert to percentage-based coordinates for responsive canvas rendering
                pos_x_pct = round((min_x0 / page_width) * 100, 2)
                pos_y_pct = round((min_top / page_height) * 100, 2)
                width_pct = round(((max_x1 - min_x0) / page_width) * 100, 2)
                height_pct = round(((max_bottom - min_top) / page_height) * 100, 2)

                page_entities.append({
                    "type": det.entity_type,
                    "text": page_text[det.start:det.end],
                    "confidence": round(det.score, 2),
                    "page_number": page_num,
                    "bbox": {
                        "x_percent": pos_x_pct,
                        "y_percent": pos_y_pct,
                        "width_percent": width_pct,
                        "height_percent": height_pct
                    }
                })

            results.append({
                "page_number": page_num,
                "page_width": page_width,
                "page_height": page_height,
                "entities_count": len(page_entities),
                "entities": page_entities
            })

    return results
