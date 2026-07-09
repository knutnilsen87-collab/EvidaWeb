# 01 — Domain Principles

## Goal

The EVIDA document uploader is not a normal RAG uploader. It is a legal evidence ingestion pipeline.

The system must feel fast while staying honest about what is and is not ready to use as evidence.

## Core distinction

Separate these concepts:

```text
Availability:
  What content technically exists in the index now?

Readiness:
  What is the verified source state of the document?

Usage mode:
  How may AI/retrieval use the material?

A page can be technically indexed without the document being fully source-ready.

Product standard
First usable value in seconds.
Full case coverage in the background.
No false green.
Legal integrity standard

The system must never imply that a document is fully evaluated when only part of it is available.

Example risk:

Page 1 says landlord covers maintenance.
Page 50 contains an amendment saying tenant covers maintenance.

Therefore:

page/chunk content may become available early
document-level source readiness must remain controlled
chat must disclose partial coverage
Required domain authority

SourceReadinessEvaluator is the only authority that can decide:

whether a document is not ready, partial, ready or failed
how retrieval/chat may use the document
whether disclosure is required
whether ingestion is closed
whether permanent gaps exist

No parser, OCR worker, React component or LLM prompt may independently decide these things.

User-experience principle

Backend is strict. UI is calm.

Lawyers should see:

Klar som kilde
Delvis klar
Behandles
Klar med merknad
Behandling feilet

They should not see by default:

SourceReadiness
page_units
usageMode
OCR_FAILED
PDF_PARSE_FAILED
UUIDs
stack traces

Technical details belong behind an expandable "Vis tekniske detaljer" panel.

Small-document rule

Documents with totalPages <= 5 must not become PARTIAL.

Reason: the time saved is negligible and legal context risk is high.

Small documents should wait for one of:

READY + FULL
READY + FULL_WITH_PERMANENT_DISCLOSURE
FAILED + NONE
Terminal partiality

If all processing attempts are complete and some pages are permanently unreadable, the ingestion loop should close.

But it must close as:

status = READY
usageMode = FULL_WITH_PERMANENT_DISCLOSURE

not:

status = READY
usageMode = FULL

