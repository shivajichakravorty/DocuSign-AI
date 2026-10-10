import getpass
import os

from fastembed import TextEmbedding
import psycopg2
import pdfplumber
import anthropic
from google import genai
from dotenv import load_dotenv

load_dotenv()  # Load environment variables from .env file

DB_NAME = os.getenv("DB_NAME", "docushield")
# Default to current macOS username if DB_USER isn't set
DB_USER = os.getenv("DB_USER", getpass.getuser())
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")


# Initializes the local model (downloads once automatically, ~67MB)
embedding_model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")


def get_db_connection():
    kwargs = {
        "dbname": DB_NAME,
        "user": DB_USER,
        "host": DB_HOST,
        "port": DB_PORT,
    }
    if DB_PASSWORD:
        kwargs["password"] = DB_PASSWORD
    return psycopg2.connect(**kwargs)



def chunk_text(text: str, chunk_size: int = 400, overlap: int = 50):
    """Splits raw page text into overlapping word chunks."""
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i : i + chunk_size])
        if chunk.strip():
            chunks.append(chunk)
        i += max(1, chunk_size - overlap)
    return chunks


def ingest_document_chunks(document_id: str, file_path: str) -> int:
    """
    Extracts text per page with pdfplumber, embeds locally with FastEmbed,
    and inserts chunks into PostgreSQL pgvector.
    """
    conn = get_db_connection()
    cur = conn.cursor()

    total_chunks = 0
    with pdfplumber.open(file_path) as pdf:
        for page_idx, page in enumerate(pdf.pages):
            page_num = page_idx + 1
            page_text = page.extract_text() or ""

            if not page_text.strip():
                continue

            chunks = chunk_text(page_text)
            if not chunks:
                continue

            # Generate local 384-dim embeddings
            embeddings = list(embedding_model.embed(chunks))

            for chunk, emb in zip(chunks, embeddings):
                cur.execute(
                    """
                    INSERT INTO document_chunks (document_id, chunk_index, page_number, content, embedding)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (document_id, total_chunks, page_num, chunk, emb.tolist()),
                )
                total_chunks += 1

    conn.commit()
    cur.close()
    conn.close()
    return total_chunks

def search_document_chunks(document_id: str, query_text: str, top_k: int = 3):
    """
    Finds the most relevant chunks in a document using cosine similarity.
    """
    # 1. Embed user query with local fastembed
    query_emb = list(embedding_model.embed([query_text]))[0].tolist()

    # 2. Run cosine distance search via pgvector (<=> operator)
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT 
            id, 
            page_number, 
            content, 
            1 - (embedding <=> %s::vector) AS similarity
        FROM document_chunks
        WHERE document_id = %s
        ORDER BY embedding <=> %s::vector ASC
        LIMIT %s;
        """,
        (query_emb, document_id, query_emb, top_k),
    )
    results = cur.fetchall()
    cur.close()
    conn.close()
    return results

def answer_document_query(document_id: str, query_text: str, api_key: str = None):
    """
    Retrieves top relevant chunks from pgvector and prompts Gemini 2.5 Flash
    to formulate a grounded legal answer with citations.
    """
    gemini_key = api_key or os.getenv("GEMINI_API_KEY")
    if not gemini_key:
        raise ValueError("Missing Gemini API Key. Set GEMINI_API_KEY or pass api_key.")

    # 1. Retrieve matching chunks using existing vector search
    chunks = search_document_chunks(document_id, query_text, top_k=3)
    if not chunks:
        return {
            "answer": "No relevant sections found in this contract to answer your question.",
            "citations": []
        }

    # 2. Format context and citations
    context_blocks = []
    citations = []
    for chunk in chunks:
        chunk_id, page_num, content, score = chunk
        context_blocks.append(f"[Page {page_num}]:\n{content}")
        citations.append({
            "chunk_id": str(chunk_id),
            "page_number": page_num,
            "similarity": round(float(score), 4),
            "snippet": content[:160] + ("..." if len(content) > 160 else "")
        })

    context_str = "\n\n".join(context_blocks)

    # 3. Prompt Gemini
    client = genai.Client(api_key=gemini_key)

    prompt = f"""You are DocuShield AI, an intelligent contract analysis assistant.
Answer the user's question using ONLY the provided document excerpts.
Keep your response clear, concise, and professional.
Always cite the page number(s) that support your answer. If the excerpts do not contain the answer, state that clearly.

Document Excerpts:
{context_str}

User Question: {query_text}"""

    response = client.models.generate_content(
        model="gemini-3.8-flash",
        contents=prompt
    )

    return {
        "answer": response.text,
        "citations": citations
    }