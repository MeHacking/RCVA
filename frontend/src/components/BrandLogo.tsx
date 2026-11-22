/** The parts of the logo by colour, bottom to top (public/logo-<part>.png, --logo-<part>). */
const PARTS = ['ink', 'light', 'box', 'arrow'] as const

/**
 * The logo in the menu, in the theme's colours (owner, 22.11.2026): the same picture as
 * public/logo.png, built from four masks, one per colour (.brand__logo in layout.css). The
 * favicon, the PDF and the desktop application keep the picture as it is.
 */
export function BrandLogo() {
  return (
    <span className="brand__logo" aria-hidden="true">
      {PARTS.map((part) => (
        <span key={part} className={`brand__logo-part brand__logo-part--${part}`} />
      ))}
    </span>
  )
}
