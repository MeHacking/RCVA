// The colours of the shipments' blocks, by their place in the load plan: the same in the 3D
// view, in the list beside it and in the drawings of the PDF. Distinguishable on a light
// background (the palette of the earlier TeGo viewer, kept so the colours stay as they were).
const COLORS = ['#df7126', '#639bff', '#6abe30', '#d95763', '#847eee', '#37946e', '#d9a066', '#8f974a', '#22f4f1', '#8f563b']

/** The colour of the block at this index in the placements, as CSS. */
export function placementColor(index: number): string {
  return COLORS[index % COLORS.length]
}
