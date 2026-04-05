import { usePermissionStore } from '../../stores/permissionStore'
import { useChatStore } from '../../stores/chatStore'
import type { ToolCategory, PermissionLevel } from '../../api/mcp/types'
import { FolderOpen, Terminal, Monitor, Globe, Cpu, Image, GitBranch } from 'lucide-react'

const CATEGORY_META: Record<ToolCategory, { icon: typeof Globe; short: string }> = {
  web: { icon: Globe, short: 'Web' },
  system: { icon: Cpu, short: 'Sys' },
  filesystem: { icon: FolderOpen, short: 'Files' },
  terminal: { icon: Terminal, short: 'Shell' },
  desktop: { icon: Monitor, short: 'Screen' },
  image: { icon: Image, short: 'Image' },
  workflow: { icon: GitBranch, short: 'Flow' },
}

const LEVEL_COLORS: Record<PermissionLevel, string> = {
  blocked: 'bg-red-500/10 border-red-500/30 text-red-400',
  confirm: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  auto: 'bg-green-500/10 border-green-500/30 text-green-400',
}

const NEXT_LEVEL: Record<PermissionLevel, PermissionLevel> = {
  blocked: 'confirm',
  confirm: 'auto',
  auto: 'blocked',
}

export function PermissionOverrideBar() {
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const { getEffectivePermissions, setConversationOverride, clearConversationOverrides, conversationOverrides } = usePermissionStore()

  if (!activeConversationId) return null

  const permissions = getEffectivePermissions(activeConversationId)
  const hasOverrides = !!conversationOverrides[activeConversationId]

  const handleClick = (category: ToolCategory) => {
    const current = permissions[category]
    setConversationOverride(activeConversationId, category, NEXT_LEVEL[current])
  }

  return (
    <div className="flex items-center gap-1 px-2 py-0.5 flex-wrap">
      {(Object.keys(CATEGORY_META) as ToolCategory[]).map((cat) => {
        const { icon: Icon, short } = CATEGORY_META[cat]
        const level = permissions[cat]
        return (
          <button
            key={cat}
            onClick={() => handleClick(cat)}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[0.5rem] font-medium transition-all ${LEVEL_COLORS[level]}`}
            title={`${short}: ${level} — click to cycle`}
          >
            <Icon size={9} />
            <span>{short}</span>
          </button>
        )
      })}
      {hasOverrides && (
        <button
          onClick={() => clearConversationOverrides(activeConversationId)}
          className="text-[0.5rem] text-gray-600 hover:text-gray-400 transition-colors ml-1"
        >
          reset
        </button>
      )}
    </div>
  )
}
