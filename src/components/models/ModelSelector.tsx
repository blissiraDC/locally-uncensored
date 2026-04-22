import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Check, Loader2, Power } from 'lucide-react'
import { useModels } from '../../hooks/useModels'
import { useModelStore } from '../../stores/modelStore'
import { useProviderStore } from '../../stores/providerStore'
import { unloadAllModels } from '../../api/ollama'
import { displayModelName } from '../../api/providers'
import { formatBytes } from '../../lib/formatters'
import type { AIModel } from '../../types/models'

// ── Badge configs ─────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  text: 'text-blue-400',
  image: 'text-purple-400',
  video: 'text-emerald-400',
}

const TYPE_LABEL: Record<string, string> = {
  text: 'TXT',
  image: 'IMG',
  video: 'VID',
}

const PROVIDER_BADGE: Record<string, { label: string; color: string }> = {
  ollama: { label: 'Ollama', color: 'text-emerald-400/70' },
  openai: { label: 'Cloud', color: 'text-sky-400/70' },
  anthropic: { label: 'Claude', color: 'text-violet-400/70' },
}

function getProviderBadge(model: AIModel) {
  const provider = ('provider' in model && model.provider) || 'ollama'
  const providerName = ('providerName' in model && model.providerName) || 'Ollama'

  if (providerName && providerName !== 'Ollama' && providerName !== 'OpenAI-Compatible' && providerName !== 'Anthropic') {
    return { label: providerName, color: PROVIDER_BADGE[provider]?.color || PROVIDER_BADGE.ollama.color }
  }
  return PROVIDER_BADGE[provider] || PROVIDER_BADGE.ollama
}

// ── Group models by family (Qwen / Gemma / Llama / …) ────────
//
// Users care more about model lineage than about which local backend
// they're pointing at. "Qwen 3.6 27B" appears once under Qwen whether
// it came from Ollama or LM Studio — the per-row provider badge
// (rendered below) keeps that detail visible.
//
// Pure visual grouping — model name + provider still resolve chat
// routing exactly as before.

// Normalize a model name into a comparable base form:
//   openai::qwen3.6-27b        → qwen3.6-27b
//   richardyoung/qwen3-14b:…   → qwen3-14b
//   Qwen3.6-27B-Q4_K_M.gguf    → qwen3.6-27b-q4_k_m.gguf
function normalizeModelName(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/^[^:]+::/, '')    // strip openai:: / anthropic::
    .replace(/^[^/]+\//, '')    // strip repo-author/ prefix
    .replace(/:.+$/, '')        // strip :tag suffix
}

// Ordered — first match wins. Prefixes/infixes on the normalized name.
const FAMILY_MATCHERS: Array<{ family: string; test: RegExp }> = [
  { family: 'Qwen',       test: /^qwen|^qwq/ },
  { family: 'Gemma',      test: /^gemma/ },
  { family: 'Llama',      test: /^llama|^meta[-_]?llama/ },
  { family: 'Mistral',    test: /^mistral|^mixtral|^mistral-nemo|^mistral-small|^mistral-large/ },
  { family: 'DeepSeek',   test: /^deepseek/ },
  { family: 'Phi',        test: /^phi-?\d|^phi_?\d/ },
  { family: 'Hermes',     test: /^hermes|^nous-/ },
  { family: 'Dolphin',    test: /^dolphin/ },
  { family: 'Claude',     test: /^claude/ },
  { family: 'GPT-OSS',    test: /^gpt-oss/ },
  { family: 'GPT / o-series', test: /^gpt-|^o1-|^o3-/ },
  { family: 'Command',    test: /^command/ },
  { family: 'GLM',        test: /^glm|^chatglm|^zai/ },
  { family: 'Yi',         test: /^yi-/ },
  { family: 'Gemini',     test: /^gemini/ },
  { family: 'Grok',       test: /^grok/ },
]

function getModelFamily(modelName: string): string {
  const n = normalizeModelName(modelName)
  for (const { family, test } of FAMILY_MATCHERS) {
    if (test.test(n)) return family
  }
  return 'Other'
}

