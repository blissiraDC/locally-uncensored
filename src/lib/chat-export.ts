/**
 * Chat Export — Markdown and JSON formats.
 */

import type { Conversation } from '../types/chat'

export function exportAsMarkdown(conversation: Conversation): string {
  const lines: string[] = []
  lines.push(`# ${conversation.title}`)
  lines.push(`_Model: ${conversation.model} | ${new Date(conversation.createdAt).toLocaleString()}_`)
  lines.push('')

  if (conversation.systemPrompt) {
    lines.push('## System Prompt')
    lines.push(conversation.systemPrompt)
    lines.push('')
  }

  lines.push('---')
  lines.push('')

  for (const msg of conversation.messages) {
    const role = msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'Assistant' : msg.role
    lines.push(`### ${role}`)

    if (msg.thinking) {
      lines.push('')
      lines.push('<details><summary>Thinking</summary>')
      lines.push('')
      lines.push(msg.thinking)
      lines.push('')
      lines.push('</details>')
    }

    if (msg.toolCallSummary) {
      lines.push('')
      lines.push(`> Tool: ${msg.toolCallSummary}`)
    }

    lines.push('')
    lines.push(msg.content)
    lines.push('')

    if (msg.sources && msg.sources.length > 0) {
      lines.push('**Sources:**')
      for (const src of msg.sources) {
        lines.push(`- ${src.documentName} (chunk ${src.chunkIndex})`)
      }
      lines.push('')
    }

    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}

export function exportAsJSON(conversation: Conversation): string {
  return JSON.stringify(conversation, null, 2)
}

export function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function exportConversation(conversation: Conversation, format: 'markdown' | 'json') {
  const safeTitle = conversation.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)
  if (format === 'markdown') {
    const content = exportAsMarkdown(conversation)
    downloadFile(content, `${safeTitle}.md`, 'text/markdown')
  } else {
    const content = exportAsJSON(conversation)
    downloadFile(content, `${safeTitle}.json`, 'application/json')
  }
}
