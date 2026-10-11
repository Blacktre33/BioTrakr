import {
  cleanFileName,
  sniffDocumentType,
  titleFromFileName,
} from './file-type';

describe('sniffDocumentType', () => {
  it('knows PDF, JPEG and PNG by their first bytes', () => {
    expect(sniffDocumentType(Buffer.from('%PDF-1.7\n...'))).toBe(
      'application/pdf',
    );
    expect(sniffDocumentType(Buffer.from('\r\n%PDF-1.4'))).toBe(
      'application/pdf',
    );
    expect(sniffDocumentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe(
      'image/jpeg',
    );
    expect(
      sniffDocumentType(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]),
      ),
    ).toBe('image/png');
  });

  it('refuses anything else, whatever it is called', () => {
    expect(sniffDocumentType(Buffer.from('<html><script>'))).toBeNull();
    expect(sniffDocumentType(Buffer.from('PK\u0003\u0004'))).toBeNull();
    expect(sniffDocumentType(Buffer.alloc(0))).toBeNull();
  });
});

describe('cleanFileName', () => {
  it('keeps the name, not the folders or anything that breaks a header', () => {
    expect(cleanFileName('C:\\Users\\biomed\\cert "final".pdf')).toBe(
      'cert _final_.pdf',
    );
    expect(cleanFileName('../../etc/passwd')).toBe('passwd');
    expect(cleanFileName('a\u0000b.pdf')).toBe('a_b.pdf');
    expect(cleanFileName('')).toBe('document');
  });

  it('puts right a UTF-8 name read as Latin-1', () => {
    const hindi = 'प्रमाणपत्र.pdf';
    expect(cleanFileName(Buffer.from(hindi).toString('latin1'))).toBe(hindi);
    expect(cleanFileName('Zürich report.pdf')).toBe('Zürich report.pdf');
  });
});

describe('titleFromFileName', () => {
  it('drops the extension', () => {
    expect(titleFromFileName('NABL certificate 2026.pdf')).toBe(
      'NABL certificate 2026',
    );
    expect(titleFromFileName('scan')).toBe('scan');
  });
});
