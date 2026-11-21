import { createContext } from 'react'

/*
 * Where a screen's title goes: into the top bar, as in smartLoad+ (owner, 21.11.2026). The top bar
 * gives the place (null while it shows something else, the steps of Optimizacija); PageHeader puts
 * the title there, or on the page when there is no place.
 */
export const TopBarTitleContext = createContext<HTMLElement | null>(null)
