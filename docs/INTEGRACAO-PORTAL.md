# Integração Macboot CRM ↔ Portal dos Representantes — Proposta

> Documento de decisão para a Low. Escrito pela Zuca na sessão noturna de 06→07/07/2026.
> NÃO é execução — é o mapa pra você aprovar a direção acordada.

## TL;DR (a decisão que importa)

Você tem duas coisas que se completam:
- **Portal dos representantes** (`portal.macboot.com.br`, Supabase `cvqcz…`): o **miolo** — dado real vivo (sell_in, faturamento, clientes, lojas, carteira), a segmentação, o **motor de funil** ("funil é dado") e a **camada semântica** (`fechamento_comercial`, `supa_fetch`, `CONTRATO-DADOS.md`). Acesso do rep por **token**.
- **Macboot CRM** (este projeto, Supabase `utkmwg…`): a **casca de produto** — UI rica (Kanban, contatos, empresas, atividades, mensageria/WhatsApp, assistente de IA, relatórios), **multiusuário** (convites, papéis, RLS), instalável como app (PWA).

**Recomendação:** o Macboot CRM vira o **front-end único** do produto. O portal vira o **backend de dados e regras** (fonte de verdade). Não se duplica a base — o CRM **lê os sinais comerciais do portal** e o **motor de funil** (portado do portal) abre/move os negócios no Kanban automaticamente. Rep entra com **usuário e senha** (nativo do CRM), cada um dono da sua carteira (o gancho `source=portal-rep:<escritório>` já está gravado nos 4.726 contatos).

Isso NÃO é "copiar um no outro". É definir **quem é fonte de verdade de cada coisa** e o **fluxo entre eles**.

---

## As duas pontas, lado a lado

| Dimensão | Portal (miolo) | Macboot CRM (casca) |
|---|---|---|
| Dado comercial vivo (sell_in, faturamento) | ✅ fonte, atualizado pela Low | ❌ (precisa ler do portal) |
| Clientes/lojas/carteira | ✅ 1.433 / 4.726 / 2.071 | 📥 cópia carregada hoje (1.886 / 4.726) |
| Segmentação (modelo_negócio, nicho) | ✅ régua definida | 📥 virou tag + setor |
| Motor de funil (abre/move por gatilho) | ✅ "funil é dado", regras Macboot | ❌ Kanban manual (arrasta card) |
| Camada semântica única (`fechamento_comercial`) | ✅ contrato de dados | ❌ |
| UI/UX rica (ficha, atividades, relatórios) | 🟡 admin + rota do rep | ✅ produto completo |
| Multiusuário (login por pessoa, papéis, RLS) | ❌ token por rep | ✅ nativo (convites) |
| Mensageria/WhatsApp + IA | ❌ | ✅ nativo |
| App mobile | 🟡 web | ✅ PWA instalável |

**Leitura:** cada um é forte onde o outro é fraco. O portal sabe o que é verdade sobre o negócio; o CRM sabe apresentar e operar. Juntar = vertical calçadista de verdade.

---

## O nó central: fonte de verdade do dado

O sell_in e o faturamento **vivem no portal** (`cvqcz`) e mudam toda semana (você sobe o XLS). O funil só tem valor se ele reage a esse dado (reposição pendente, pedido na casa, virada de coleção). Então o CRM **depende** desse sinal. Três caminhos:

**Opção A — CRM lê o portal (recomendada).**
O Macboot CRM consome a camada semântica do portal (`fechamento_comercial`, `sell_in`, `faturamento` via `supa_fetch`/views) por API. Um job diário no CRM traduz os sinais em negócios: reposição pendente → card em "Giro & reposição"; pedido na casa → não abre reativação; etc.
- ✅ Não duplica dado; respeita a fonte única que você já construiu; o motor de funil é portado uma vez.
- ⚠️ Acopla o CRM ao Supabase do portal (dois projetos conversando) — resolvível com uma chave de leitura dedicada.

**Opção B — Base unificada (fundir os dois Supabase num só).**
Migra tudo pra um projeto só.
- ✅ Arquitetura mais limpa a longo prazo (um banco, um RLS).
- ⚠️ Migração grande e arriscada; joga fora a estabilidade do portal em produção; trava a operação viva durante a fusão. **Não recomendo agora** — talvez quando o produto amadurecer.

**Opção C — Sync one-way (portal → CRM) por cópia diária.**
Um ETL diário replica dado do portal pro CRM (foi o que fiz hoje, manual).
- ✅ Simples, desacoplado.
- ⚠️ Dado sempre "de ontem"; duplicação; dois lugares pra segmentação divergir. Bom pra piloto, ruim pra produto.

**→ Recomendo A.** Fonte única de dado no portal, CRM como cabeça de operação e apresentação. C serve de ponte enquanto A não está pronto.

---

## Rep: token vs usuário/senha

Você disse que vai criar usuário+senha por rep. O CRM já suporta isso nativo (convites → rep define senha → papel `user`). O gancho está pronto: cada contato tem `source=portal-rep:<escritório>`, então atribuir a carteira ao dono é **um UPDATE** por rep quando o usuário existir.

Decisão a tomar: **quem enxerga o quê.** No CRM, por padrão todo usuário da org vê tudo. Pra cada rep ver só a sua carteira, precisa de RLS por `owner_id`/escritório (o CRM tem RLS por organização; falta a camada por rep). Isso é trabalho de config — não trivial, mas mapeado. Alternativa intermediária: gestão (você/Tiago/Simone) com visão total; reps num segundo momento.

---

## Plano faseado (proposta)

**Fase 0 — piloto vivo (já em pé hoje):** carteiras carregadas + marca Macboot. Você navega, valida a UX com dado real. *Feito.*

**Fase 1 — funil com sinal real:** portar as regras do portal (reposição/pedido na casa/coleção) pra um job que popula os negócios do CRM. O Kanban ganha vida. Fonte = camada semântica do portal (Opção A ou ponte C).

**Fase 2 — acesso por rep:** criar usuários, atribuir carteira por `source`, ligar RLS por rep. Gestão primeiro, reps depois.

**Fase 3 — consolidar fonte de verdade:** decidir A definitivo (CRM lê portal) e aposentar a duplicação. Mensageria/WhatsApp e IA entram como diferencial.

**Fase 4 — produtizar (Labra):** multi-tenant real (cada calçadista = uma org), a camada configurável (cadência + nomes de funil + marca) vira tela de setup. Macboot = cliente zero validado.

---

## O que eu NÃO fiz (de propósito)

- Não apontei o CRM pro banco do portal nem fundi bases — é decisão sua e mexe em produção.
- Não criei usuários de rep — precisa de senha (sua) e da decisão de RLS.
- Não portei o motor de funil ainda — Fase 1, com você definindo os gatilhos.

## Primeira pergunta pra destravar a Fase 1

Você quer o funil rodando por **Opção A** (CRM lê o portal ao vivo — mais trabalho, produto de verdade) ou começamos por **ponte C** (cópia diária — rápido, piloto) e evoluímos? Minha recomendação: **C pra ver funcionando essa semana, A como destino.**

---
*Zuca — 07/07/2026. Companion de `~/seiva/memory/projects/nossocrm-crm-calcadista.md`.*
