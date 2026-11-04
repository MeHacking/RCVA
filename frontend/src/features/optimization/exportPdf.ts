/** The desktop application's bridge (electron/preload.cjs); absent in the browser. */
interface DesktopBridge {
  savePdf(name: string): Promise<string | null>
}

export type PdfOutcome = { kind: 'saved'; path: string } | { kind: 'cancelled' } | { kind: 'printed' }

export function reportFileName(jobId: number): string {
  return `rcva-rezultat-posao-${jobId}.pdf`
}

/**
 * The results report (ResultReport, its print styles) as a PDF. The desktop application
 * writes the file itself, where the user picks; a browser opens its print dialog, where
 * "Save as PDF" is one of the printers, and names the file after the page title.
 */
export async function exportPdf(fileName: string): Promise<PdfOutcome> {
  const desktop = (window as Window & { rcvaDesktop?: DesktopBridge }).rcvaDesktop
  if (desktop) {
    const path = await desktop.savePdf(fileName)
    return path ? { kind: 'saved', path } : { kind: 'cancelled' }
  }
  const title = document.title
  document.title = fileName.replace(/\.pdf$/, '')
  try {
    window.print()
  } finally {
    document.title = title
  }
  return { kind: 'printed' }
}
