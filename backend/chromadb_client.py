"""
ComplianceX ChromaDB Client
Manages a local in-memory vector store of Indian compliance regulations.
Uses SentenceTransformer (all-MiniLM-L6-v2) for embeddings — downloaded once
and cached by HuggingFace Hub to ~/.cache/huggingface.

Pre-loads 8 real Indian compliance regulation snippets and exposes a semantic
search function used by both the LangGraph pipeline and the REST API.
"""

import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction

# ---------------------------------------------------------------------------
# Regulation Corpus — 8 real Indian law snippets
# ---------------------------------------------------------------------------

REGULATIONS = [
    {
        "id": "reg_001",
        "document": (
            "Section 92 of the Companies Act 2013 mandates that every company shall "
            "prepare an Annual Return in Form MGT-7 containing particulars as they "
            "stood on the close of the financial year. The Annual Return must be filed "
            "with the Registrar within 60 days from the date on which the Annual General "
            "Meeting is held. If no AGM is held, the return must be filed within 60 days "
            "from the latest date by which the AGM should have been held. Failure to file "
            "attracts a penalty of ₹50,000 for the company and ₹500 per day for every "
            "day during which the default continues, subject to a maximum of ₹5,00,000."
        ),
        "metadata": {
            "act": "Companies Act 2013",
            "section": "Section 92 — Annual Return",
            "penalty": "Rs 50,000 + Rs 500/day up to Rs 5,00,000",
        },
    },
    {
        "id": "reg_002",
        "document": (
            "Section 92(5) of the Companies Act 2013 states that if a company fails "
            "to file its annual return before the expiry of the period specified, "
            "the company shall be liable to a penalty of Rs 50,000 and in case of "
            "continuing failure, with further penalty of Rs 100 for each day during "
            "which such failure continues, subject to a maximum of Rs 5,00,000. "
            "Every officer of the company who is in default shall be liable to a "
            "penalty of Rs 50,000, and in case of continuing failure, Rs 100 per day "
            "subject to a maximum of Rs 5,00,000. Late filing with additional fee "
            "under Section 403 is permitted within 270 days of the due date."
        ),
        "metadata": {
            "act": "Companies Act 2013",
            "section": "Section 92(5) — Penalty for Non-Filing of Annual Return",
            "penalty": "Rs 50,000 + Rs 100/day up to Rs 5,00,000",
        },
    },
    {
        "id": "reg_003",
        "document": (
            "Section 164(2) of the Companies Act 2013 provides for disqualification "
            "of directors. A person shall not be eligible to be re-appointed as a "
            "director of that company, or appointed in other company for a period of "
            "five years from the date on which the said company fails to: (a) file "
            "financial statements or annual returns for any continuous period of three "
            "financial years; or (b) repay the deposits accepted by it or pay interest "
            "thereon or to redeem any debentures on the due date or pay interest due "
            "thereon or pay any dividend declared and such failure to pay or redeem "
            "continues for one year or more. MCA issues disqualification notices under "
            "Rule 14 of Companies (Appointment and Qualification of Directors) Rules 2014."
        ),
        "metadata": {
            "act": "Companies Act 2013",
            "section": "Section 164(2) — Director Disqualification",
            "penalty": "5-year bar from directorship; vacation of office under Section 167",
        },
    },
    {
        "id": "reg_004",
        "document": (
            "Section 167(1) of the Companies Act 2013 states that the office of a "
            "director shall become vacant in case the director incurs any of the "
            "disqualifications specified in Section 164. Where a director of a company "
            "becomes disqualified under Section 164(2), the director shall vacate the "
            "office in all companies other than the company in which they have committed "
            "the default. Any person who acts as a director when disqualified shall be "
            "punishable with imprisonment for a term up to one year or with fine not "
            "less than Rs 1,00,000 but which may extend to Rs 5,00,000, or with both."
        ),
        "metadata": {
            "act": "Companies Act 2013",
            "section": "Section 167(1) — Vacation of Office of Director",
            "penalty": "Imprisonment up to 1 year + fine Rs 1,00,000 to Rs 5,00,000",
        },
    },
    {
        "id": "reg_005",
        "document": (
            "Section 39 of the Central Goods and Services Tax (CGST) Act 2017 "
            "requires every registered person to furnish a return for every calendar "
            "month or quarter (for QRMP scheme taxpayers) electronically in Form GSTR-3B. "
            "Monthly filers must file by the 20th of the following month. Quarterly filers "
            "must file by the 22nd or 24th of the month following the quarter. "
            "Late fee under Section 47 is Rs 50 per day (Rs 25 CGST + Rs 25 SGST) for "
            "returns with tax liability and Rs 20 per day (Rs 10 CGST + Rs 10 SGST) for "
            "nil returns, subject to a maximum of Rs 10,000 per return."
        ),
        "metadata": {
            "act": "CGST Act 2017",
            "section": "Section 39 — Furnishing of Returns",
            "penalty": "Rs 50/day (with liability) or Rs 20/day (nil) up to Rs 10,000",
        },
    },
    {
        "id": "reg_006",
        "document": (
            "Section 47 of the CGST Act 2017 prescribes late fees for delayed filing "
            "of returns. Where a registered person fails to furnish the return required "
            "under Section 39 by the due date, they shall be liable to pay a late fee "
            "of Rs 100 for every day of delay up to Rs 5,000. If a return is not filed "
            "for six consecutive months or two consecutive quarters, the GST "
            "registration may be cancelled under Section 29(2)(c). Interest at 18% per "
            "annum is levied under Section 50 on unpaid tax from the due date. "
            "Non-filing may also attract best judgment assessment under Section 62."
        ),
        "metadata": {
            "act": "CGST Act 2017",
            "section": "Section 47 — Late Fee for Delayed GST Returns",
            "penalty": "Rs 100/day up to Rs 5,000; possible registration cancellation",
        },
    },
    {
        "id": "reg_007",
        "document": (
            "Section 234B of the Income Tax Act 1961 charges interest for default in "
            "payment of advance tax. Where an assessee who is liable to pay advance "
            "tax has failed to pay such tax or where the advance tax paid is less than "
            "90% of the assessed tax, the assessee shall be liable to pay simple interest "
            "at the rate of 1% per month or part of month on the shortfall amount. "
            "The period of interest runs from the 1st day of April of the assessment "
            "year until the date of determination of total income under Section 143(1) "
            "or regular assessment. Companies must pay advance tax in four instalments "
            "on 15th June (15%), 15th September (45%), 15th December (75%), and "
            "15th March (100%) of the estimated tax liability."
        ),
        "metadata": {
            "act": "Income Tax Act 1961",
            "section": "Section 234B — Interest for Default in Payment of Advance Tax",
            "penalty": "1% per month on shortfall from 1st April of assessment year",
        },
    },
    {
        "id": "reg_008",
        "document": (
            "Section 137 of the Companies Act 2013 mandates that a copy of the "
            "financial statements, including consolidated financial statements, if any, "
            "along with all the documents which are required to be or attached to such "
            "financial statements, duly adopted at the Annual General Meeting, shall be "
            "filed with the Registrar within 30 days of the AGM in Form AOC-4. "
            "Section 137(3) provides that if a company fails to file financial statements "
            "before the expiry of the period, the company shall be liable to a penalty "
            "of Rs 10,000 and in case of continuing failure, with further penalty of "
            "Rs 100 for each day during which such failure continues, subject to a "
            "maximum of Rs 2,00,000. Every officer in default is similarly penalised."
        ),
        "metadata": {
            "act": "Companies Act 2013",
            "section": "Section 137 — Filing of Financial Statements",
            "penalty": "Rs 10,000 + Rs 100/day up to Rs 2,00,000",
        },
    },
]

