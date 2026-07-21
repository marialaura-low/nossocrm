# Inbound Caça&Pesca — Bot de pré-qualificação WhatsApp + CRM (Maré)

> Spec de design · 2026-07-20 · sessão CLI Zuca × Low
> Projeto: Grupo MAC / Macboot Comercial · Macboot cliente-zero
> Status: 🟡 desenho aprovado seção-a-seção pela Low · aguarda revisão do spec antes do plano de implementação

---

## Contexto e objetivo

Macboot vai ligar **campanha de tráfego pago** mirando o nicho **caça e pesca**. O objetivo NÃO é venda direta a consumidor — é **aquisição de lojista B2B** (abrir conta nova de varejo). O inbound precisa de:

1. **CRM pronto pra receber lead frio** — hoje o Maré só tem funis de carteira existente (Pós-venda / Reativação); falta funil de **inbound/lead novo**.
2. **Bot de WhatsApp** que faz **pré-qualificação** boa e roteia pro comercial interno.
3. **Roteamento** pro Closer (Tiago/Simone) — **sem** mandar pro representante nesta primeira fase.

Requisito estrutural da Low: a operação de WhatsApp tem que ser **reutilizável no SAC** depois, sem assinar mais plataformas. E **anti-ban de verdade** — o número não pode cair.

---

## Decisões travadas (com quem decidiu)

| # | Decisão | Quem | Data |
|---|---------|------|------|
| 1 | Público do inbound = **B2B, lojas de caça e pesca** (não consumidor) | Low | 20/07 |
| 2 | Gate de qualificação = **CNPJ ativo + cidade/UF + fit de sortimento**; **porte NÃO se pergunta cru** (inferido, discreto) | Low | 20/07 |
| 3 | Conflito (já é cliente / território com rep) = **detecta e sinaliza, não bloqueia** | Low | 20/07 |
| 4 | Motor do bot = **GPT Maker na API Oficial** (agente de IA conversacional, com handoff nativo) — OpenClaw é passivo no WhatsApp, não serve | Low | 20/07 |
| 5 | Engine escolhido após **verificação do curso EA + histórico da Low**: GPT Maker (SaaS, **reutilizável no SAC** — módulo 6 do curso cobre suporte). Chatwoot self-hosted **descartado** (era reinventar a roda; ver §Verificação) | Low | 20/07 |
| 5b | **Anti-ban de verdade = API OFICIAL, não Z-API/Baileys.** O "token que vivia caindo" no SAC antigo era o **Z-API não-oficial** por baixo do GPT Maker — a causa raiz sempre foi a conexão não-oficial (idem Evolution 2x) | Zuca/Low | 20/07 |
| 6 | Split Tiago/Simone = **fila comum** (pega quem está livre) | Low | 20/07 |
| 7 | **Não mandar pro representante nesta fase** — segura o lead em casa (controle do canal + munição pra reunião reps 24/07). Estágio "Rep" existe no board, desligado | Low | 20/07 |
| 8 | Número: **decidir na hora do go-live** (novo dedicado vs migrar o comercial) | Low | 20/07 |

---

## Por que anti-ban = API oficial (inegociável)

