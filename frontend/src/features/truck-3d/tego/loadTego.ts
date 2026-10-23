import type { TegoGlobals } from './tegoTypes'

// Order matters: each script uses globals defined by the previous ones.
const SCRIPTS = ['three.min.js', 'OrbitControls.js', 'threex.domevents.js', 'mapping.js', 'packwidget.js']

let loading: Promise<TegoGlobals> | null = null

/**
 * Loads the TeGo scripts once per page. Every caller (including the second effect run
 * under StrictMode) gets the same promise, so no script is added twice. A failed load
 * can be retried.
 */
export function loadTego(): Promise<TegoGlobals> {
  if (!loading) {
    loading = (async () => {
      for (const name of SCRIPTS) await addScript(`${import.meta.env.BASE_URL}legacy/tego/${name}`)
      return readGlobals()
    })()
    loading.catch(() => {
      loading = null
    })
  }
  return loading
}

function addScript(src: string): Promise<void> {
  // Also covers a module reloaded by HMR while the scripts are already on the page.
  if (document.querySelector(`script[data-tego][src="${src}"]`)) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = false
    script.dataset.tego = ''
    script.onload = () => resolve()
    script.onerror = () => {
      script.remove()
      reject(new Error(`3D prikaz nije učitan: skripta ${src} nije dostupna.`))
    }
    document.head.append(script)
  })
}

function readGlobals(): TegoGlobals {
  const globals = window as unknown as Partial<TegoGlobals>
  if (!globals.PackWidget || !globals.mapItems || !globals.mapBins) {
    throw new Error('3D prikaz nije učitan: TeGo skripte ne definišu PackWidget, mapItems ili mapBins.')
  }
  return { PackWidget: globals.PackWidget, mapItems: globals.mapItems, mapBins: globals.mapBins }
}
