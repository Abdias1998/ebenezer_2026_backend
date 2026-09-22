import PDFDocument from 'pdfkit';

const PAGE_WIDTH = 841.89; // A4 paysage (pt)
const PAGE_HEIGHT = 595.28;
const MARGIN = 36;
const TABLE_TOP = 108;
const ROW_HEIGHT = 12;
const HEADER_FILL = '#b3233f';
const HEADER_TEXT = '#ffffff';
const ROW_TEXT = '#1f2937';
const STRIPE_FILL = '#f5f5f7';

export interface RegistrationsPdfRow {
  index: number;
  registrationNumber: string;
  fullName: string;
  phone: string;
  email: string;
  tshirtSize: string;
  pickupLocation: string;
  network: string;
  amount: string;
}

export interface RegistrationsPdfParams {
  eventName?: string;
  generatedAt: Date;
  rows: RegistrationsPdfRow[];
}

interface PdfColumn {
  key: keyof RegistrationsPdfRow;
  label: string;
  width: number;
}

const COLUMNS: PdfColumn[] = [
  { key: 'index', label: '#', width: 24 },
  { key: 'registrationNumber', label: 'N° billet', width: 100 },
  { key: 'fullName', label: 'Nom complet', width: 140 },
  { key: 'phone', label: 'Téléphone', width: 88 },
  { key: 'email', label: 'Email', width: 120 },
  { key: 'tshirtSize', label: 'T-shirt', width: 40 },
  { key: 'pickupLocation', label: 'Lieu de prise en charge', width: 150 },
  { key: 'network', label: 'Réseau', width: 48 },
  { key: 'amount', label: 'Montant', width: 58 },
];

const TABLE_WIDTH = COLUMNS.reduce((sum, col) => sum + col.width, 0);

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}…`;
}

export function buildRegistrationsPdfBuffer(
  params: RegistrationsPdfParams,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: MARGIN,
  });
  const chunks: Buffer[] = [];
  const deferred: Promise<Buffer> = new Promise((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const drawTableHeader = (y: number) => {
    doc.rect(MARGIN, y, TABLE_WIDTH, ROW_HEIGHT).fill(HEADER_FILL);
    let x = MARGIN;
    for (const col of COLUMNS) {
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(HEADER_TEXT)
        .text(col.label, x + 5, y + 3, {
          width: col.width - 8,
          lineBreak: false,
          ellipsis: true,
        });
      x += col.width;
    }
    doc.fillColor(ROW_TEXT);
  };

  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor('#1f2937')
    .text('EBENEZER — LISTE DES INSCRITS', MARGIN, 34);

  doc
    .font('Helvetica')
    .fontSize(11)
    .fillColor('#374151')
    .text(params.eventName ?? 'Événement', MARGIN, 58);

  const generatedLabel = params.generatedAt.toLocaleDateString('fr-FR');
  doc
    .fontSize(9)
    .fillColor('#6b7280')
    .text(
      `Export généré le ${generatedLabel} — ${params.rows.length} inscrit(s) payé(s)`,
      MARGIN,
      76,
    );

  let y = TABLE_TOP;
  let pageNumber = 1;
  drawTableHeader(y);
  y += ROW_HEIGHT;

  const drawPageNumber = () => {
    const previousBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#9ca3af')
      .text(
        `Page ${pageNumber}`,
        PAGE_WIDTH - MARGIN - 60,
        PAGE_HEIGHT - MARGIN + 22,
        { width: 60, align: 'right' },
      );
    doc.page.margins.bottom = previousBottomMargin;
    doc.fillColor(ROW_TEXT);
  };

  const startNewPage = () => {
    drawPageNumber();
    doc.addPage();
    pageNumber += 1;
    y = TABLE_TOP;
    drawTableHeader(y);
    y += ROW_HEIGHT;
  };

  for (const row of params.rows) {
    if (y + ROW_HEIGHT > PAGE_HEIGHT - MARGIN) {
      startNewPage();
    }

    if (row.index % 2 === 0) {
      doc.rect(MARGIN, y, TABLE_WIDTH, ROW_HEIGHT).fill(STRIPE_FILL);
    }

    let x = MARGIN;
    doc.font('Helvetica').fontSize(8).fillColor(ROW_TEXT);
    for (const col of COLUMNS) {
      const value = truncate(String(row[col.key] ?? ''), 42);
      doc.text(value, x + 5, y + 3, {
        width: col.width - 8,
        lineBreak: false,
        ellipsis: true,
      });
      x += col.width;
    }
    y += ROW_HEIGHT;
  }

  drawPageNumber();
  doc.end();
  return deferred;
}