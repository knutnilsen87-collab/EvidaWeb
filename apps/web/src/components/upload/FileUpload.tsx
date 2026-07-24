import { useState } from "react";
import type { AnalysisStatus } from "../../engine/types";
import { startCourtEngineAnalysis, uploadFilesForAnalysis } from "../../lib/api";
import { SUPPORTED_UPLOAD_ACCEPT } from "../../lib/uploadPolicy";

interface FileUploadProps {
  caseId: string;
  tenantId: string;
  setAnalysisStatus: (status: AnalysisStatus) => void;
}

export function FileUpload({ caseId, tenantId, setAnalysisStatus }: FileUploadProps) {
  const [isUploading, setIsUploading] = useState(false);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }

    setIsUploading(true);
    setAnalysisStatus("processing");

    try {
      const uploadResult = await uploadFilesForAnalysis(Array.from(files), tenantId, caseId);
      await startCourtEngineAnalysis(tenantId, {
        caseId,
        fileIds: uploadResult.fileIds
      });
      setAnalysisStatus("completed");
    } catch (error) {
      console.error(error);
      setAnalysisStatus("failed");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div>
      <input
        type="file"
        multiple
        accept={SUPPORTED_UPLOAD_ACCEPT}
        disabled={isUploading}
        onChange={(event) => void handleUpload(event.currentTarget.files)}
      />

      {isUploading ? <p>Laster opp dokumenter...</p> : null}
    </div>
  );
}
