// Types for the globals defined by the TeGo LoadViewer classic scripts in
// public/legacy/tego (PackWidget, mapItems, mapBins). Only what we use is typed.

/** Item as created by mapItems and kept by PackWidget (after its JSON clone). */
export interface PackWidgetItem<T = unknown> {
  /** the source object passed to mapItems */
  dataItem: T
  /** original color as a number */
  color: number
  graphicsItem: { material: { color: { set(color: string | number): void; getHex(): number } } }
}

export interface PackWidgetInstance<T = unknown> {
  onItemOver: (item: PackWidgetItem<T> | undefined) => void
  onItemOut: (item: PackWidgetItem<T> | undefined) => void
  onItemClick: (item: PackWidgetItem<T> | undefined) => void
  create(container: HTMLElement): void
  /** Added by the RCVA modification of packwidget.js; missing in the original. */
  destroy?: () => void
  /** mesh -> item, filled by create() */
  itemMap: Map<unknown, PackWidgetItem<T>>
}

export interface PackWidgetOptions {
  cameraType: 'perspective' | 'orthographic'
  horizontalRotation: boolean
  verticalRotation: boolean
  border: number
  enableItemDrag: boolean
  backgroundColor?: number
}

/** Field paths for mapItems/mapBins, as in TeGo's loadViewer.js */
export type TegoMapping = Record<string, string[] | string | number>

export interface TegoGlobals {
  PackWidget: (new <T>(bins: unknown[], items: PackWidgetItem<T>[], options: PackWidgetOptions) => PackWidgetInstance<T>) & {
    /** RCVA modification: clear color of the shared canvas (TeGo default 0xfff2e0) */
    rendererBackgroundColor?: number
  }
  mapItems<T>(data: T[], mapping: TegoMapping): PackWidgetItem<T>[]
  mapBins(data: unknown[], mapping: TegoMapping): unknown[]
}