# ---------------------------------------------------------------------------
# ChromaDB Setup — uses SentenceTransformer (cached by HuggingFace Hub)
# ---------------------------------------------------------------------------

_client: chromadb.ClientAPI | None = None
_collection = None


def _get_collection():
    """Lazily initialise ChromaDB client and return the regulations collection."""
    global _client, _collection

    if _collection is not None:
        return _collection

    # SentenceTransformerEmbeddingFunction downloads the model once and caches it
    # under ~/.cache/huggingface — no ONNX runtime needed.
    ef = SentenceTransformerEmbeddingFunction(model_name="all-MiniLM-L6-v2")

    _client = chromadb.Client()  # in-memory; swap for PersistentClient if desired
    _collection = _client.get_or_create_collection(
        name="regulations",
        embedding_function=ef,
        metadata={"hnsw:space": "cosine"},
    )

    # Pre-load documents only if the collection is empty
    if _collection.count() == 0:
        _collection.add(
            ids=[r["id"] for r in REGULATIONS],
            documents=[r["document"] for r in REGULATIONS],
            metadatas=[r["metadata"] for r in REGULATIONS],
        )

    return _collection


def search_regulation(query: str, n_results: int = 2) -> list[dict]:
    """
    Perform a semantic search over the regulations collection.

    Args:
        query: Plain-English query e.g. "penalty for late annual return filing"
        n_results: Number of top matching chunks to return (default 2)

    Returns:
        List of dicts with keys: document, metadata, relevance_score
    """
    collection = _get_collection()

    results = collection.query(
        query_texts=[query],
        n_results=min(n_results, len(REGULATIONS)),
    )

    hits = []
    for doc, meta, distance in zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        hits.append({
            "document": doc,
            "metadata": meta,
            "relevance_score": round(1 - distance, 4),  # cosine distance → similarity
        })

    return hits
