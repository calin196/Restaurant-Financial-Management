// Raw slices are for their owning UI. Cross-context consumers use published.ts
// or Workforce's deliberately smaller publication in workforce.ts.
import { financeStore, identityStore, insightsStore, inventoryStore, menuStore, salesStore, sharedStore, workforceStore } from './store'

export const useSharedState = sharedStore.useSlice
export const useIdentityState = identityStore.useSlice
export const useInventoryState = inventoryStore.useSlice
export const useMenuState = menuStore.useSlice
export const useSalesState = salesStore.useSlice
export const useWorkforceState = workforceStore.useSlice
export const useFinanceState = financeStore.useSlice
export const useInsightsState = insightsStore.useSlice
