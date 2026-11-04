import { isCloudApiConfigured } from '../storage/mongoApi'

let timer: ReturnType<typeof setTimeout> | null = null
let pushing = false

/** Debounced push of full local state → MongoDB (indexed collections). */
export function scheduleCloudPush() {
  if (!isCloudApiConfigured()) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    if (pushing) return
    pushing = true
    void import('./cloudSyncService')
      .then((m) => m.pushLocalToCloud())
      .catch(() => {})
      .finally(() => {
        pushing = false
      })
  }, 2500)
}
