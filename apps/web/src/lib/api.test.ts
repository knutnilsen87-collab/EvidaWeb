import { afterEach, describe, expect, it, vi } from "vitest";
import { EVIDA_TENANT_HEADER } from "./auth";
import {
  approveDocumentForIngestion,
  archiveDocument,
  askSaksromQuestion,
  checkDocumentDuplicates,
  downloadDocumentUrl,
  ensureBackendCaseId,
  fetchCases,
  fetchCaseDocuments,
  fetchSourceUnitWindow,
  getHeaders,
  ingestDocument,
  rejectDocument,
  searchSourceUnits,
  streamSaksromSummary,
  toUuid,
  uploadDocument,
  uploadDocuments
} from "./api";

describe("web API tenant upload contract", () => {
  const tenantId = "00000000-0000-0000-0000-000000000101";

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("adds JSON content type and tenant context for JSON calls", () => {
    sessionStorage.setItem("jwt", "token-123");

    expect(getHeaders("00000000-0000-0000-0000-000000000101")).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer token-123",
      [EVIDA_TENANT_HEADER]: "00000000-0000-0000-0000-000000000101"
    });
  });

  it("fetches tenant documents from backend list endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "doc_upload_1",
          tenantId: "00000000-0000-0000-0000-000000000101",
          createdBy: "user_1",
          filename: "case.pdf",
          originalFilename: "case.pdf",
          size: 4,
          contentType: "application/pdf",
          sha256: "hash",
          status: "QUARANTINE",
          message: "Dokument ligger i karantene."
        }
      ]
    });
    vi.stubGlobal("fetch", fetchMock);

    const documents = await fetchCaseDocuments("case_web_demo", "00000000-0000-0000-0000-000000000101");

    expect(documents[0]).toEqual(expect.objectContaining({ filename: "case.pdf", status: "quarantine" }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/documents?caseId=00000000-0000-0000-0000-000000000000",
      expect.objectContaining({
        headers: {
          [EVIDA_TENANT_HEADER]: "00000000-0000-0000-0000-000000000101"
        }
      })
    );
  });

  it("fetches cases from the backend with tenant context", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: "dddddddd-1111-4222-8333-444444444444",
          tenantId,
          title: "Holands Hage",
          status: "OPEN",
          localFirst: true
        }
      ]
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCases(tenantId)).resolves.toEqual([
      expect.objectContaining({ id: "dddddddd-1111-4222-8333-444444444444", title: "Holands Hage" })
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/cases",
      expect.objectContaining({
        headers: expect.objectContaining({ [EVIDA_TENANT_HEADER]: tenantId })
      })
    );
  });

  it("downloads a document as a blob object URL via the tenant-scoped download endpoint", async () => {
    const blob = new Blob(["pdf-bytes"]);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
    vi.stubGlobal("fetch", fetchMock);

    const originalCreateObjectURL = URL.createObjectURL;
    const createObjectURLMock = vi.fn().mockReturnValue("blob:http://localhost/doc_1");
    (URL as any).createObjectURL = createObjectURLMock;

    try {
      const url = await downloadDocumentUrl("doc_1", tenantId);

      expect(url).toBe("blob:http://localhost/doc_1");
      expect(createObjectURLMock).toHaveBeenCalledWith(blob);
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/documents/doc_1/download",
        expect.objectContaining({
          headers: {
            [EVIDA_TENANT_HEADER]: tenantId
          }
        })
      );
    } finally {
      (URL as any).createObjectURL = originalCreateObjectURL;
    }
  });

  it("throws the backend error message when document download is rejected", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ message: "Dokument ikke funnet." })
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(downloadDocumentUrl("doc_missing", tenantId)).rejects.toThrow("Dokument ikke funnet.");
  });

  it("uploads a document with tenant header and FormData body", async () => {
    sessionStorage.setItem("jwt", "token-123");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "doc_upload_1",
        tenantId: "00000000-0000-0000-0000-000000000101",
        createdBy: "user_1",
        filename: "case.pdf",
        originalFilename: "case.pdf",
        size: 4,
        contentType: "application/pdf",
        sha256: "hash",
        status: "QUARANTINE",
        message: "Dokument mottatt i karantene-slusen. Venter på verifisering."
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await uploadDocument(
      new File(["test"], "case.pdf", { type: "application/pdf" }),
      "00000000-0000-0000-0000-000000000101"
    );

    expect(response.status).toBe("QUARANTINE");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/documents/upload",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
        headers: {
          Authorization: "Bearer token-123",
          [EVIDA_TENANT_HEADER]: "00000000-0000-0000-0000-000000000101"
        }
      })
    );
  });

  it("throws a clear error when upload is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ message: "Tenant-kontekst stemmer ikke" })
      })
    );

    await expect(
      uploadDocument(
        new File(["test"], "case.pdf", { type: "application/pdf" }),
        "00000000-0000-0000-0000-000000000101"
      )
    ).rejects.toThrow("Tenant-kontekst stemmer ikke");
  });

  it("maps upload security codes to safe Norwegian messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ status: "UPLOAD_REJECTED_CONTENT_TYPE_MISMATCH" })
      })
    );

    await expect(
      uploadDocument(
        new File(["test"], "case.pdf", { type: "application/pdf" }),
        "00000000-0000-0000-0000-000000000101"
      )
    ).rejects.toThrow("Filens innhold stemmer ikke med filtypekontrakten.");
  });

  it("rejects document upload when case id is not a backend UUID", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadDocument(
        new File(["test"], "case.pdf", { type: "application/pdf" }),
        "00000000-0000-0000-0000-000000000101",
        "Morten test sak"
      )
    ).rejects.toThrow("Backend case UUID mangler for opplasting.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uploads multiple documents through the quarantine endpoint", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "doc_1", status: "QUARANTINE" })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "doc_2", status: "QUARANTINE" })
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadDocuments(
      [
        new File(["a"], "a.pdf", { type: "application/pdf" }),
        new File(["b"], "b.pdf", { type: "application/pdf" })
      ],
      "00000000-0000-0000-0000-000000000101"
    );

    expect(result).toEqual({ success: true, job_id: "doc_1,doc_2" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends the active caseId with the duplicate check so semantics stay case-scoped", async () => {
    const backendCaseId = "9d7dec83-b9dc-46db-a17c-1195fc3ac96f";
    const hash = "a".repeat(64);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ sha256: hash, exists: false, documentId: null, status: null }]
    });
    vi.stubGlobal("fetch", fetchMock);

    await checkDocumentDuplicates([hash], tenantId, backendCaseId);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/documents/check-duplicates",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ hashes: [hash], caseId: backendCaseId })
      })
    );
  });

  it("maps legacy case names to the same UUID for duplicate check as for upload", async () => {
    const hash = "b".repeat(64);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ sha256: hash, exists: false, documentId: null, status: null }]
    });
    vi.stubGlobal("fetch", fetchMock);

    await checkDocumentDuplicates([hash], tenantId, "case_web_demo");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/documents/check-duplicates",
      expect.objectContaining({
        body: JSON.stringify({ hashes: [hash], caseId: toUuid("case_web_demo") })
      })
    );
  });

  it("omits caseId from duplicate check when no case context is given", async () => {
    const hash = "c".repeat(64);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ sha256: hash, exists: false, documentId: null, status: null }]
    });
    vi.stubGlobal("fetch", fetchMock);

    await checkDocumentDuplicates([hash], tenantId);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/documents/check-duplicates",
      expect.objectContaining({ body: JSON.stringify({ hashes: [hash] }) })
    );
  });

  it("returns backend case UUIDs unchanged without calling the cases API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      ensureBackendCaseId("9d7dec83-b9dc-46db-a17c-1195fc3ac96f", tenantId)
    ).resolves.toBe("9d7dec83-b9dc-46db-a17c-1195fc3ac96f");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves a case name to an existing backend case matched by title", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { id: "11111111-2222-3333-4444-555555555555", tenantId, title: "Sak Eksisterende", status: "OPEN", localFirst: true }
      ]
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(ensureBackendCaseId("Sak Eksisterende", tenantId)).resolves.toBe(
      "11111111-2222-3333-4444-555555555555"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/cases",
      expect.objectContaining({ headers: { [EVIDA_TENANT_HEADER]: tenantId } })
    );
  });

  it("creates the backend case when the title is unknown and returns its UUID", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "66666666-7777-4888-8999-aaaaaaaaaaaa", tenantId, title: "Sak Ny", status: "OPEN", localFirst: true })
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(ensureBackendCaseId("Sak Ny", tenantId)).resolves.toBe(
      "66666666-7777-4888-8999-aaaaaaaaaaaa"
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/cases",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "Sak Ny" })
      })
    );
  });

  it("uses the same backend case UUID for upload header and document fetch", async () => {
    const backendCaseId = "9d7dec83-b9dc-46db-a17c-1195fc3ac96f";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "doc_upload_1", status: "QUARANTINE" })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    await uploadDocument(
      new File(["test"], "case.pdf", { type: "application/pdf" }),
      tenantId,
      backendCaseId
    );
    await fetchCaseDocuments(backendCaseId, tenantId);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/documents/upload",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Evida-Case-ID": backendCaseId })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `/api/documents?caseId=${backendCaseId}`,
      expect.any(Object)
    );
  });

  it("approves a document for ingestion through backend lifecycle endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "doc_upload_1",
        filename: "case.pdf",
        status: "APPROVED_FOR_INGESTION",
        pageCount: 1
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const document = await approveDocumentForIngestion("doc_upload_1", tenantId);

    expect(document.status).toBe("approved_for_ingestion");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/documents/doc_upload_1/approve-ingestion",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("rejects and archives documents through backend lifecycle endpoints", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "doc_upload_1", filename: "case.pdf", status: "REJECTED" })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "doc_upload_1", filename: "case.pdf", status: "ARCHIVED" })
      });
    vi.stubGlobal("fetch", fetchMock);

    expect((await rejectDocument("doc_upload_1", tenantId, "Feil dokument")).status).toBe("rejected");
    expect((await archiveDocument("doc_upload_1", tenantId)).status).toBe("archived");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/documents/doc_upload_1/reject",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ reason: "Feil dokument" }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/documents/doc_upload_1/archive",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("starts ingestion and fetches backend source-unit windows", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          documentId: "doc_upload_1",
          tenantId,
          sourceUnitCount: 1,
          status: "SOURCE_READY",
          errorCode: null,
          ocrRequired: false,
          ocrPerformed: false,
          parserName: "pdfbox"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: "unit_pk_1",
            tenantId,
            documentId: "doc_upload_1",
            sourceUnitId: "doc_doc_uplo_p0001_b0001",
            pageNumber: 1,
            unitType: "TEXT_BLOCK",
            textContent: "Strafferettslig kildegrunnlag"
          }
        ]
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(ingestDocument("doc_upload_1", tenantId)).resolves.toEqual(
      expect.objectContaining({ status: "SOURCE_READY", sourceUnitCount: 1 })
    );
    await expect(fetchSourceUnitWindow("doc_upload_1", tenantId, 1, 3)).resolves.toEqual([
      expect.objectContaining({ sourceUnitId: "doc_doc_uplo_p0001_b0001", textContent: "Strafferettslig kildegrunnlag" })
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/documents/doc_upload_1/ingest",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/documents/doc_upload_1/source-units/window?page=1&radius=3",
      expect.any(Object)
    );
  });

  it("searches source units and asks Saksrom with selected real source context", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            documentId: "doc_1",
            sourceUnitId: "doc_doc_1_p0001_b0001",
            pageNumber: 1,
            snippet: "Skriftlig varsling",
            score: 0.85,
            searchMode: "keyword_v1"
          }
        ]
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          answer: "Kildebundet vurdering",
          sources: [
            {
              documentId: "doc_1",
              sourceUnitId: "doc_doc_1_p0001_b0001",
              pageNumber: 1,
              quote: "Skriftlig varsling"
            }
          ],
          sourceBound: true,
          warnings: []
        })
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchSourceUnits(tenantId, "varsling")).resolves.toEqual([
      expect.objectContaining({ sourceUnitId: "doc_doc_1_p0001_b0001", searchMode: "keyword_v1" })
    ]);
    await expect(
      askSaksromQuestion(tenantId, {
        question: "Hva er varslingsplikten?",
        selectedSourceUnitIds: ["doc_doc_1_p0001_b0001"],
        mode: "sporre"
      })
    ).resolves.toEqual(expect.objectContaining({ sourceBound: true }));
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/source-units/search?q=varsling",
      expect.any(Object)
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/saksrom/ask",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          question: "Hva er varslingsplikten?",
          selectedSourceUnitIds: ["doc_doc_1_p0001_b0001"],
          mode: "sporre",
          includePartial: true,
          sourceBasis: "READY_PAGE_UNITS_ONLY"
        })
      })
    );
  });

  it("streams Saksrom summary events from split NDJSON chunks", async () => {
    const encoder = new TextEncoder();
    const chunks = [
      '{"type":"stage","stage":"reading_sources","label":"Leser kil',
      'degrunnlaget"}\n{"type":"text_delta","sectionId":"overview","text":"Foreløpig"}\n',
      '{"type":"citation","sectionId":"overview","citation":{"documentId":"doc_1","sourceUnitId":"unit_1","pageNumber":2}}\n',
      '{"type":"complete"}\n'
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      new ReadableStream({
        start(controller) {
          chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
          controller.close();
        }
      }),
      { status: 200, headers: { "Content-Type": "application/x-ndjson" } }
    )));
    const events: string[] = [];

    await streamSaksromSummary(
      tenantId,
      { caseId: "case_web_demo", includePartial: true, sourceBasis: "READY_PAGE_UNITS_ONLY" },
      (event) => {
        events.push(event.type);
        if (event.type === "citation") {
          expect(event.citation.sourceUnitId).toBe("unit_1");
        }
      }
    );

    expect(events).toEqual(["stage", "text_delta", "citation", "complete"]);
    expect(fetch).toHaveBeenCalledWith(
      "/api/saksrom/summary/stream",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          caseId: toUuid("case_web_demo"),
          includePartial: true,
          sourceBasis: "READY_PAGE_UNITS_ONLY"
        })
      })
    );
  });

  it("stops processing summary stream events after abort", async () => {
    const encoder = new TextEncoder();
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      new ReadableStream({
        start(streamController) {
          streamController.enqueue(encoder.encode('{"type":"stage","stage":"reading_sources","label":"Leser kildegrunnlaget"}\n'));
          controller.abort();
          streamController.enqueue(encoder.encode('{"type":"complete"}\n'));
          streamController.close();
        }
      }),
      { status: 200, headers: { "Content-Type": "application/x-ndjson" } }
    )));
    const events: string[] = [];

    await streamSaksromSummary(
      tenantId,
      { caseId: "case_web_demo", includePartial: true, sourceBasis: "READY_PAGE_UNITS_ONLY" },
      (event) => events.push(event.type),
      controller.signal
    );

    expect(events).toEqual([]);
  });
});
