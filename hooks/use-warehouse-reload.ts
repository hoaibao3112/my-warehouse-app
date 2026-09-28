import { useEffect } from 'react'
import { WAREHOUSE_CHANGE_EVENT } from '@/components/store/warehouse-selector'

/**
 * Custom hook to automatically reload data when warehouse changes
 * Use this in any page/component that displays warehouse-specific data
 * 
 * @param reloadFn - Function to call when warehouse changes (e.g., fetchData)
 * @param deps - Optional dependencies array
 */
export function useWarehouseReload(reloadFn: () => void | Promise<void>, deps: any[] = []) {
  useEffect(() => {
    // Listen for warehouse changes - reload immediately
    const handleWarehouseChange = () => {
      reloadFn()
    }

    window.addEventListener(WAREHOUSE_CHANGE_EVENT, handleWarehouseChange)

    return () => {
      window.removeEventListener(WAREHOUSE_CHANGE_EVENT, handleWarehouseChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
