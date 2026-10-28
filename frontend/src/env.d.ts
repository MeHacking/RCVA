declare global {
  interface ImportMetaEnv {
    /** Mock data set: small (default) | test7 | proven | notFound */
    readonly VITE_MOCK_SCENARIO?: string
    /** mock (default) | server, see src/api/apiMode.ts */
    readonly VITE_API_MODE?: string
  }
}

export {}
