/** The draft before the last rewrite, while it can be restored. */
export type OriginalDraft = string | null

declare module 'claude-code' {
  interface PluginState {
    'prompt-enhancer': {
      /** Whether the prompt box holds text; null until the first edit is seen. */
      hasDraft: boolean | null
      /** True while a rewrite runs. */
      isBusy: boolean
      original: OriginalDraft
    }
  }
}
