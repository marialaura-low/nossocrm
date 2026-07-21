-- Board de inbound (lojistas caça&pesca). regido_por='humano' (Tiago/Simone
-- operam manual, ao contrário dos boards de portal que são 'motor').
DO $$
DECLARE
  v_org   UUID := '171ea789-b0e9-43fa-8e24-ca685057b617';
  v_owner UUID := 'c08dbd94-14ef-42fe-97f4-500dee3628b0';
  v_board UUID;
BEGIN
  INSERT INTO public.boards (key, name, description, type, regido_por, position, organization_id, owner_id)
  VALUES ('inbound-caca-pesca', 'Inbound Caça&Pesca',
          'Aquisição de lojista via tráfego pago. Bot qualifica no GPT Maker.',
          'SALES', 'humano', 100, v_org, v_owner)
  ON CONFLICT (organization_id, key) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_board;

  IF v_board IS NULL THEN
    SELECT id INTO v_board FROM public.boards
      WHERE organization_id = v_org AND key = 'inbound-caca-pesca';
  END IF;

  -- 5 estágios (idempotente por board+name)
  INSERT INTO public.board_stages (board_id, name, "order", color, organization_id)
  VALUES
    (v_board, 'Novo (bot)',      0, '#9ca3af', v_org),
    (v_board, 'Pré-qualificado', 1, '#2f7a4d', v_org),
    (v_board, 'Com o Closer',    2, '#07432a', v_org),
    (v_board, 'Ganho',           3, '#16a34a', v_org),
    (v_board, 'Perdido',         4, '#dc2626', v_org)
  ON CONFLICT DO NOTHING;
END $$;
