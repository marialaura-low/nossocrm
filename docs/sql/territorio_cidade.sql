-- territorio_cidade — mapa derivado cidade->dono (para o inbound caça&pesca).
--
-- ONDE RODA: no PORTAL Macboot (Supabase cvqczrciitcteabvonmw), NÃO no Maré.
-- O Maré só LÊ esta tabela (read-only, anon) via lib/inbound/territorio.ts.
--
-- O QUE É: para cada cidade/UF, quem "é dono" da praça —
--   casa            = cidade de força-tarefa (Tiago/Simone) OU canal da casa dominante
--   responsavel_casa= Tiago/Simone, se for força-tarefa
--   rep_dominante   = top rep EXTERNO por pares de 2026 (fallback: nº de clientes)
--   disputado       = >=2 reps externos com pares_2026 cada >= 25% do líder (só atividade 2026)
--   escritorios     = reps externos rankeados [{escritorio, pares_2026, clientes}]
--   fonte           = 'forca_tarefa' | 'faturamento' | 'ambos'
--
-- Sinaliza, NÃO bloqueia — rep segue segurado nesta fase (decisão #7 do spec).
--
-- CASA / NÃO-TERRITÓRIO (fora de "rep externo dono"): canais internos abaixo.
--   B2B SIM entra aqui = canal B2B da casa (Tiago), não rep externo.
--   Se essa classificação mudar, editar a lista `house` e rerodar a carga.
--
-- REFRESH: rerodar o bloco "CARGA" (idempotente: TRUNCATE + rebuild).
--   Follow-up: automatizar mensal (padrão despfix probe->loader).

-- ============ DDL (uma vez) ============
CREATE TABLE IF NOT EXISTS public.territorio_cidade (
  cidade           text NOT NULL,
  uf               text NOT NULL,
  casa             boolean NOT NULL DEFAULT false,
  responsavel_casa text,
  rep_dominante    text,
  disputado        boolean NOT NULL DEFAULT false,
  escritorios      jsonb NOT NULL DEFAULT '[]'::jsonb,
  fonte            text NOT NULL,
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cidade, uf)
);

ALTER TABLE public.territorio_cidade ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS territorio_cidade_read ON public.territorio_cidade;
CREATE POLICY territorio_cidade_read ON public.territorio_cidade
  FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.territorio_cidade TO anon, authenticated;

-- ============ CARGA (idempotente — rerodar pra refrescar) ============
TRUNCATE public.territorio_cidade;

WITH house(escritorio) AS (VALUES
  ('ADMIN'),('SAC'),('E-COMMERCE'),('MACBOOT'),('EXPORTAÇÃO MACBOOT'),
  ('REP GO REPRESENTACAO COMERCIAL LTDA'),('B2B SIM')
),
base AS (
  SELECT btrim(regexp_replace(f.cidade,'\s+',' ','g')) AS cidade,
         btrim(f.uf) AS uf,
         f.escritorio,
         COALESCE(SUM(f.quantidade) FILTER (WHERE f.ano=2026),0) AS pares_2026,
         COUNT(DISTINCT f.cnpj) AS clientes
  FROM faturamento f
  WHERE f.cidade IS NOT NULL AND btrim(f.cidade)<>''
    AND f.uf IS NOT NULL AND btrim(f.uf)<>''
    AND f.escritorio IS NOT NULL AND btrim(f.escritorio)<>''
  GROUP BY 1,2,3
),
ext AS (
  SELECT b.*, row_number() OVER (PARTITION BY cidade,uf ORDER BY pares_2026 DESC, clientes DESC) AS ern
  FROM base b WHERE b.escritorio NOT IN (SELECT escritorio FROM house)
),
top_geral AS (
  SELECT DISTINCT ON (cidade,uf) cidade,uf,escritorio AS top_esc
  FROM base ORDER BY cidade,uf,pares_2026 DESC, clientes DESC
),
city AS (SELECT DISTINCT cidade,uf FROM base),
agg AS (
  SELECT c.cidade,c.uf,
    (SELECT jsonb_agg(jsonb_build_object('escritorio',e.escritorio,'pares_2026',e.pares_2026,'clientes',e.clientes) ORDER BY e.pares_2026 DESC, e.clientes DESC)
       FROM ext e WHERE e.cidade=c.cidade AND e.uf=c.uf) AS escritorios,
    (SELECT e.escritorio FROM ext e WHERE e.cidade=c.cidade AND e.uf=c.uf AND e.ern=1) AS rep_dominante,
    (SELECT (count(*) FILTER (WHERE e.pares_2026>0 AND e.pares_2026 >= 0.25*ld.pares) >= 2)
       FROM ext e CROSS JOIN (SELECT pares_2026 AS pares FROM ext WHERE cidade=c.cidade AND uf=c.uf AND ern=1) ld
       WHERE e.cidade=c.cidade AND e.uf=c.uf) AS disputado,
    (SELECT top_esc FROM top_geral t WHERE t.cidade=c.cidade AND t.uf=c.uf) AS top_esc
  FROM city c
)
INSERT INTO public.territorio_cidade (cidade,uf,casa,responsavel_casa,rep_dominante,disputado,escritorios,fonte)
SELECT
  COALESCE(a.cidade, btrim(regexp_replace(ftc.cidade,'\s+',' ','g'))),
  COALESCE(a.uf, btrim(ftc.uf)),
  (ftc.cidade IS NOT NULL OR a.top_esc IN (SELECT escritorio FROM house)),
  ftc.responsavel,
  a.rep_dominante,
  COALESCE(a.disputado,false),
  COALESCE(a.escritorios,'[]'::jsonb),
  CASE WHEN ftc.cidade IS NOT NULL AND a.cidade IS NOT NULL THEN 'ambos'
       WHEN ftc.cidade IS NOT NULL THEN 'forca_tarefa'
       ELSE 'faturamento' END
FROM agg a
FULL OUTER JOIN forca_tarefa_cidade ftc
  ON btrim(regexp_replace(ftc.cidade,'\s+',' ','g'))=a.cidade AND btrim(ftc.uf)=a.uf;
