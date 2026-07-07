import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

import { DealDetailModal } from './DealDetailModal';
// Referências mockadas (via vi.mock abaixo) — usadas para configurar boards por teste
// e para verificar se o controle manual de estágio foi ou não renderizado.
import { useBoards } from '@/lib/query/hooks';
import { StageProgressBar } from '../StageProgressBar';

// Keep this test focused: we only want to ensure opening/closing the modal
// never crashes due to hook-order issues (React error #310).

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('@/hooks/useResponsiveMode', () => ({
  useResponsiveMode: () => ({ mode: 'desktop' }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    profile: { id: 'user-1', role: 'admin', email: 'test@example.com', organization_id: 'org-1' },
  }),
}));

vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({
    addToast: vi.fn(),
  }),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  // Return the deal fixture for DEALS_VIEW_KEY (identified by enabled:false in DealDetailModal)
  return {
    ...actual,
    useQuery: (options: { enabled?: boolean }) => {
      if (options.enabled === false) {
        return {
          data: [{
            id: 'deal-1',
            title: 'Pequeno Chapéu',
            value: 1000,
            status: 'stage-1',
            boardId: 'board-1',
            contactId: 'contact-1',
            companyName: 'Moreira Comércio',
            contactName: 'Fulano',
            contactEmail: 'fulano@example.com',
            stageLabel: 'Novo',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            probability: 50,
            priority: 'medium',
            owner: { name: 'Eu', avatar: '' },
            tags: [],
            items: [],
            customFields: {},
            isWon: false,
            isLost: false,
          }],
          isLoading: false,
        };
      }
      return { data: [], isLoading: false };
    },
    // PortalActionPanel (renderizado dentro do DealDetailModal em boards de motor) chama
    // useQueryClient() para invalidar DEALS_VIEW_KEY após um registro bem-sucedido.
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

vi.mock('@/lib/query/hooks', () => ({
  useMoveDealSimple: () => ({ moveDeal: vi.fn() }),
  useContacts: () => ({ data: [], isLoading: false }),
  useActivities: () => ({ data: [], isLoading: false }),
  // vi.fn() (não uma arrow function estática) para que cada teste configure os boards
  // via vi.mocked(useBoards).mockReturnValue(...) — necessário para os cenários motor/humano.
  useBoards: vi.fn(() => ({ data: [], isLoading: false })),
  useLifecycleStages: () => ({ data: [], isLoading: false }),
  useUpdateDeal: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteDeal: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useAddDealItem: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useRemoveDealItem: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useCreateActivity: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUpdateActivity: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteActivity: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/query/hooks/useProductsQuery', () => ({
  useActiveProducts: () => ({ data: [] }),
}));

vi.mock('@/store/uiState', () => ({
  useUIState: () => ({ activeBoardId: 'board-1' }),
}));

vi.mock('@/hooks/usePersistedState', () => ({
  usePersistedState: (_key: string, initial: unknown) => [initial, vi.fn()],
}));

vi.mock('@/lib/a11y', () => ({
  FocusTrap: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useFocusReturn: () => undefined,
}));

vi.mock('@/components/ConfirmModal', () => ({
  default: () => null,
}));

vi.mock('@/components/ui/LossReasonModal', () => ({
  LossReasonModal: () => null,
}));

vi.mock('../DealSheet', () => ({
  DealSheet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../StageProgressBar', () => ({
  // vi.fn() em vez de uma função estática: os novos testes verificam se este componente
  // foi ou não invocado, para confirmar que o controle manual de estágio some em boards
  // regidos por motor (a etapa muda pelo registro no PortalActionPanel, não pelo clique).
  StageProgressBar: vi.fn(() => null),
}));

vi.mock('@/features/activities/components/ActivityRow', () => ({
  ActivityRow: () => null,
}));

vi.mock('@/lib/ai/tasksClient', () => ({
  analyzeLead: vi.fn(),
  generateEmailDraft: vi.fn(),
  generateObjectionResponse: vi.fn(),
}));

vi.mock('@/features/deals/components/BriefingDrawer', () => ({
  BriefingDrawer: () => null,
}));

vi.mock('@/features/deals/components/AIExtractedFields', () => ({
  AIExtractedFields: () => null,
}));

vi.mock('@/context/CRMContext', () => ({
  useCRM: () => {
    const board = {
      id: 'board-1',
      name: 'Pipeline de Vendas',
      stages: [
        { id: 'stage-1', label: 'Novo', order: 0, linkedLifecycleStage: 'MQL' },
      ],
      wonStageId: null,
      lostStageId: null,
      wonStayInStage: false,
      lostStayInStage: false,
      defaultProductId: null,
      agentPersona: null,
      goal: null,
    };

    const deal = {
      id: 'deal-1',
      title: 'Pequeno Chapéu',
      value: 1000,
      status: 'stage-1',
      boardId: 'board-1',
      contactId: 'contact-1',
      companyName: 'Moreira Comércio',
      contactName: 'Fulano',
      contactEmail: 'fulano@example.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      probability: 50,
      tags: [],
      items: [],
      customFields: {},
      isWon: false,
      isLost: false,
      closedAt: undefined,
      lossReason: undefined,
    };

    return {
      deals: [deal],
      contacts: [{ id: 'contact-1', stage: null }],
      updateDeal: vi.fn(),
      deleteDeal: vi.fn(),
      activities: [],
      addActivity: vi.fn(),
      updateActivity: vi.fn(),
      deleteActivity: vi.fn(),
      products: [],
      addItemToDeal: vi.fn(),
      removeItemFromDeal: vi.fn(),
      customFieldDefinitions: [],
      activeBoard: board,
      boards: [board],
      lifecycleStages: [],
    };
  },
}));

// deal-1 (fixture do mock de @tanstack/react-query acima) pertence ao board-1 e está na
// etapa "stage-1" — os dois boards abaixo só variam em `regidoPor`.
const BOARD_STAGES = [{ id: 'stage-1', label: 'Novo', order: 0, linkedLifecycleStage: 'MQL' }];

const MOTOR_BOARD = {
  id: 'board-1',
  name: 'Pós-venda',
  regidoPor: 'motor' as const,
  stages: BOARD_STAGES,
  wonStageId: undefined,
  lostStageId: undefined,
  wonStayInStage: false,
  lostStayInStage: false,
};

const HUMANO_BOARD = {
  ...MOTOR_BOARD,
  name: 'Pipeline de Vendas',
  regidoPor: 'humano' as const,
};

describe('DealDetailModal', () => {
  beforeEach(() => {
    // Default: sem boards (mesmo comportamento que o arquivo tinha antes desta task).
    vi.mocked(useBoards).mockReturnValue({ data: [], isLoading: false } as ReturnType<typeof useBoards>);
    vi.mocked(StageProgressBar).mockClear();
  });

  it('does not crash when toggling open/close (hook order regression)', () => {
    const { rerender } = render(
      <DealDetailModal dealId="deal-1" isOpen={false} onClose={() => {}} />
    );

    expect(document.body.textContent).not.toContain('Application error');

    rerender(<DealDetailModal dealId="deal-1" isOpen={true} onClose={() => {}} />);
    expect(document.body.textContent).toContain('Pequeno Chapéu');

    rerender(<DealDetailModal dealId="deal-1" isOpen={false} onClose={() => {}} />);
    expect(document.body.textContent).not.toContain('Application error');
  });

  it('renderiza o painel Registrar ação e esconde o controle manual de estágio em board de motor', () => {
    vi.mocked(useBoards).mockReturnValue({ data: [MOTOR_BOARD], isLoading: false } as ReturnType<typeof useBoards>);

    render(<DealDetailModal dealId="deal-1" isOpen={true} onClose={() => {}} />);

    // Painel presente (título + as 3 ações rápidas + a ação "Perdido").
    expect(document.body.textContent).toContain('Registrar ação');
    expect(document.body.textContent).toContain('Falei — resolvido');
    expect(document.body.textContent).toContain('Falei — ficou pendência');
    expect(document.body.textContent).toContain('Não consegui contato');
    expect(document.body.textContent).toContain('Perdido');

    // Controle manual de estágio (StageProgressBar) NÃO foi renderizado.
    expect(StageProgressBar).not.toHaveBeenCalled();
  });

  it('NÃO renderiza o painel em board humano (kanban manual preservado)', () => {
    vi.mocked(useBoards).mockReturnValue({ data: [HUMANO_BOARD], isLoading: false } as ReturnType<typeof useBoards>);

    render(<DealDetailModal dealId="deal-1" isOpen={true} onClose={() => {}} />);

    expect(document.body.textContent).not.toContain('Registrar ação');

    // Controle manual de estágio segue disponível (comportamento inalterado).
    expect(StageProgressBar).toHaveBeenCalled();
  });
});


