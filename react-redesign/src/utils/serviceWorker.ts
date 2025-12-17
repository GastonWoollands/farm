// Service Worker Registration for PWA using vite-plugin-pwa
import { registerSW } from 'virtual:pwa-register'

// Store the update function globally so components can trigger it
let updateSWCallback: ((reloadPage?: boolean) => Promise<void>) | null = null

interface PWAConfig {
  onNeedRefresh?: () => void
  onOfflineReady?: () => void
  onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void
  onRegisterError?: (error: Error) => void
}

/**
 * Register the service worker with update callbacks
 */
export function register(config?: PWAConfig) {
  if ('serviceWorker' in navigator) {
    updateSWCallback = registerSW({
      immediate: true,
      onNeedRefresh() {
        console.log('[PWA] New content available, refresh needed')
        config?.onNeedRefresh?.()
      },
      onOfflineReady() {
        console.log('[PWA] App ready to work offline')
        config?.onOfflineReady?.()
      },
      onRegistered(registration) {
        console.log('[PWA] Service worker registered:', registration)
        config?.onRegistered?.(registration)
        
        // Check for updates periodically (every 5 minutes)
        if (registration) {
          setInterval(() => {
            console.log('[PWA] Checking for updates...')
            registration.update()
          }, 5 * 60 * 1000)
        }
      },
      onRegisterError(error) {
        console.error('[PWA] Service worker registration failed:', error)
        config?.onRegisterError?.(error)
      }
    })
    
    // Also check for updates when app becomes visible
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker.ready.then((registration) => {
          console.log('[PWA] App visible, checking for updates...')
          registration.update()
        })
      }
    })
  }
}

/**
 * Trigger the service worker update and reload the page
 */
export async function skipWaitingAndReload() {
  if (updateSWCallback) {
    console.log('[PWA] Updating service worker and reloading...')
    try {
      await updateSWCallback(true)
      // If we get here and page didn't reload, force it
      console.log('[PWA] Update complete, forcing reload...')
      window.location.reload()
    } catch (error) {
      console.error('[PWA] Update failed, forcing reload anyway:', error)
      window.location.reload()
    }
  } else {
    console.log('[PWA] No update callback, reloading page...')
    window.location.reload()
  }
}

/**
 * Unregister the service worker
 */
export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister()
      })
      .catch((error) => {
        console.error('[PWA] Unregister failed:', error.message)
      })
  }
}

/**
 * Force check for updates immediately
 */
export async function checkForUpdates(): Promise<boolean> {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready
      await registration.update()
      return !!registration.waiting
    } catch {
      return false
    }
  }
  return false
}

/**
 * Get current service worker status
 */
export function getServiceWorkerStatus() {
  return {
    supported: 'serviceWorker' in navigator,
    hasController: !!navigator.serviceWorker?.controller
  }
}

/**
 * PWA Install Prompt Handler
 */
export function registerPWAInstallPrompt() {
  let deferredPrompt: BeforeInstallPromptEvent | null = null

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    console.log('[PWA] Install prompt available')
  })

  window.addEventListener('appinstalled', () => {
    console.log('[PWA] App was installed')
    deferredPrompt = null
  })

  return {
    showInstallPrompt: async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt()
        const choiceResult = await deferredPrompt.userChoice
        if (choiceResult.outcome === 'accepted') {
          console.log('[PWA] User accepted the install prompt')
        } else {
          console.log('[PWA] User dismissed the install prompt')
        }
        deferredPrompt = null
      }
    },
    canInstall: () => !!deferredPrompt
  }
}

// TypeScript interface for the beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
