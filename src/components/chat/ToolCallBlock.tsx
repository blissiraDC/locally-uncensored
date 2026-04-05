import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Search, Globe, FileText, FileEdit, Terminal, Image, Loader2, Check, X, Clock, AlertCircle, FolderOpen, Cpu, Monitor, GitBranch } from 'lucide-react'
import type { AgentToolCall } from '../../types/agent-mode'

interface Props {
  toolCall: AgentToolCall
  onApprove?: () => void
  onReject?: () => void
}

const TOOL_ICONS: Record<string, typeof Search> = {
  web_search: Search,
  web_fetch: Globe,
  file_read: FileText,
  file_write: FileEdit,
  file_list: FolderOpen,
  file_search: Search,
  code_execute: Terminal,
  shell_execute: Terminal,
  system_info: Cpu,
  process_list: Cpu,
  screenshot: Monitor,
  image_generate: Image,
  run_workflow: GitBranch,
}

const TOOL_COLORS: Record<string, string> = {
  web_search: 'text-blue-400',
  web_fetch: 'text-cyan-400',
  file_read: 'text-gray-400',
  file_write: 'text-amber-400',
  file_list: 'text-gray-400',
  file_search: 'text-gray-400',
  code_execute: 'text-green-400',
  shell_execute: 'text-green-400',
  system_info: 'text-purple-400',
  process_list: 'text-purple-400',
  screenshot: 'text-pink-400',
  image_generate: 'text-purple-400',
  run_workflow: 'text-amber-400',
}

const STATUS_ICONS = {
  pending_approval: Clock,
  running: Loader2,
  completed: Check,
  failed: AlertCircle,
  rejected: X,
}

export function ToolCallBlock({ toolCall, onApprove, onReject }: Props) {
  const [open, setOpen] = useState(toolCall.status === 'pending_approval')

  const ToolIcon = TOOL_ICONS[toolCall.toolName] || Terminal
  const StatusIcon = STATUS_ICONS[toolCall.status]
  const toolColor = TOOL_COLORS[toolCall.toolName] || 'text-gray-400'
  const isRunning = toolCall.status === 'running'
  const isPending = toolCall.status === 'pending_approval'

  return (
    <div className="mb-1">
      {/* Inline tool call line */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 py-0.5 text-left hover:opacity-80 transition-opacity w-full"
      >
        <ToolIcon size={12} className={`${toolColor} shrink-0`} />
        <span className={`text-[0.72rem] font-medium ${toolColor}`}>{toolCall.toolName}</span>
        <StatusIcon size={11} className={`shrink-0 ${
          toolCall.status === 'completed' ? 'text-green-500' :
          toolCall.status === 'failed' ? 'text-red-400' :
          toolCall.status === 'rejected' ? 'text-red-400' :
          isPending ? 'text-amber-400' :
          'text-gray-400'
        } ${isRunning ? 'animate-spin' : ''}`} />
        {toolCall.duration != null && (
          <span className="text-[0.6rem] text-gray-500">
            {toolCall.duration < 1000 ? `${toolCall.duration}ms` : `${(toolCall.duration / 1000).toFixed(1)}s`}
          </span>
        )}
        <ChevronDown
          size={10}
          className={`text-gray-500 ml-auto transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Expandable details */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="pl-5 pb-2 space-y-1.5">
              {/* Arguments */}
              <pre className="text-[0.62rem] leading-relaxed text-gray-500 bg-black/[0.02] dark:bg-white/[0.02] rounded px-2 py-1 overflow-x-auto scrollbar-thin">
                {JSON.stringify(toolCall.args, null, 2)}
              </pre>

              {/* Result — full content, scrollable */}
              {toolCall.result && (
                <pre className="text-[0.62rem] leading-relaxed text-gray-400 bg-black/[0.02] dark:bg-white/[0.02] rounded px-2 py-1 overflow-auto scrollbar-thin max-h-[300px]">
                  {toolCall.result}
                </pre>
              )}

              {/* Error */}
              {toolCall.error && (
                <pre className="text-[0.62rem] leading-relaxed text-red-400/80 rounded px-2 py-1">
                  {toolCall.error}
                </pre>
              )}

              {/* Approval buttons */}
              {isPending && onApprove && onReject && (
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); onApprove() }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded text-[0.65rem] font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
                  >
                    <Check size={11} /> Approve
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onReject() }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded text-[0.65rem] font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                  >
                    <X size={11} /> Reject
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
