/**
 * Version + commit of this bundle, injected at build time by vite.config.ts
 * (see ../../build-info.ts). Shown in the sidebar so you can tell which
 * build is live.
 */
import { buildLabel, commitUrl } from '../../build-info'

declare const __APP_VERSION__: string
declare const __BUILD_SHA__: string

export const APP_VERSION: string = __APP_VERSION__
export const BUILD_SHA: string = __BUILD_SHA__
export const BUILD_LABEL: string = buildLabel(APP_VERSION, BUILD_SHA)
export const BUILD_COMMIT_URL: string | null = commitUrl(BUILD_SHA)
