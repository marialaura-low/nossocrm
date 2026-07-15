'use client';

import React, { createContext, useContext, useMemo } from 'react';

/**
 * Escopo do dashboard-fusão: qual escritório está em foco (micro→macro).
 * `escritorio = null` → macro (gestão vê a soma); preenchido → micro (a carteira de 1).
 * Os cards da fusão leem daqui via usePortalMetricas (fallback), sem prop drilling —
 * um cálculo, dois níveis. Casa com a Onda 2 (rep loga → cai no micro dele).
 */
export interface PortalScope {
  escritorio: string | null;
}

const PortalScopeContext = createContext<PortalScope>({ escritorio: null });

export const PortalScopeProvider: React.FC<{ escritorio: string | null; children: React.ReactNode }> = ({ escritorio, children }) => {
  const value = useMemo(() => ({ escritorio }), [escritorio]);
  return <PortalScopeContext.Provider value={value}>{children}</PortalScopeContext.Provider>;
};

export const usePortalScope = (): PortalScope => useContext(PortalScopeContext);
