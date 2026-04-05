import { useRef, useState, useCallback } from 'react'
import { v4 as uuid } from 'uuid'
import { useCodexStore } from '../stores/codexStore'
import { useModelStore } from '../stores/modelStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useChatStore } from '../stores/chatStore'
import { getProviderForModel, getProviderIdFromModel } from '../api/providers'
import { toolRegistry } from '../api/mcp'
import { usePermissionStore } from '../stores/permissionStore'
import { getToolCallingStrategy } from '../lib/model-compatibility'
import { buildHermesToolPrompt, buildHermesToolResult, parseHermesToolCalls, stripToolCallTags, hasToolCallTags } from '../api/hermes-tool-calling'
import { chatNonStreaming } from '../api/agents'
import type { CodexEvent } from '../types/codex'
import type { AgentBlock, AgentToolCall } from '../types/agent-mode'
import { selectRelevantTools } from '../lib/tool-selection'
import type { ChatMessage, ToolCall, ToolDefinition } from '../api/providers/types'

const CODEX_SYSTEM_PROMPT = `You are Codex, an autonomous coding agent inside Locally Uncensored. You execute coding tasks by reading files, writing code, and running shell commands. You MUST use tools to interact with the filesystem — never guess file contents.

Workflow:
1. Understand the task
2. Explore the codebase (file_list, file_read, file_search)
3. Plan your changes
4. Implement changes (file_write)
5. Verify your work (shell_execute to run tests, lint, or build)

Rules:
- Always read a file before modifying it
- Explain what you are doing before each action
- After writing files, show a summary of changes made
- If a command fails, diagnose the issue and try a different approach
- Be concise — show results, not verbose explanations`

// Coding-relevant tool categories
const CODEX_CATEGORIES = ['filesystem', 'terminal', 'system', 'web'] as const

