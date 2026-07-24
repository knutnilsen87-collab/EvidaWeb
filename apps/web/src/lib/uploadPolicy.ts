export const SUPPORTED_SOURCE_EXTENSIONS = [".pdf", ".txt"] as const;
export const SUPPORTED_UPLOAD_EXTENSIONS = SUPPORTED_SOURCE_EXTENSIONS;
export const SUPPORTED_UPLOAD_ACCEPT = ".pdf,.txt,application/pdf,text/plain";
export const SUPPORTED_UPLOAD_HELP_TEXT = "Støtter PDF og TXT";
export const UNSUPPORTED_UPLOAD_MESSAGE = "Ugyldig filtype. Kun PDF og TXT støttes.";

const UPLOAD_SECURITY_MESSAGES: Record<string, string> = {
  UPLOAD_REJECTED_EMPTY_FILE: "Filen er tom.",
  UPLOAD_REJECTED_FILE_TOO_LARGE: "Filen er større enn tillatt grense.",
  UPLOAD_REJECTED_EXTENSION: "Filtypen støttes ikke. Pilotopplasting støtter PDF og TXT.",
  UPLOAD_REJECTED_DECLARED_MIME_MISMATCH: "Filens deklarerte type stemmer ikke med filendelsen.",
  UPLOAD_REJECTED_CONTENT_TYPE_MISMATCH: "Filens innhold stemmer ikke med filtypekontrakten.",
  UPLOAD_REJECTED_INVALID_PDF: "PDF-filen er ikke en gyldig, lesbar PDF.",
  UPLOAD_REJECTED_ENCRYPTED_PDF: "Passordbeskyttede PDF-filer støttes ikke i pilotopplasting.",
  UPLOAD_REJECTED_INVALID_TEXT: "TXT-filen må være gyldig UTF-8 tekst uten binært innhold.",
  MALWARE_DETECTED: "Filen ble avvist av malware-kontroll.",
  MALWARE_SCAN_UNAVAILABLE: "Malware-kontroll er ikke tilgjengelig. Opplasting er midlertidig stengt.",
  MALWARE_SCAN_FAILED: "Malware-kontroll feilet. Opplasting er midlertidig stengt."
};

export function uploadSecurityMessage(code?: string | null): string | null {
  if (!code) return null;
  return UPLOAD_SECURITY_MESSAGES[code] ?? null;
}

export function isSupportedUploadFileName(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  const ext = name.slice(dot).toLowerCase();
  return SUPPORTED_SOURCE_EXTENSIONS.includes(ext as (typeof SUPPORTED_SOURCE_EXTENSIONS)[number]);
}
