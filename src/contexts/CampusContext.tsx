import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Campus } from '../types';

export type CampusFilter = 'ALL' | Campus;

const KEY = 'eventops.campus';

interface CampusContextValue {
  /** Header selection: ALL, HSC or HSN */
  campus: CampusFilter;
  setCampus: (c: CampusFilter) => void;
  /** undefined when ALL, ready to drop into a query filter */
  campusFilter: Campus | undefined;
}

const CampusContext = createContext<CampusContextValue | null>(null);

/**
 * One administrator manages both campuses. Campus is a filter and a label
 * across the back office, never a wall. The choice persists on the device.
 */
export function CampusProvider({ children }: { children: ReactNode }) {
  const [campus, setCampus] = useState<CampusFilter>(() => {
    const saved = localStorage.getItem(KEY);
    return saved === 'HSC' || saved === 'HSN' ? saved : 'ALL';
  });

  useEffect(() => {
    localStorage.setItem(KEY, campus);
  }, [campus]);

  const value: CampusContextValue = {
    campus,
    setCampus,
    campusFilter: campus === 'ALL' ? undefined : campus
  };

  return <CampusContext.Provider value={value}>{children}</CampusContext.Provider>;
}

export function useCampus(): CampusContextValue {
  const ctx = useContext(CampusContext);
  if (!ctx) throw new Error('useCampus must be used inside CampusProvider');
  return ctx;
}
