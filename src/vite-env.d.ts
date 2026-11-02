/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string;
}

/** True only in builds made with VITE_FAKE_REMOTE=1 (tests); see vite.config.ts. */
declare const __HS_FAKE__: boolean;
