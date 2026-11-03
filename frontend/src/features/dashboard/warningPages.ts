// Pages of the dashboard's warnings (WarningsPanel.tsx).

/**
 * Splits the items into pages that fit `room` pixels, by where each item ends in a list of
 * all of them (`tops` and `bottoms` from the top of that list, gaps included).
 */
export function pagesThatFit(tops: number[], bottoms: number[], room: number): number[][] {
  const pages: number[][] = []
  let page: number[] = []
  let start = 0
  tops.forEach((top, i) => {
    // An item taller than the room still gets a page of its own.
    if (page.length > 0 && bottoms[i] - start > room) {
      pages.push(page)
      page = []
    }
    if (page.length === 0) start = top
    page.push(i)
  })
  if (page.length > 0) pages.push(page)
  return pages
}