export function useCodex() {
  const [isRunning, setIsRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const runningRef = useRef(false)

  const sendInstruction = useCallback(async (instruction: string) => {
    const { activeModel } = useModelStore.getState()
    if (!activeModel) return

    const store = useChatStore.getState()
    const codexStore = useCodexStore.getState()
    const { settings } = useSettingsStore.getState()
    const persona = useSettingsStore.getState().getActivePersona()

    // Ensure conversation exists
    let convId = store.activeConversationId
    if (!convId) {
      convId = store.createConversation(activeModel, persona?.systemPrompt || '', 'codex')
    }

    // Init codex thread if needed
    if (!codexStore.getThread(convId)) {
      codexStore.initThread(convId, codexStore.workingDirectory || '.')
    }

    const thread = codexStore.getThread(convId)!
    const workDir = thread.workingDirectory || codexStore.workingDirectory || '.'

    // Add instruction event
    codexStore.addEvent(convId, {
      id: uuid(), type: 'instruction', content: instruction, timestamp: Date.now(),
    })

    // Add user message to chat store
    useChatStore.getState().addMessage(convId, {
      id: uuid(), role: 'user', content: instruction, timestamp: Date.now(),
    })

    // Add empty assistant message
    const assistantMsg = {
      id: uuid(), role: 'assistant' as const, content: '', thinking: '', timestamp: Date.now(), agentBlocks: [],
    }
    useChatStore.getState().addMessage(convId, assistantMsg)
    let thinkingContent = ''

    const blocks: AgentBlock[] = []
    function addBlock(block: AgentBlock) {
      blocks.push(block)
      useChatStore.getState().updateMessageAgentBlocks(convId!, assistantMsg.id, [...blocks])
    }

    // Resolve provider
    const { provider, modelId } = getProviderForModel(activeModel)
    const providerId = getProviderIdFromModel(activeModel)
    const strategy = providerId === 'ollama'
      ? getToolCallingStrategy(activeModel)
      : 'native'
    const modelToUse = activeModel.includes('::') ? activeModel.split('::')[1] : activeModel

    // Build permissions — auto-approve reads, confirm writes
    const permissions = usePermissionStore.getState().getEffectivePermissions(convId)

    // System prompt with working directory
    let systemPrompt = `${CODEX_SYSTEM_PROMPT}\n\nWorking directory: ${workDir}`

    // For non-Ollama providers, inject thinking via system prompt
    if (settings.thinkingEnabled && providerId !== 'ollama') {
      systemPrompt += '\n\nBefore answering, reason through your thinking inside <think></think> tags. Your thinking will be hidden from the user. After thinking, provide your answer outside the tags.'
    }

    // Build message history
    const conv = useChatStore.getState().conversations.find(c => c.id === convId)
    if (!conv) return

    let messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...conv.messages
        .filter(m => m.role !== 'system' && m.content.trim())
        .map(m => ({ role: m.role as 'user' | 'assistant' | 'tool', content: m.content })),
    ]

    // Setup
    const abort = new AbortController()
    abortRef.current = abort
    runningRef.current = true
    setIsRunning(true)
    codexStore.setThreadStatus(convId, 'running')

    let fullContent = ''

    try {
      // Agent loop — max 20 iterations
      for (let i = 0; i < 20 && runningRef.current && !abort.signal.aborted; i++) {
        let toolCalls: ToolCall[] = []
        let turnContent = ''

        const chatOptions = {
          temperature: 0.1, // Low temp for coding precision
          maxTokens: settings.maxTokens || undefined,
          thinking: settings.thinkingEnabled === true ? true : false,
          signal: abort.signal,
        }

        if (strategy === 'native') {
          const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || ''
          const relevantDefs = selectRelevantTools(lastUserMsg, toolRegistry.getAll(), permissions)
          const tools: ToolDefinition[] = relevantDefs.map(t => ({
            type: 'function' as const,
            function: { name: t.name, description: t.description, parameters: t.inputSchema },
          }))
          const turn = await provider.chatWithTools(modelToUse, messages, tools, chatOptions)
          toolCalls = turn.toolCalls
          turnContent = turn.content || ''
          if ((turn as any).thinking) {
            thinkingContent += (thinkingContent ? '\n\n' : '') + (turn as any).thinking
            useChatStore.getState().updateMessageThinking(convId!, assistantMsg.id, thinkingContent)
          }
        } else {
          const hermesTools = toolRegistry.toHermesToolDefs(permissions)
          const hermesSystem = buildHermesToolPrompt(hermesTools) + `\n\n${systemPrompt}`
          messages[0] = { role: 'system', content: hermesSystem }
          const raw = await chatNonStreaming(
            modelToUse,
            messages.map(m => ({ role: m.role, content: m.content })),
            abort.signal,
          )
          if (hasToolCallTags(raw)) {
            toolCalls = parseHermesToolCalls(raw).map(tc => ({
              function: { name: tc.name, arguments: tc.arguments },
            }))
            turnContent = stripToolCallTags(raw)
          } else {
            turnContent = raw
          }
        }

        // Strip Gemma 4 channel tags from content
        turnContent = turnContent
          .replace(/<\|?channel>?\s*thought\s*/gi, '')
          .replace(/<\|?channel\|?>/gi, '')
          .replace(/<channel\|>/gi, '')
          .trim()

        if (turnContent) {
          fullContent += (fullContent ? '\n\n' : '') + turnContent
          useChatStore.getState().updateMessageContent(convId, assistantMsg.id, fullContent)
        }

        // No tool calls → done
        if (toolCalls.length === 0) break

        // Execute tool calls
        for (const tc of toolCalls) {
          if (!runningRef.current || abort.signal.aborted) break

          const toolName = tc.function.name
          const toolArgs = { ...tc.function.arguments }

          // Inject working directory for file/shell tools
          if (toolName === 'shell_execute' && !toolArgs.cwd) {
            toolArgs.cwd = workDir
          }
          if (toolName === 'code_execute' && !toolArgs.cwd) {
            toolArgs.cwd = workDir
          }
          // Resolve relative file paths against working directory
          if ((toolName === 'file_read' || toolName === 'file_write' || toolName === 'file_list' || toolName === 'file_search') && toolArgs.path) {
            const p = toolArgs.path
            if (!p.startsWith('/') && !p.startsWith('C:') && !p.startsWith('\\\\') && workDir) {
              toolArgs.path = workDir.replace(/\\/g, '/') + '/' + p
            }
          }

          // Create tool call block (visible in chat)
          const toolCallId = uuid()
          const agentToolCall: AgentToolCall = {
            id: toolCallId, toolName, args: toolArgs,
            status: 'running', timestamp: Date.now(),
          }
          addBlock({
            id: uuid(), phase: 'tool_call', content: `Running: ${toolName}`,
            toolCall: agentToolCall, timestamp: Date.now(),
          })

          // Execute
          const startTime = Date.now()
          const result = await toolRegistry.execute(toolName, toolArgs)
          const duration = Date.now() - startTime
          const isError = result.startsWith('Error:')

          // Update block with result
          agentToolCall.status = isError ? 'failed' : 'completed'
          agentToolCall.result = isError ? undefined : result
          agentToolCall.error = isError ? result : undefined
          agentToolCall.duration = duration
          const lastBlock = blocks[blocks.length - 1]
          if (lastBlock) {
            lastBlock.toolCall = { ...agentToolCall }
            lastBlock.content = isError ? `Failed: ${toolName}` : `Completed: ${toolName}`
            useChatStore.getState().updateMessageAgentBlocks(convId!, assistantMsg.id, [...blocks])
          }

          // Also add codex event for the event log
          if (toolName === 'shell_execute' || toolName === 'code_execute') {
            codexStore.addEvent(convId, {
              id: uuid(), type: 'terminal_output', content: result, timestamp: Date.now(),
            })
          } else if (toolName === 'file_write') {
            codexStore.addEvent(convId, {
              id: uuid(), type: 'file_change', content: result,
              filePath: toolArgs.path, timestamp: Date.now(),
            })
          } else if (isError) {
            codexStore.addEvent(convId, {
              id: uuid(), type: 'error', content: result, timestamp: Date.now(),
            })
          }

          // Append to message history
          if (providerId === 'openai' || providerId === 'anthropic') {
            messages.push({ role: 'assistant', content: turnContent || '', tool_calls: [tc] })
            messages.push({ role: 'tool', content: result, tool_call_id: tc.id })
          } else if (strategy === 'native') {
            messages.push({
              role: 'assistant', content: turnContent || '',
              tool_calls: [{ function: { name: toolName, arguments: toolArgs } }],
            })
            messages.push({ role: 'tool', content: result })
          } else {
            messages.push({
              role: 'assistant',
              content: `<tool_call>\n{"name": "${toolName}", "arguments": ${JSON.stringify(toolArgs)}}\n</tool_call>`,
            })
            messages.push({ role: 'user', content: buildHermesToolResult(toolName, result) })
          }
        }
      }

      // Final update
      codexStore.addEvent(convId, {
        id: uuid(), type: 'done', content: 'Task completed.', timestamp: Date.now(),
      })

    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const msg = (err as Error).message || 'Codex error'
        fullContent += `\n\nError: ${msg}`
        useChatStore.getState().updateMessageContent(convId, assistantMsg.id, fullContent)
        codexStore.addEvent(convId, {
          id: uuid(), type: 'error', content: msg, timestamp: Date.now(),
        })
      }
    } finally {
      setIsRunning(false)
      runningRef.current = false
      abortRef.current = null
      codexStore.setThreadStatus(convId, 'idle')
    }
  }, [])

  const stopCodex = useCallback(() => {
    runningRef.current = false
    abortRef.current?.abort()
    abortRef.current = null
    setIsRunning(false)
  }, [])

  return { sendInstruction, stopCodex, isRunning }
}
