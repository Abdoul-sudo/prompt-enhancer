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
      /** Whether the project has a project-context.md; null until checked. */
      hasProjectContext: boolean | null
      /** The pending Create project context request: 'starting', then the id of the subagent writing the file; null when none. */
      contextRequest: string | null
    }
  }
}