// Family display order — Qwen/Gemma/Llama surface first since they're
// the most common local-chat picks; cloud-only families (Claude/GPT)
// come after the local ones; 'Other' always last.
const FAMILY_ORDER: string[] = [
  'Qwen', 'Gemma', 'Llama', 'Mistral', 'DeepSeek', 'Phi', 'Hermes',
  'Dolphin', 'GLM', 'GPT-OSS', 'Yi', 'Command',
  'Claude', 'GPT / o-series', 'Gemini', 'Grok',
]

function groupByFamily(models: AIModel[]): { family: string; models: AIModel[] }[] {
  const groups: Record<string, AIModel[]> = {}
  for (const m of models) {
    const fam = getModelFamily(m.name)
    if (!groups[fam]) groups[fam] = []
    groups[fam].push(m)
  }

  return Object.entries(groups)
    .sort(([a], [b]) => {
      if (a === 'Other') return 1
      if (b === 'Other') return -1
      const ai = FAMILY_ORDER.indexOf(a)
      const bi = FAMILY_ORDER.indexOf(b)
      if (ai >= 0 && bi >= 0) return ai - bi
      if (ai >= 0) return -1
      if (bi >= 0) return 1
      return a.localeCompare(b)
    })
    .map(([family, models]) => ({ family, models }))
}

// ── Component ─────────────────────────────────────────────────

