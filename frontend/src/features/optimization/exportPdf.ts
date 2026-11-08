import { internationalPhone } from '../../format/phone'

/** The desktop application's bridge (electron/preload.cjs); absent in the browser. */
interface DesktopBridge {
  savePdf(name: string): Promise<string | null>
  sendToViber(name: string, phone: string): Promise<{ path: string; viber: boolean } | null>
}

const desktopBridge = () => (window as Window & { rcvaDesktop?: DesktopBridge }).rcvaDesktop

export type PdfOutcome = { kind: 'saved'; path: string } | { kind: 'cancelled' } | { kind: 'printed' }

export function reportFileName(jobId: number): string {
  return `rcva-rezultat-posao-${jobId}.pdf`
}

/** "rcva-Šleper-1-posao-12.pdf": the driver's PDF of one truck, without what a file name cannot hold. */
export function truckReportFileName(jobId: number, truckName: string): string {
  const name = truckName.trim().replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '') || 'kamion'
  return `rcva-${name}-posao-${jobId}.pdf`
}

/**
 * The results report (ResultReport, its print styles) as a PDF. The desktop application
 * writes the file itself, where the user picks; a browser opens its print dialog, where
 * "Save as PDF" is one of the printers, and names the file after the page title.
 */
export async function exportPdf(fileName: string): Promise<PdfOutcome> {
  const desktop = desktopBridge()
  if (desktop) {
    const path = await desktop.savePdf(fileName)
    return path ? { kind: 'saved', path } : { kind: 'cancelled' }
  }
  printNamed(fileName)
  return { kind: 'printed' }
}

/** The browser's print dialog, with the file named after the page title. */
function printNamed(fileName: string) {
  const title = document.title
  document.title = fileName.replace(/\.pdf$/, '')
  try {
    window.print()
  } finally {
    document.title = title
  }
}

/** The link that opens a Viber chat with this number ("+381 64 123 4567" as typed). */
export function viberChatUrl(phone: string): string {
  return `viber://chat?number=${encodeURIComponent(internationalPhone(phone))}`
}

export type ViberOutcome =
  /** the desktop application saved the file and showed it in its folder; `viber`: the chat opened */
  | { kind: 'saved'; path: string; viber: boolean }
  /** the browser: its print dialog for the file, then the chat */
  | { kind: 'printed' }

/**
 * The report (the driver's part) as a PDF for Viber. Viber lets no application put a file into
 * a chat, so the file is made and the chat with the driver opened; the user attaches the file.
 */
export async function sendPdfToViber(fileName: string, phone: string): Promise<ViberOutcome> {
  const desktop = desktopBridge()
  if (desktop) {
    const sent = await desktop.sendToViber(fileName, internationalPhone(phone))
    if (!sent) throw new Error('aplikacija nije prihvatila broj ili fajl')
    return { kind: 'saved', ...sent }
  }
  printNamed(fileName)
  const link = document.createElement('a')
  link.href = viberChatUrl(phone)
  link.click()
  return { kind: 'printed' }
}
