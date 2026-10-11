/**
 * What an uploaded file really is, from its first bytes. The browser's
 * stated type and the file name are not trusted: a file is stored and
 * served as one of these or not at all.
 */
export type DocumentMimeType = 'application/pdf' | 'image/jpeg' | 'image/png';

/** Larger files are refused before they are read into memory. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function sniffDocumentType(content: Buffer): DocumentMimeType | null {
  // PDF readers accept a little junk before the header; so do we.
  if (content.subarray(0, 1024).includes('%PDF-')) return 'application/pdf';
  if (content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) {
    return 'image/jpeg';
  }
  if (content.subarray(0, 8).equals(PNG)) return 'image/png';
  return null;
}

/**
 * A file name safe to store and to send back in a header: no folders,
 * quotes or control characters. Browsers send UTF-8 names that arrive
 * read as Latin-1; they are put right.
 */
export function cleanFileName(raw: string): string {
  let name = raw;
  const utf8 = Buffer.from(raw, 'latin1').toString('utf8');
  if (!utf8.includes('\uFFFD') && utf8 !== raw) name = utf8;
  name = name
    .split(/[\\/]/)
    .pop()!
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"]/g, '_')
    .trim();
  return (name || 'document').slice(-200);
}

/** "Calibration certificate.pdf" → "Calibration certificate". */
export const titleFromFileName = (name: string) =>
  name.replace(/\.[a-z0-9]{1,5}$/i, '').trim() || name;
