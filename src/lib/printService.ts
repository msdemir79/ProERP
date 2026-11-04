/**
 * Universal Print Service for DMR Nexus
 * Handles printing inside iframes, standalone tabs, and thermal/laser printers.
 */

export interface PrintOptions {
  title?: string;
  css?: string;
  landscape?: boolean;
  widthMm?: number;
  heightMm?: number;
}

/**
 * XSS Koruması: Yazdırma içeriğindeki zararlı script etiketlerini, inline olay işleyicileri
 * (onload, onerror, onclick) ve javascript: URI'larını temizler.
 */
export function sanitizePrintHtml(html: string): string {
  if (!html) return '';
  let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  clean = clean.replace(/\son[a-zA-Z]+\s*=\s*(['"][^'"]*['"]|[^\s>]+)/gi, '');
  clean = clean.replace(/(href|src)\s*=\s*['"]javascript:[^'"]*['"]/gi, '$1="#"');
  return clean;
}

/**
 * Print raw HTML content using an isolated hidden iframe
 */
export function printHtml(htmlContent: string, options: PrintOptions = {}): Promise<boolean> {
  const sanitizedContent = sanitizePrintHtml(htmlContent);
  return new Promise((resolve) => {
    try {
      const title = options.title || 'DMR Nexus Baskı';
      
      // Check if we have an existing print frame and remove it
      const oldFrame = document.getElementById('dmr-nexus-print-frame');
      if (oldFrame) {
        oldFrame.remove();
      }

      // Create hidden iframe
      const iframe = document.createElement('iframe');
      iframe.id = 'dmr-nexus-print-frame';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.zIndex = '-9999';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (!doc || !iframe.contentWindow) {
        // Fallback to opening printable window
        openPrintWindow(sanitizedContent, title, options);
        resolve(true);
        return;
      }

      const pageSizeCss = options.widthMm && options.heightMm 
        ? `@page { size: ${options.widthMm}mm ${options.heightMm}mm; margin: 0; }`
        : `@page { margin: 4mm; size: ${options.landscape ? 'landscape' : 'auto'}; }`;

      // Ekrandaki birebir görünüm için uygulamanın aktif stil sayfalarını da taşı
      // (Tailwind sınıfları olmadan yazdırma çıktısında düzen çöküyordu).
      const activeStyles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
        .map(el => el.outerHTML)
        .join('\n');

      const fullHtml = `
        <!DOCTYPE html>
        <html lang="tr">
          <head>
            <meta charset="UTF-8">
            <title>${title}</title>
            ${activeStyles}
            <style>
              ${pageSizeCss}
              *, *::before, *::after {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
              }
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                background: #ffffff !important;
                color: #000000 !important;
                font-size: 11px;
                line-height: 1.25;
                padding: 0;
                margin: 0;
              }
              .page-break {
                page-break-after: always;
                break-after: page;
              }
              .print-card {
                page-break-after: always;
                break-after: page;
                box-sizing: border-box;
              }
              .label-img-frame {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                background: #ffffff !important;
                border: 1.5px solid #000000 !important;
                border-radius: 6px !important;
                overflow: hidden !important;
                padding: 2px !important;
                box-sizing: border-box !important;
              }
              .label-img-frame img {
                max-width: 100% !important;
                max-height: 100% !important;
                width: 100% !important;
                height: 100% !important;
                object-fit: contain !important;
                display: block !important;
                margin: auto !important;
              }
              img {
                display: block;
              }
              svg {
                display: block;
                max-width: 100%;
              }
              table {
                width: 100%;
                border-collapse: collapse;
              }
              ${options.css || ''}
            </style>
          </head>
          <body>
            ${htmlContent}
          </body>
        </html>
      `;

      doc.open();
      doc.write(fullHtml);
      doc.close();

      // Wait for images inside the iframe to load before triggering print
      const checkAndPrint = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => {
            iframe.remove();
            resolve(true);
          }, 1500);
        } catch (err) {
          console.warn('Iframe print error, falling back to window print:', err);
          openPrintWindow(htmlContent, title, options);
          resolve(false);
        }
      };

      const images = doc.images;
      let loadedImages = 0;
      const totalImages = images.length;

      if (totalImages === 0) {
        setTimeout(checkAndPrint, 200);
      } else {
        let isTriggered = false;
        const triggerOnce = () => {
          if (!isTriggered) {
            isTriggered = true;
            checkAndPrint();
          }
        };

        for (let i = 0; i < totalImages; i++) {
          if (images[i].complete) {
            loadedImages++;
          } else {
            images[i].addEventListener('load', () => {
              loadedImages++;
              if (loadedImages >= totalImages) triggerOnce();
            });
            images[i].addEventListener('error', () => {
              loadedImages++;
              if (loadedImages >= totalImages) triggerOnce();
            });
          }
        }

        if (loadedImages >= totalImages) {
          setTimeout(triggerOnce, 150);
        } else {
          // Timeout safety in case image hangs
          setTimeout(triggerOnce, 1200);
        }
      }
    } catch (error) {
      console.error('Error in printHtml:', error);
      openPrintWindow(htmlContent, options.title, options);
      resolve(false);
    }
  });
}