Toda dor de WhatsApp da Low teve a MESMA causa raiz: **API não-oficial.** O SAC antigo (GPT Maker via **Z-API**) tinha "token caindo" = Z-API não-oficial. O pipeline atual (Evolution/**Baileys**, número pessoal) restringiu a conta 2x. Não-oficial = conexão instável / risco de ban. Para **outbound conversacional com lead frio de anúncio**, só a **Meta WhatsApp Cloud API (oficial)** não bane conversa legítima de empresa. Detalhe que trabalha a favor: anúncio **Click-to-WhatsApp (CTWA)** faz o lead mandar a 1ª mensagem → abre **janela de 24h** → o bot conversa livre **sem template aprovado**. Caminho compliant e barato.

Referências de mercado (2026): ≤5 perguntas (começa com 3), confirmar a promessa do anúncio em segundos, handoff com transcrição + contexto do anúncio, CAPI de volta pra Meta otimizar verba.

## Verificação contra o curso Escola de Automação (20/07)

A Low pediu pra bater o martelo dentro do curso. Varredura logada (Circle):

- **Fundação 100% validada.** Curso "API Oficial do Whatsapp" (7 módulos) confirma: API oficial é o caminho anti-ban (módulo 6 "Como não ser bloqueado"), **sessão de 24h** (4.1), verificação de BM como gargalo (módulo 3). Nosso alicerce está certo.
- **Engine corrigido (Chatwoot → GPT Maker).** O curso ensina motor **SaaS** na API oficial, não self-host. Cruzando com o histórico da Low (GPT Maker/Z-API já usado no SAC; "quero ser dona da solução" empurrou repetidamente pra DIY não-oficial que quebrava), a conclusão honesta: **Chatwoot self-hosted era reinventar a roda.** GPT Maker na API oficial resolve o trauma na raiz (tira o Z-API) e é suportado passo-a-passo.
- **GPT Maker × Zaia (ambos no curso):** GPT Maker (78 aulas) cobre nosso fluxo osso a osso — SDR qualifica + **encaminha pro atendimento** (4.2), handoff com resumo/sentimento (6.11), **API oficial sem ban** (5.13), **CRM via API** (5.6–5.10, mesmo padrão de escrever no Maré) e **SAC inteiro** (módulo 6, 25 aulas = o reuso que a Low quer). Zaia (35 aulas) é mais enxuto, frameworks de venda mais ricos (Challenger/MEDDIC), mas raso em CRM/SAC. **Escolhido: GPT Maker.**

---

## Arquitetura

```
Anúncio Click-to-WhatsApp (Meta) — criativo/promessa = Marina/Mkt
   │  lead manda 1ª msg → janela 24h aberta (sem template)
   ▼
Meta WhatsApp Cloud API (OFICIAL = anti-ban)   ← número (decisão #8)
   ▼
GPT Maker (SaaS, agente de IA na API oficial)  ← bot + caixa de atendimento + handoff
   │   ├─ Agente: roteiro ≤5 perguntas, infere porte discreto (treino por texto/docs)
   │   └─ qualificou → transfere pra humano (fila comum Tiago/Simone) c/ resumo da conversa
   ▼
Integração (API/webhook) → Maré (Supabase utkmwgdydggzmyqksnql), board "Inbound Caça&Pesca"
   │   cruza conflito (read-only) contra portal Macboot (cvqczrciitcteabvonmw)
   ▼
[Fase 2] CAPI → devolve "lead qualificado" pra Meta otimizar a campanha
```

**Reuso SAC (futuro):** mesma conta GPT Maker, novo agente de suporte (o curso ensina no módulo 6). Sem plataforma nova.

**Dois Supabases — regra dura:** o bot **escreve** no Maré; a checagem de conflito só **lê** o portal. Nunca rodar carga no banco errado.

---

## Funil — board "Inbound Caça&Pesca" (Maré)

| # | Estágio | O que é |
|---|---------|---------|
| 1 | **Novo (bot)** | Lead entrou pelo anúncio, bot conversando |
| 2 | **Pré-qualificado** | Passou o gate; bot terminou; aguarda humano |
| 3 | **Com o Closer** | Tiago/Simone fecham o 1º pedido, internamente |
| 4 | **Ganho** / **Perdido** | Fechou / descartado |
| — | **Descartado-consumidor** | Não é loja → redireciona pro e-commerce, não vai pro comercial |
| — | *(Passar pro Rep)* | Existe no board, **DESLIGADO** nesta fase (liga quando decidir abrir território) |

Tag **⚠ Conflito**: já é cliente Macboot OU território com rep ativo → sinaliza no card com a nota; **não bloqueia**. Função nesta fase: Tiago/Simone SABEM que estão em território de rep e tocam com diplomacia (munição p/ reunião 24/07).

Nomenclatura por **papel** (Pré-venda/Closer), não por pessoa — o board sobrevive a mudança de time e serve o SAC depois.

---

## Roteiro do bot (agente GPT Maker)

Princípio: ≤5 perguntas, começa com 3, confirma a promessa do anúncio em segundos, **nunca pergunta-barreira de volume**.

- **Entrada (instantânea — confirma o anúncio + separa loja de consumidor):**
  *"Oi! Você chegou pela Macboot — [promessa do anúncio: linha outdoor caça/pesca, preço de fábrica pro lojista]. Você tem loja / revende, ou é pra uso próprio?"*
  - **consumidor** → redireciona pro e-commerce, marca **Descartado-consumidor**, não incomoda o comercial.
  - **lojista** → segue.
- **P1 (gate: loja + cidade/UF):** *"Show. Qual o nome da sua loja e a cidade/UF?"*
- **P2 (gate: fit + porte inferido):** *"O que sua loja mais vende hoje — caça e pesca, agro, outdoor, calçado? E trabalha com quais marcas?"* → fit + marcas revelam porte/posicionamento **sem perguntar volume**.
- **P3 (gate: loja real + porte inferido):** *"Pra montar teu cadastro de lojista, me passa o CNPJ?"* → confirma loja real; CNPJ permite puxar porte pela **base pública** (BrasilAPI/Receita: nº de filiais, capital, CNAE que confirma o fit, tempo de mercado).

**Gate pra virar "Pré-qualificado":** CNPJ ativo + cidade/UF + fit de sortimento. **Porte não barra** — é sinal no card. Falta CNPJ ou é claramente consumidor → não passa.

---

## Roteamento e handoff

Ao passar o gate, automático:
1. Monta o card no Maré (Inbound / Pré-qualificado) com dados + **transcrição** + **qual anúncio trouxe** (`referral` do payload CTWA).
2. **Cruza conflito** (read-only): carteira Macboot (já é cliente?) + território de rep (tem rep ativo?). Bateu → tag ⚠ Conflito + nota.
3. GPT Maker **transfere pra humano** → **fila comum** Tiago/Simone com a conversa inteira (resumo/sentimento).
4. Humano fecha em casa → move o card → **Ganho**. (Rep desligado nesta fase.)

---

## Fases

- **Fase 0 — começa já (não depende da Meta):** board Inbound no Maré + roteiro/treino do agente GPT Maker + lógica de conflito, provado em **simulação com dado sintético rotulado** (web chat do GPT Maker antes do número entrar).
- **Fase 1:** conta GPT Maker + **API Oficial** no número + verificação de BM (o gargalo — iniciar cedo; decisão #8). O curso "API Oficial do Whatsapp" é o passo-a-passo.
- **Fase 2:** liga anúncio CTWA + **CAPI** de volta pra Meta.
- **SAC (futuro):** mesma conta GPT Maker, agente de suporte (curso módulo 6).

---

## Riscos e guardrails

- **Ban:** só API oficial. Nunca outbound frio por Evolution/Baileys. [[feedback_whatsapp_pessoal_nao_automatizar]]
- **Número comercial migrado sai do app do celular** — na API oficial, quem atende passa a trabalhar dentro do GPT Maker, não no WhatsApp do telefone. Alinhar com Tiago/Simone antes (ou usar número novo dedicado).
- **Governança de rep:** conflito sinaliza, não bloqueia; segurar rep é decisão consciente da Low, revisitável na reunião 24/07.
- **Isolamento de carga:** GPT Maker é SaaS (não toca nosso banco). A integração que **escreve no Maré** é throttled/idempotente; a leitura do portal é read-only. Nada de repetir o incidente 08/07 (carga de terceiro derrubou produção).
- **Dado na nuvem do GPT Maker (SaaS):** lead de lojista caça&pesca = baixa sensibilidade. Conteúdo sensível (financeiro/Sônia, família) **NÃO passa por esse canal** — fica no pipeline separado do número pessoal.
- **Dado sintético sempre rotulado** em teste. [[feedback_rotular_dado_sintetico]]
- **Segredos** (token Cloud API, chaves) fora do git → 1Password vault Una. [[feedback_secrets_to_1password_vault_una]]

---

## Fora de escopo (YAGNI nesta fase)

- Mandar lead pro representante (parado por decisão #7).
- Venda B2C / e-commerce dentro do bot (consumidor só é redirecionado).
- Campanhas de disparo ativo (template outbound) — só inbound CTWA por ora.
- SAC completo — só se garante que o GPT Maker o comporta (módulo 6 do curso confirma que sim).

---

## Divisão de responsabilidade

- **Nós (Zuca/Zaya):** configurar e treinar o agente GPT Maker, funil Maré, lógica de conflito, integração GPT Maker ↔ Maré.
- **Marina/Mkt:** criativo do anúncio, conta Meta Business/BM, pixel/CAPI, promessa que o bot confirma na entrada.
- **Low:** decisão do número (#8), plano/custo do GPT Maker, alinhamento com Tiago/Simone, quando/se abrir pro rep.

---

*Relacionado: [[project_nossocrm_curso_ea]] · nossocrm-crm-calcadista.md · whatsapp-inteligencia-empresa.md · sac-macboot.md · [[reference_cliente_matriz_vs_cnpj]]*
