import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

import { DealCard } from './DealCard';
import type { DealView } from '@/types';

/**
 * Task 6 (expandida): em boards regidos por `motor`, o único write path de ESTADO é o
 * PortalActionPanel (ver DealDetailModal). O drag-and-drop do Kanban é OUTRO write path de
 * estado (muda `status`/stage) e precisa ficar bloqueado nesses boards — tanto pro
 * navegador nunca iniciar o drag (`draggable=false`) quanto por um guard no próprio
 * `handleDragStart` (defesa em profundidade: cobre disparo sintético do evento, que o
 * atributo HTML `draggable` sozinho não impede).
 */

const mockAddToast = vi.fn();
vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

function makeDeal(overrides: Partial<DealView> = {}): DealView {
  return {
    id: 'deal-1',
    title: 'Negócio Teste',
    value: 5000,
    status: 'stage-1',
    boardId: 'board-1',
    contactId: 'contact-1',
    contactName: 'Fulano',
    contactEmail: 'fulano@example.com',
    stageLabel: 'Novo',
    companyName: 'Empresa Teste',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    probability: 50,
    priority: 'medium',
    // 'Sem Dono' pula o branch do <Image> (next/image) — não mockado neste arquivo.
    owner: { name: 'Sem Dono', avatar: '' },
    tags: [],
    items: [],
    customFields: {},
    isWon: false,
    isLost: false,
    ...overrides,
  };
}

function renderCard(props: Partial<React.ComponentProps<typeof DealCard>> = {}) {
  const onDragStart = vi.fn();
  const onSelect = vi.fn();
  const setOpenMenuId = vi.fn();
  const onQuickAddActivity = vi.fn();
  const setLastMouseDownDealId = vi.fn();
  const deal = props.deal ?? makeDeal();

  const utils = render(
    <DealCard
      deal={deal}
      isRotting={false}
      activityStatus="gray"
      isDragging={false}
      onDragStart={onDragStart}
      onSelect={onSelect}
      isMenuOpen={false}
      setOpenMenuId={setOpenMenuId}
      onQuickAddActivity={onQuickAddActivity}
      setLastMouseDownDealId={setLastMouseDownDealId}
      {...props}
    />
  );

  const card = utils.container.querySelector(`[data-deal-id="${deal.id}"]`) as HTMLElement;
  return { ...utils, card, onDragStart, deal };
}

describe('DealCard — gating de drag em board de motor', () => {
  beforeEach(() => {
    mockAddToast.mockClear();
  });

  it('board humano (isMotor=false): draggable=true e o drag funciona normalmente', () => {
    const { card, onDragStart } = renderCard({ isMotor: false });

    expect(card.getAttribute('draggable')).toBe('true');

    const setData = vi.fn();
    const notPrevented = fireEvent.dragStart(card, {
      dataTransfer: { setData, effectAllowed: '' },
    });

    // dispatchEvent retorna true quando preventDefault() NÃO foi chamado.
    expect(notPrevented).toBe(true);
    expect(setData).toHaveBeenCalledWith('dealId', 'deal-1');
    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(onDragStart).toHaveBeenCalledWith(expect.anything(), 'deal-1', 'Negócio Teste');
    expect(mockAddToast).not.toHaveBeenCalled();
    // Entrou no estado visual de "arrastando" (localDragging=true).
    expect(card.className).toContain('scale-95');
  });

  it('board de motor (isMotor=true): card fica non-draggable (draggable=false)', () => {
    const { card } = renderCard({ isMotor: true });
    expect(card.getAttribute('draggable')).toBe('false');
  });

  it('board de motor: uma tentativa de drag é bloqueada — não propaga onDragStart, previne o evento e mostra toast', () => {
    const { card, onDragStart } = renderCard({ isMotor: true });

    const setData = vi.fn();
    // Dispara o evento diretamente (bypass do atributo `draggable`) — simula o pior caso
    // (disparo sintético/futura regressão) e prova que o guard em `handleDragStart` também
    // bloqueia, não só o atributo HTML.
    const notPrevented = fireEvent.dragStart(card, {
      dataTransfer: { setData, effectAllowed: '' },
    });

    // dispatchEvent retorna false quando preventDefault() FOI chamado.
    expect(notPrevented).toBe(false);
    expect(setData).not.toHaveBeenCalled();
    expect(onDragStart).not.toHaveBeenCalled();
    expect(mockAddToast).toHaveBeenCalledTimes(1);
    expect(mockAddToast).toHaveBeenCalledWith(
      'Funil de motor: a etapa muda pelo registro de ação — abra a ficha.',
      'info'
    );
    // Nunca entrou no estado visual de "arrastando" (localDragging nunca virou true).
    expect(card.className).not.toContain('scale-95');
    expect(card.className).toContain('opacity-100');
  });

  it('board de motor: handleDragEnd não lança erro (no-op defensivo — drag nunca iniciou)', () => {
    const { card } = renderCard({ isMotor: true });
    expect(() => fireEvent.dragEnd(card)).not.toThrow();
    expect(card.className).not.toContain('scale-95');
  });

  it('deal com id temp- continua non-draggable em board humano (comportamento preexistente preservado)', () => {
    const { card } = renderCard({ isMotor: false, deal: makeDeal({ id: 'temp-123' }) });
    expect(card.getAttribute('draggable')).toBe('false');
  });
});
