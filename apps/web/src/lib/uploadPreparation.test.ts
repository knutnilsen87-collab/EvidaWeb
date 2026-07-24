import { describe, expect, it } from "vitest";
import { prepareUploadFiles } from "./uploadPreparation";

describe("prepareUploadFiles", () => {
  it("accepts PDF/TXT and preserves the original File objects", async () => {
    const pdf = new File(["pdf"], "avtale.pdf", { type: "application/pdf" });
    const txt = new File(["tekst"], "notat.txt", { type: "text/plain" });
    const result = await prepareUploadFiles([pdf, txt]);

    expect(result.files).toEqual([pdf, txt]);
    expect(result.rejected).toEqual([]);
  });

  it("rejects ZIP because backend archive security is not implemented", async () => {
    const archive = new File(["zip"], "case.zip", { type: "application/zip" });

    const result = await prepareUploadFiles([archive]);

    expect(result.files).toHaveLength(0);
    expect(result.rejected).toEqual([{ name: "case.zip", reason: "Ugyldig filtype. Kun PDF og TXT støttes." }]);
  });
});
