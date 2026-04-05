import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PermissionMap, PermissionLevel, ToolCategory } from '../api/mcp/types'
import { DEFAULT_PERMISSIONS } from '../api/mcp/types'

interface PermissionState {
  globalPermissions: PermissionMap
  conversationOverrides: Record<string, Partial<PermissionMap>>

  // Getters
  getEffectivePermissions: (conversationId?: string) => PermissionMap

  // Setters
  setGlobalPermission: (category: ToolCategory, level: PermissionLevel) => void
  setConversationOverride: (convId: string, category: ToolCategory, level: PermissionLevel) => void
  clearConversationOverrides: (convId: string) => void
  resetToDefaults: () => void
}

export const usePermissionStore = create<PermissionState>()(
  persist(
    (set, get) => ({
      globalPermissions: { ...DEFAULT_PERMISSIONS },
      conversationOverrides: {},

      getEffectivePermissions: (conversationId?) => {
        const global = get().globalPermissions
        if (!conversationId) return global
        const overrides = get().conversationOverrides[conversationId]
        if (!overrides) return global
        return { ...global, ...overrides }
      },

      setGlobalPermission: (category, level) =>
        set((state) => ({
          globalPermissions: { ...state.globalPermissions, [category]: level },
        })),

      setConversationOverride: (convId, category, level) =>
        set((state) => ({
          conversationOverrides: {
            ...state.conversationOverrides,
            [convId]: {
              ...(state.conversationOverrides[convId] || {}),
              [category]: level,
            },
          },
        })),

      clearConversationOverrides: (convId) =>
        set((state) => {
          const { [convId]: _, ...rest } = state.conversationOverrides
          return { conversationOverrides: rest }
        }),

      resetToDefaults: () =>
        set({ globalPermissions: { ...DEFAULT_PERMISSIONS }, conversationOverrides: {} }),
    }),
    { name: 'locally-uncensored-permissions' }
  )
)
