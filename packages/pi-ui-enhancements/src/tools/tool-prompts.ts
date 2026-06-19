export const TOOL_PROMPTS = {
  bash: {
    promptSnippet: "Execute bash commands (ls, grep, find, etc.)",
  },
  read: {
    promptSnippet: "Read file contents",
    promptGuidelines: ["Use read to examine files instead of cat or sed."],
  },
  write: {
    promptSnippet: "Create or overwrite files",
    promptGuidelines: ["Use write only for new files or complete rewrites."],
  },
} as const;