/**
 * Print a DOM element by ID or Element reference
 */
export async function printElement(elementOrId: string | HTMLElement, options: PrintOptions = {}): Promise<boolean> {
  const el = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
  if (!el) {
    console.error('Element not found for printing:', elementOrId);
    return false;
  }

  // Clone element content
  const clone = el.cloneNode(true) as HTMLElement;
  
  // Iframe içinde çalışırken tarayıcı window.print() çağrısını sessizce engelleyebilir;
  // ayrı bir Blob sekmesi açmak bu kısıtlamayı aşar.
  if (window.self !== window.top) {
    const url = openPrintWindow(clone.outerHTML, options.title || 'Baskı Önizleme', options);
    return !!url;
  }

  try {
    const res = await printHtml(clone.outerHTML, options);
    return res;
  } catch (err) {
    console.warn('printHtml failed, falling back to openPrintWindow:', err);
    const url = openPrintWindow(clone.outerHTML, options.title || 'Baskı Önizleme', options);
    return !!url;
  }
}

/**
 * Open a printable document in a new tab/window with auto-trigger print and top action bar
 * Uses Blob URL to safely bypass iframe sandbox print restrictions
 */
export function openPrintWindow(
  htmlContent: string, 
  title: string = 'DMR Nexus Baskı Önizleme',
  options: PrintOptions = {}
): string | null {
  const sanitizedContent = sanitizePrintHtml(htmlContent);
  const pageSizeCss = options.widthMm && options.heightMm 
    ? `@page { size: ${options.widthMm}mm ${options.heightMm}mm; margin: 0; }`
    : `@page { margin: 4mm 6mm; size: ${options.landscape ? 'landscape' : 'auto'}; }`;

  // Collect all active styles from current document to ensure identical rendering
  const activeStyles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map(el => el.outerHTML)
    .join('\n');

  const fullHtml = `<!DOCTYPE html>
<html lang="tr">
  <head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${activeStyles}
    <style>
      ${pageSizeCss}
      *, *::before, *::after {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
        box-sizing: border-box;
      }
      body {
        margin: 0;
        padding: 0;
        background: #f1f5f9;
        color: #000000;
        font-family: Arial, Helvetica, sans-serif;
      }
      @media print {
        .no-print { display: none !important; }
        body { 
          background: #ffffff !important; 
          padding: 0 !important; 
          margin: 0 !important; 
        }
        .print-card-wrapper {
          padding: 0 !important;
          margin: 0 auto !important;
          width: 100% !important;
        }
      }
      .no-print-toolbar {
        position: sticky;
        top: 0;
        z-index: 9999;
        background: #0f172a;
        color: #ffffff;
        padding: 12px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .print-btn {
        background: #f59e0b;
        color: #0f172a;
        font-weight: 900;
        font-size: 13px;
        padding: 8px 18px;
        border-radius: 8px;
        border: none;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        box-shadow: 0 2px 6px rgba(245, 158, 11, 0.4);
        transition: background 0.2s;
      }
      .print-btn:hover { background: #fbbf24; }
      .close-btn {
        background: #334155;
        color: #ffffff;
        font-weight: 700;
        font-size: 13px;
        padding: 8px 14px;
        border-radius: 8px;
        border: none;
        cursor: pointer;
        transition: background 0.2s;
      }
      .close-btn:hover { background: #475569; }
      .print-card-wrapper {
        padding: 16px;
        display: flex;
        justify-content: center;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      ${options.css || ''}
    </style>
  </head>
  <body>
    <!-- Top Print Action Bar (Hidden when printing) -->
    <div class="no-print no-print-toolbar">
      <div>
        <div style="font-weight: 900; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em;">
          🖨️ ${title}
        </div>
        <div style="font-size: 11px; color: #94a3b8; font-weight: 600; margin-top: 2px;">
          Yazdırma penceresi otomatik açılmadıysa sağdaki sarı butona tıklayın veya Ctrl+P tuşlayın.
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <button class="close-btn" onclick="window.close()">Kapat</button>
        <button class="print-btn" onclick="window.print()">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
          Yazdır (Print)
        </button>
      </div>
    </div>

    <!-- Printable Work Order Content -->
    <div class="print-card-wrapper">
      ${sanitizedContent}
    </div>

    <script>
      // Automatically trigger native print dialog once DOM & images load
      window.addEventListener('load', function() {
        setTimeout(function() {
          try {
            window.focus();
            window.print();
          } catch (e) {
            console.warn('Auto print error in tab:', e);
          }
        }, 400);
      });
    </script>
  </body>
</html>`;

  try {
    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);

    // Open via invisible anchor click (supported in iframe user-click handlers)
    const link = document.createElement('a');
    link.href = blobUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    
    setTimeout(() => {
      link.remove();
    }, 100);

    return blobUrl;
  } catch (err) {
    console.warn('Blob window open failed, fallback to window.open:', err);
    try {
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(fullHtml);
        win.document.close();
      }
    } catch {
      // ignore
    }
    return null;
  }
}

