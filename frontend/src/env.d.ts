declare global {
  interface ImportMetaEnv {
    /** Mock data set: small (default) | test7 | proven | notFound */
    readonly VITE_MOCK_SCENARIO?: string
  }
}

export {}
