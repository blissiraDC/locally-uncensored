// Dynamic Tool Registry — MCP-shaped, replaces hardcoded AGENT_TOOL_DEFS

import type { MCPToolDefinition, PermissionMap, PermissionLevel } from './types'
import type { OllamaTool } from '../../types/agent-mode'
import type { ToolDefinition } from '../providers/types'

type ToolExecutor = (args: Record<string, any>) => Promise<string>

interface RegisteredTool {
  definition: MCPToolDefinition
  executor: ToolExecutor
}

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>()

  // ── Registration ──────────────────────────────────────────────

  registerBuiltin(tool: MCPToolDefinition, executor: ToolExecutor) {
    this.tools.set(tool.name, { definition: tool, executor })
  }

  registerExternal(serverId: string, tools: MCPToolDefinition[], executor: ToolExecutor) {
    for (const tool of tools) {
      this.tools.set(tool.name, {
        definition: { ...tool, source: 'external', serverId },
        executor,
      })
    }
  }

  unregisterServer(serverId: string) {
    for (const [name, entry] of this.tools) {
      if (entry.definition.serverId === serverId) {
        this.tools.delete(name)
      }
    }
  }

  // ── Query ─────────────────────────────────────────────────────

  getAll(): MCPToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition)
  }

  getAvailableTools(permissions: PermissionMap): MCPToolDefinition[] {
    return this.getAll().filter(t => permissions[t.category] !== 'blocked')
  }

  getToolByName(name: string): MCPToolDefinition | undefined {
    return this.tools.get(name)?.definition
  }

  getPermissionLevel(toolName: string, permissions: PermissionMap): PermissionLevel {
    const tool = this.tools.get(toolName)?.definition
    if (!tool) return 'confirm'
    return permissions[tool.category]
  }

  // ── Execution ─────────────────────────────────────────────────

  async execute(name: string, args: Record<string, any>, maxRetries = 1): Promise<string> {
    const entry = this.tools.get(name)
    if (!entry) return `Error: Unknown tool "${name}"`

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await entry.executor(args)
        // If result is an error and we have retries left, retry
        if (result.startsWith('Error:') && attempt < maxRetries) {
          // Only retry on transient errors (timeout, network)
          const isTransient = result.includes('timed out') || result.includes('ECONNREFUSED') || result.includes('fetch failed')
          if (isTransient) continue
        }
        return result
      } catch (err) {
        if (attempt < maxRetries) continue
        const message = err instanceof Error ? err.message : String(err)
        return `Error: ${message}`
      }
    }
    return `Error: Max retries exceeded for "${name}"`
  }

  // ── Format Conversion ─────────────────────────────────────────

  toOllamaTools(permissions: PermissionMap): OllamaTool[] {
    return this.getAvailableTools(permissions).map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }))
  }

  toOpenAITools(permissions: PermissionMap): ToolDefinition[] {
    return this.getAvailableTools(permissions).map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }))
  }

  toHermesToolDefs(permissions: PermissionMap): { name: string; description: string; parameters: any }[] {
    return this.getAvailableTools(permissions).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    }))
  }
}

// ── Singleton ────────────────────────────────────────────────────

export const toolRegistry = new ToolRegistry()