/**
 * Print a structured tabular report
 */
export function printTabularReport(
  reportTitle: string,
  subtitle: string,
  headers: string[],
  rows: (string | number)[][],
  stats?: { label: string; value: string | number }[],
  options?: { companyName?: string; logo?: string }
) {
  const companyTitle = options?.companyName ? options.companyName.toUpperCase() : 'KURUMSAL SİSTEM RAPORU';

  const statsHtml = stats && stats.length > 0 ? `
    <div style="display: grid; grid-template-columns: repeat(${Math.min(stats.length, 4)}, 1fr); gap: 10px; margin-bottom: 20px;">
      ${stats.map(s => `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 14px; border-radius: 8px;">
          <div style="font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase;">${s.label}</div>
          <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-top: 2px;">${s.value}</div>
        </div>
      `).join('')}
    </div>
  ` : '';

  const tableHtml = `
    <div style="padding: 10px; background: white;">
      <div style="border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end;">
        <div style="display: flex; align-items: center; gap: 12px;">
          ${options?.logo ? `<img src="${options.logo}" style="height: 40px; max-width: 120px; object-fit: contain;" />` : ''}
          <div>
            <div style="font-size: 10px; font-weight: 800; color: #6366f1; letter-spacing: 0.1em; text-transform: uppercase;">${companyTitle}</div>
            <h1 style="font-size: 20px; font-weight: 900; color: #0f172a; text-transform: uppercase; margin-top: 2px;">${reportTitle}</h1>
            <p style="font-size: 11px; color: #64748b; margin-top: 2px;">${subtitle}</p>
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 10px; font-weight: 700; color: #64748b;">Tarih: ${new Date().toLocaleDateString('tr-TR')} ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div>
          <div style="font-size: 10px; font-weight: 700; color: #0f172a; margin-top: 2px;">Kayıt Sayısı: ${rows.length}</div>
        </div>
      </div>

      ${statsHtml}

      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <thead>
          <tr style="background: #0f172a; color: white;">
            ${headers.map(h => `
              <th style="padding: 8px 10px; text-align: left; font-weight: 800; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid #0f172a;">${h}</th>
            `).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, idx) => `
            <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
              ${row.map(cell => `
                <td style="padding: 8px 10px; border: 1px solid #e2e8f0; color: #1e293b; font-weight: 500;">${cell}</td>
              `).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 9px; color: #94a3b8; display: flex; justify-content: space-between;">
        <span>${companyTitle}</span>
        <span>Sayfa 1 / 1</span>
      </div>
    </div>
  `;

  printHtml(tableHtml, { title: reportTitle });
}
