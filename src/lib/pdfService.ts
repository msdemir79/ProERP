/**
 * Universal PDF Generation Service for DMR Nexus
 * Uses html2canvas-pro and jsPDF to produce crisp, vectorized/high-DPI PDF documents
 * Supports A4 portrait/landscape and 100x150 mm thermal shipping labels.
 */

import html2canvas from 'html2canvas-pro';
import jsPDF from 'jspdf';

export interface PdfExportOptions {
  filename?: string;
  format?: 'a4' | [number, number]; // e.g. [100, 150] for 100x150mm thermal labels
  orientation?: 'portrait' | 'landscape';
  marginMm?: number;
  scale?: number;
  backgroundColor?: string;
  onclone?: (clonedDoc: Document) => void;
}

let helperCanvas: HTMLCanvasElement | null = null;
let helperCtx: CanvasRenderingContext2D | null = null;

/**
 * Converts modern color formats (oklab, oklch, lab, lch, color(...))
 * to standard RGB/RGBA or hex string.
 */
export function sanitizeCssColor(colorStr: string): string {
  if (!colorStr || typeof colorStr !== 'string') return '#000000';
  const trimmed = colorStr.trim();
  if (
    !trimmed.includes('oklch') &&
    !trimmed.includes('oklab') &&
    !trimmed.includes('color(') &&
    !trimmed.includes('lab(') &&
    !trimmed.includes('lch(')
  ) {
    return trimmed;
  }

  try {
    if (typeof document !== 'undefined') {
      if (!helperCanvas) {
        helperCanvas = document.createElement('canvas');
        helperCanvas.width = 1;
        helperCanvas.height = 1;
        helperCtx = helperCanvas.getContext('2d', { willReadFrequently: true });
      }
      if (helperCtx) {
        helperCtx.fillStyle = '#000000';
        helperCtx.fillStyle = trimmed;
        return helperCtx.fillStyle || '#000000';
      }
    }
  } catch {
    // fallback
  }
  return '#000000';
}

export function sanitizeClonedDocumentColors(clonedDoc: Document) {
  try {
    const allElements = clonedDoc.querySelectorAll('*');
    allElements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      try {
        const computed = window.getComputedStyle(htmlEl);
        const colorProps = [
          'color',
          'backgroundColor',
          'borderTopColor',
          'borderBottomColor',
          'borderLeftColor',
          'borderRightColor',
          'outlineColor',
          'fill',
          'stroke'
        ];

        colorProps.forEach((prop) => {
          const val = (computed as any)[prop];
          if (
            val &&
            (val.includes('oklch') ||
              val.includes('oklab') ||
              val.includes('color(') ||
              val.includes('lab(') ||
              val.includes('lch('))
          ) {
            (htmlEl.style as any)[prop] = sanitizeCssColor(val);
          }
        });
      } catch {}
    });
  } catch {}
}

/**
 * Downloads a DOM element as a crisp, high-resolution PDF file.
 */
export async function downloadElementAsPdf(
  element: HTMLElement,
  options: PdfExportOptions = {}
): Promise<boolean> {
  const {
    filename = 'belge.pdf',
    format = 'a4',
    orientation = 'portrait',
    marginMm = 6,
    scale = 2,
    backgroundColor = '#ffffff',
    onclone
  } = options;

  try {
    const canvas = await html2canvas(element, {
      scale,
      useCORS: true,
      logging: false,
      backgroundColor,
      onclone: (clonedDoc) => {
        sanitizeClonedDocumentColors(clonedDoc);
        if (onclone) {
          onclone(clonedDoc);
        }
      }
    });

    const imgData = canvas.toDataURL('image/png');

    let pdfWidth: number;
    let pdfHeight: number;

    if (Array.isArray(format)) {
      pdfWidth = format[0];
      pdfHeight = format[1];
    } else {
      // A4 dimensions in mm
      pdfWidth = orientation === 'portrait' ? 210 : 297;
      pdfHeight = orientation === 'portrait' ? 297 : 210;
    }

    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: Array.isArray(format) ? [format[0], format[1]] : format
    });

    const availableWidth = pdfWidth - (marginMm * 2);
    const availableHeight = pdfHeight - (marginMm * 2);

    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    const ratio = Math.min(availableWidth / (imgWidth * 0.264583), availableHeight / (imgHeight * 0.264583), 1);

    const finalWidth = (imgWidth * 0.264583) * ratio;
    const finalHeight = (imgHeight * 0.264583) * ratio;

    const posX = marginMm + (availableWidth - finalWidth) / 2;
    const posY = marginMm;

    pdf.addImage(imgData, 'PNG', posX, posY, finalWidth, finalHeight);

    // If content exceeds a single page for multi-page invoices
    if (canvas.height * 0.264583 > availableHeight * 1.3 && format === 'a4') {
      let heightLeft = (canvas.height * 0.264583) - availableHeight;
      let position = -availableHeight;

      while (heightLeft > 0) {
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', posX, position, finalWidth, finalHeight);
        heightLeft -= availableHeight;
        position -= availableHeight;
      }
    }

    const safeFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    pdf.save(safeFilename);
    return true;
  } catch (error) {
    console.error('PDF oluşturma hatası:', error);
    throw error;
  }
}

/**
 * Specifically exports a 100x150 mm Thermal Shipping / Parcel Label
 */
export async function downloadThermal100x150Pdf(
  element: HTMLElement,
  filename: string = 'Koli_Etiketi_100x150.pdf'
): Promise<boolean> {
  return downloadElementAsPdf(element, {
    filename,
    format: [100, 150],
    orientation: 'portrait',
    marginMm: 2,
    scale: 2
  });
}

