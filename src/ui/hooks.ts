import { usePublishedCosting, usePublishedPolicies } from '../state/published'
import { useApp } from './AppContext'
import type { AllocationPolicy } from '../domain/types'

export function useCosting(policy?: AllocationPolicy) {
  return usePublishedCosting(useApp().basisMonth, policy)
}

export function useAllPolicies() {
  return usePublishedPolicies(useApp().basisMonth)
}
