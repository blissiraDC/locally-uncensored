import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Search, Trash2, Edit3, Check, X } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { useUIStore } from '../../stores/uiStore'
import { useModelStore } from '../../stores/modelStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { formatDate, truncate } from '../../lib/formatters'

export function Sidebar() {
  const { conversations, activeConversationId, createConversation, deleteConversation, renameConversation, setActiveConversation } = useChatStore()
  const { sidebarOpen, setView } = useUIStore()
  const { activeModel } = useModelStore()
  const { getActivePersona } = useSettingsStore()
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')

  const filtered = search
    ? conversations.filter(
        (c) =>
          c.title.toLowerCase().includes(search.toLowerCase()) ||
          c.messages.some((m) => m.content.toLowerCase().includes(search.toLowerCase()))
      )
    : conversations

  const handleNewChat = () => {
    const persona = getActivePersona()
    if (activeModel) {
      createConversation(activeModel, persona?.systemPrompt || '')
      setView('chat')
    }
  }

  const handleRename = (id: string) => {
    if (editTitle.trim()) {
      renameConversation(id, editTitle.trim())
    }
    setEditingId(null)
  }

  return (
    <AnimatePresence>
      {sidebarOpen && (
        <motion.aside
          className="w-56 h-full border-r border-gray-200 dark:border-white/[0.04] bg-gray-50 dark:bg-[#0a0a0a] flex flex-col z-20 overflow-hidden"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 224, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* New Chat + Search */}
          <div className="px-2 pt-2 pb-1 space-y-1.5">
            <button
              onClick={handleNewChat}
              className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[0.7rem] text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-white/[0.05] transition-all"
            >
              <Plus size={13} />
              <span>New Chat</span>
            </button>

            <div className="relative">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-600" />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-6 pr-2 py-1 rounded-md bg-transparent border border-gray-200 dark:border-white/[0.04] text-[0.65rem] text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-gray-400 dark:focus:border-white/10"
              />
            </div>
          </div>

          {/* Conversations */}
          <div className="flex-1 overflow-y-auto px-1.5 pt-1 space-y-px scrollbar-thin">
            {filtered.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-all ${
                  conv.id === activeConversationId
                    ? 'bg-gray-200 dark:bg-white/[0.06] text-gray-900 dark:text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.03] hover:text-gray-800 dark:hover:text-gray-200'
                }`}
                onClick={() => {
                  setActiveConversation(conv.id)
                  setView('chat')
                }}
              >
                <div className="flex-1 min-w-0">
                  {editingId === conv.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRename(conv.id)}
                        className="w-full bg-white/5 rounded px-1 py-0.5 text-[0.65rem] text-white focus:outline-none"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button onClick={(e) => { e.stopPropagation(); handleRename(conv.id) }} className="text-green-400"><Check size={11} /></button>
                      <button onClick={(e) => { e.stopPropagation(); setEditingId(null) }} className="text-gray-500"><X size={11} /></button>
                    </div>
                  ) : (
                    <>
                      <p className="text-[0.68rem] truncate">{truncate(conv.title, 28)}</p>
                      <p className="text-[0.55rem] text-gray-600">{formatDate(conv.updatedAt)}</p>
                    </>
                  )}
                </div>
                {editingId !== conv.id && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingId(conv.id); setEditTitle(conv.title) }}
                      className="p-0.5 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300"
                    >
                      <Edit3 size={10} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id) }}
                      className="p-0.5 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                )}
              </div>
            ))}

            {filtered.length === 0 && (
              <p className="text-center text-gray-600 text-[0.6rem] py-6">
                {search ? 'No results' : 'No conversations'}
              </p>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
