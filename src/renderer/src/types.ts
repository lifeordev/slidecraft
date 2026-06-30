// Renderer-local UI model for rendering the chat transcript.

export type ChatItem =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; text: string }
  | { id: string; role: 'tool'; name: string; summary: string; result?: string; isError?: boolean }
  | { id: string; role: 'notice'; text: string }
