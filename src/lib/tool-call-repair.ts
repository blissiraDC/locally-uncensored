/**
 * Tool Call Repair — fixes broken JSON from local LLMs.
 *
 * Common issues:
 * - Trailing commas in JSON objects/arrays
 * - Single quotes instead of double quotes
 * - Missing closing braces/brackets
 * - Unquoted property names
 * - Extra text before/after JSON
 * - Escaped quotes inside strings
 */

/**
 * Attempt to repair broken JSON from a tool call.
 * Returns parsed object or null if unfixable.
 */
export function repairJson(raw: string): any | null {
  // 1. Try direct parse first
  try { return JSON.parse(raw) } catch {}

  let fixed = raw.trim()

  // 2. Extract JSON from surrounding text (model might wrap it)
  const jsonMatch = fixed.match(/\{[\s\S]*\}/)
  if (jsonMatch) fixed = jsonMatch[0]

  // 3. Fix single quotes → double quotes (but not inside strings)
  fixed = fixed.replace(/'/g, '"')

  // 4. Fix trailing commas
  fixed = fixed.replace(/,\s*([}\]])/g, '$1')

  // 5. Fix unquoted keys: { key: "value" } → { "key": "value" }
  fixed = fixed.replace(/(\{|,)\s*([a-zA-Z_]\w*)\s*:/g, '$1"$2":')

  // 6. Fix missing closing braces
  const openBraces = (fixed.match(/\{/g) || []).length
  const closeBraces = (fixed.match(/\}/g) || []).length
  for (let i = 0; i < openBraces - closeBraces; i++) fixed += '}'

  const openBrackets = (fixed.match(/\[/g) || []).length
  const closeBrackets = (fixed.match(/\]/g) || []).length
  for (let i = 0; i < openBrackets - closeBrackets; i++) fixed += ']'

  // 7. Try parse again
  try { return JSON.parse(fixed) } catch {}

  // 8. Last resort: try to extract key-value pairs with regex
  try {
    const nameMatch = raw.match(/["']?name["']?\s*[:=]\s*["']([^"']+)["']/i)
    const argsMatch = raw.match(/["']?arguments["']?\s*[:=]\s*(\{[^}]*\})/i)
    if (nameMatch) {
      let args = {}
      if (argsMatch) {
        try { args = JSON.parse(argsMatch[1].replace(/'/g, '"')) } catch {}
      }
      return { name: nameMatch[1], arguments: args }
    }
  } catch {}

  return null
}

/**
 * Repair tool call arguments that might be a string instead of object.
 */
export function repairToolCallArgs(args: any): Record<string, any> {
  if (typeof args === 'object' && args !== null) return args
  if (typeof args === 'string') {
    const parsed = repairJson(args)
    if (parsed && typeof parsed === 'object') return parsed
  }
  return {}
}

/**
 * Extract tool calls from model content when native tool calling fails.
 * Looks for JSON patterns that look like tool calls.
 */
export function extractToolCallsFromContent(content: string): { name: string; arguments: Record<string, any> }[] {
  const calls: { name: string; arguments: Record<string, any> }[] = []

  // Pattern 1: {"name": "tool_name", "arguments": {...}}
  const pattern1 = /\{\s*"(?:name|tool|function)"\s*:\s*"([^"]+)"\s*,\s*"(?:arguments|args|parameters|input)"\s*:\s*(\{[^}]*\})\s*\}/gi
  let match
  while ((match = pattern1.exec(content)) !== null) {
    const args = repairJson(match[2])
    if (args) calls.push({ name: match[1], arguments: args })
  }

  // Pattern 2: tool_name(arg1, arg2) — function call syntax
  if (calls.length === 0) {
    const pattern2 = /\b(web_search|web_fetch|file_read|file_write|file_list|file_search|shell_execute|code_execute|system_info|process_list|screenshot)\s*\(\s*([^)]*)\)/gi
    while ((match = pattern2.exec(content)) !== null) {
      const argStr = match[2].trim()
      let args: Record<string, any> = {}
      if (argStr) {
        // Try to parse as JSON
        const parsed = repairJson(`{${argStr}}`)
        if (parsed) args = parsed
        else {
          // Simple single-argument: treat as the first required param
          args = { query: argStr.replace(/^["']|["']$/g, '') }
        }
      }
      calls.push({ name: match[1], arguments: args })
    }
  }

  return calls
}
