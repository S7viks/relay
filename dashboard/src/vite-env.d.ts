/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** When set (e.g. on Vercel), API requests go to this origin (no trailing slash). */
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
