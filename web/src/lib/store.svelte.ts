/**
 * Reactive app state, shared across components via a single instance.
 *
 * Svelte 5 idiom: a class whose fields are `$state`. Reading any field from
 * a component subscribes to it; writing notifies subscribers.
 *
 * The save data is held in memory only — we never upload it. "Save" in the
 * browser app means downloading a fresh `.txt` with the same filename as
 * the loaded one; the user re-imports it into PokeClicker manually.
 */
import { decodeBytes, encodeBytes, type SaveData } from './save'

class AppStore {
  fileName = $state<string | null>(null)
  data = $state<SaveData | null>(null)
  status = $state('Open a save to begin.')
  errorDetail = $state('')
  /** True after any commit() call until the next load or download. */
  isDirty = $state(false)

  async load(file: File): Promise<void> {
    this.errorDetail = ''
    try {
      const text = await file.text()
      this.data = decodeBytes(text)
      this.fileName = file.name
      this.isDirty = false
      this.status = `loaded ${file.name}`
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.errorDetail = msg
      this.status = `failed to decode ${file.name}`
      // Keep any prior data so the user isn't stranded mid-edit on a bad pick.
    }
  }

  /** Mark the current in-memory data as edited since load. */
  markDirty(): void {
    this.isDirty = true
  }

  /** Trigger a browser download of the encoded save. No server round-trip. */
  download(): void {
    if (!this.data || !this.fileName) {
      this.status = 'nothing to save — load a file first'
      return
    }
    try {
      const b64 = encodeBytes(this.data)
      const blob = new Blob([b64], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = this.fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      this.isDirty = false
      this.status = `downloaded ${this.fileName}`
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.errorDetail = msg
      this.status = 'encode failed'
    }
  }
}

export const store = new AppStore()
