declare global {
  interface ImportMetaEnv {
    /** Fixture data set: small | test7 | proven | notFound; mock default small, local default none (empty) */
    readonly VITE_MOCK_SCENARIO?: string
    /** local (default) | mock | server, see src/api/apiMode.ts */
    readonly VITE_API_MODE?: string
  }
}

export {}
