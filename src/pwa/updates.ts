import { registerSW } from 'virtual:pwa-register';

let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;
let registration: ServiceWorkerRegistration | undefined;

/**
 * Registers the service worker. A new version is never applied on its own: `onUpdate` receives an
 * `apply` function to call when the auditor taps "Reload".
 */
export function registerUpdates(onUpdate: (apply: () => void) => void): void {
  if (!('serviceWorker' in navigator)) return;
  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      onUpdate(() => {
        void applyUpdate?.(true);
      });
    },
    onRegisteredSW(_url, reg) {
      registration = reg;
    },
  });
}

/** Asks the browser to look for a newer service worker now. Resolves false when none is registered. */
export async function checkForUpdates(): Promise<boolean> {
  if (!registration) return false;
  await registration.update();
  return true;
}
