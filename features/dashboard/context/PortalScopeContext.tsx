'use client';

import React, { createContext, useContext, useMemo } from 'react';

/**
 * Escopo do dashboard-fusão: qual escritório está em foco (micro→macro) E qual período.
 * `escritorio = null` → macro (gestão vê a soma); preenchido → micro (a carteira de 1).
 * `inicio/fim` = janela do filtro de período; os cards da fusão leem daqui via
 * usePortalMetricas (fallback), sem prop drilling — um cálculo, um escopo. `periodoLabel`
 * é o rótulo humano ("Este Mês", "Este Ano") pros subtítulos dos cards.
 */
export interface PortalScope {
  escritorio: string | null;
  inicio?: string;
  fim?: string;
  periodoLabel?: string;
}

const PortalScopeContext = createContext<PortalScope>({ escritorio: null });

export const PortalScopeProvider: React.FC<{
  escritorio: string | null;
  inicio?: string;
  fim?: string;
  periodoLabel?: string;
  children: React.ReactNode;
}> = ({ escritorio, inicio, fim, periodoLabel, children }) => {
  const value = useMemo(() => ({ escritorio, inicio, fim, periodoLabel }), [escritorio, inicio, fim, periodoLabel]);
  return <PortalScopeContext.Provider value={value}>{children}</PortalScopeContext.Provider>;
};

export const usePortalScope = (): PortalScope => useContext(PortalScopeContext);