export function ModelSelector() {
  const { models, activeModel, setActiveModel, fetchModels } = useModels()
  const isModelLoading = useModelStore((s) => s.isModelLoading)
  const [open, setOpen] = useState(false)
  const [unloading, setUnloading] = useState(false)
  const [unloadDone, setUnloadDone] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { fetchModels() }, [fetchModels])

  // Refetch when any provider's enabled state or baseUrl changes (e.g. user
  // enables LM Studio / adds Anthropic key in Settings, or the backend
  // picker activates an OpenAI-compatible provider). Without this the
  // dropdown stays stuck on whatever providers were enabled at mount time.
  useEffect(() => {
    const unsub = useProviderStore.subscribe((state, prev) => {
      const changed = (Object.keys(state.providers) as Array<keyof typeof state.providers>)
        .some(id => state.providers[id]?.enabled !== prev.providers[id]?.enabled
          || state.providers[id]?.baseUrl !== prev.providers[id]?.baseUrl)
      if (changed) fetchModels()
    })
    return () => unsub()
  }, [fetchModels])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const activeDisplayName = activeModel ? displayModelName(activeModel).split(':')[0] : 'Select Model'
  const activeModelObj = models.find((m) => m.name === activeModel)
  const activeType = activeModelObj?.type || 'text'
  // Chat dropdown shows TEXT models only — image/video live in the
  // Create view's own picker. Everything here is grouped by the model
  // FAMILY (Qwen/Gemma/Llama/…), not by provider, because users pick
  // models by lineage first and the backend that serves them is a
  // per-row badge.
  const textModels = models.filter(m => m.type === 'text')
  const groups = groupByFamily(textModels)
  const hasOllamaModels = textModels.some(m => ('provider' in m && m.provider === 'ollama') || !('provider' in m))

  return (
    <div ref={ref} className="relative">
      {/* ── Trigger Button ── */}
      <button
        onClick={() => setOpen(!open)}
        className={`
          group flex items-center gap-1.5 h-[26px] px-2 rounded-md
          bg-transparent border transition-all text-[0.7rem]
          hover:bg-white/[0.04]
          ${isModelLoading
            ? 'border-blue-500/40 shadow-[0_0_6px_rgba(59,130,246,0.2)]'
            : 'border-white/[0.06] hover:border-white/[0.1]'
          }
        `}
      >
        {/* Type indicator dot */}
        <span className={`w-1.5 h-1.5 rounded-full ${
          activeType === 'text' ? 'bg-blue-400' : activeType === 'image' ? 'bg-purple-400' : 'bg-emerald-400'
        } ${isModelLoading ? 'animate-pulse' : ''}`} />

        {/* Model name */}
        <span className="text-gray-300 max-w-[140px] truncate leading-none">
          {activeDisplayName}
        </span>

        {/* Chevron / Spinner */}
        {isModelLoading ? (
          <Loader2 size={10} className="animate-spin text-blue-400 ml-0.5" />
        ) : (
          <ChevronDown size={10} className={`text-gray-500 transition-transform ml-0.5 ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {/* ── Dropdown ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 w-72 rounded-lg overflow-hidden z-50 bg-[#0f0f0f] border border-white/[0.06] shadow-2xl shadow-black/50"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
          >
            {/* Scrollable model list */}
            <div className="py-1 max-h-[280px] overflow-y-auto scrollbar-thin">
              {textModels.length === 0 && (
                <p className="text-[0.65rem] text-gray-600 text-center py-3">No models available</p>
              )}

              {groups.map(({ family, models: groupModels }) => (
                <div key={family}>
                  {/* Section header */}
                  {groups.length > 1 && (
                    <div className="px-2.5 pt-2 pb-0.5">
                      <span className="text-[0.55rem] font-medium uppercase tracking-widest text-gray-600">
                        {family}
                      </span>
                    </div>
                  )}

                  {groupModels.map((model: AIModel) => {
                    const modelDisplayName = displayModelName(model.name)
                    const modelProvider = ('provider' in model && model.provider) || 'ollama'
                    const providerBadge = getProviderBadge(model)
                    const isActive = model.name === activeModel

                    return (
                      <button
                        key={model.name}
                        onClick={() => { setActiveModel(model.name); setOpen(false) }}
                        className={`
                          w-full flex items-center gap-2 px-2.5 py-[5px] mx-1 rounded text-left transition-colors
                          ${isActive
                            ? 'bg-white/[0.06] text-white'
                            : 'text-gray-400 hover:bg-white/[0.03] hover:text-gray-200'
                          }
                        `}
                        style={{ width: 'calc(100% - 8px)' }}
                      >
                        {/* Type dot */}
                        <span className={`w-1 h-1 rounded-full shrink-0 ${
                          model.type === 'text' ? 'bg-blue-400/70' : model.type === 'image' ? 'bg-purple-400/70' : 'bg-emerald-400/70'
                        }`} />

                        {/* Model info */}
                        <div className="flex-1 min-w-0 flex items-center gap-1.5">
                          <span className={`text-[0.7rem] truncate ${isActive ? 'text-white' : ''}`}>
                            {modelDisplayName}
                          </span>

                          {/* Subtle meta */}
                          {model.type !== 'text' && (
                            <span className={`text-[8px] uppercase font-medium tracking-wide ${TYPE_COLOR[model.type] || 'text-gray-500'} opacity-60`}>
                              {TYPE_LABEL[model.type] || model.type}
                            </span>
                          )}
                          {modelProvider !== 'ollama' && (
                            <span className={`text-[8px] ${providerBadge.color}`}>
                              {providerBadge.label}
                            </span>
                          )}
                        </div>

                        {/* Details on right */}
                        <div className="flex items-center gap-1 shrink-0">
                          {model.type === 'text' && 'details' in model && (model as any).details && (
                            <span className="text-[8px] text-gray-600">
                              {(model as any).details.parameter_size}
                            </span>
                          )}
                          {isActive && <Check size={11} className="text-blue-400" />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>

            {/* Sticky footer: Unload */}
            {hasOllamaModels && (
              <div className="border-t border-white/[0.04] px-1 py-1">
                <button
                  onClick={async (e) => {
                    e.stopPropagation()
                    if (unloading) return
                    setUnloading(true)
                    setUnloadDone(false)
                    try {
                      await unloadAllModels()
                      setUnloadDone(true)
                      setTimeout(() => setUnloadDone(false), 2000)
                    } catch { /* ignore */ }
                    finally { setUnloading(false) }
                  }}
                  disabled={unloading}
                  className="w-full flex items-center justify-center gap-1.5 px-2 py-[5px] rounded text-[0.6rem] text-red-500/60 hover:text-red-400 hover:bg-red-500/[0.06] transition-colors disabled:opacity-40"
                >
                  {unloading ? <Loader2 size={10} className="animate-spin" /> : <Power size={10} />}
                  <span>{unloadDone ? 'Unloaded' : unloading ? 'Unloading...' : 'Unload all models'}</span>
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
