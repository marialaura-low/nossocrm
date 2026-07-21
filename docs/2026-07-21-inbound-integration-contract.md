# Contrato de Integração — Inbound Caça&Pesca (webhook do lead)

> Para QUALQUER automação de WhatsApp (GPT Maker, n8n, Make, ou o stack do Gabriel).
> O CRM (Maré) não se importa com qual ferramenta chama — só com o contrato abaixo.

## Endpoint

```
POST  https://<host-do-mare>/api/inbound/lead
Header:  x-internal-secret: <INTERNAL_API_SECRET>
         content-type: application/json
```

O `INTERNAL_API_SECRET` está no ambiente do Maré (e no 1Password vault Una). **Nunca** colocar em repo, chat ou na config exportável do bot em texto claro — usar o cofre da ferramenta.

## Corpo (JSON) — o lead JÁ qualificado

```json
{
  "nomeLoja":        "Pesca Sul",
  "cidade":          "Goiânia",
  "uf":              "GO",
  "cnpj":            "12345678000199",   // 14 dígitos (com ou sem pontuação; a gente limpa)
  "sortimento":      "caça e pesca",     // resposta livre
  "marcas":          "Nautika, Albatroz",// marcas que já trabalha (texto livre)
  "contatoNome":     "Zé",
  "contatoWhatsapp": "5562999990000",
  "transcript":      "conversa inteira do bot com o lead",
  "adReferral":      "campanha/criativo que trouxe (referral do CTWA) — ou null"
}
```

Obrigatórios pra criar o card: **`cnpj` (14 díg) + `nomeLoja`**. Faltou → HTTP 400 (não cria nada).

## Resposta

- `200 { "ok": true, "dealId": "<uuid>" }` — card criado no board **Inbound Caça&Pesca**, estágio **Pré-qualificado**.
- `401` — secret errado/ausente. `400` — payload inválido. `500` — board/estágio ausente ou erro de escrita.

## O que a AUTOMAÇÃO tem que fazer ANTES de chamar (nossa parte não faz)

1. **Separar loja × consumidor na entrada.** Consumidor → redireciona pro e-commerce e **NÃO** chama este webhook (o comercial não vê consumidor).
2. **As 3 perguntas-gate:** (loja+cidade/UF) · (sortimento + marcas) · (CNPJ). Máx 5 perguntas, começa com 3.
3. **NUNCA perguntar volume/pedido mínimo.** O porte é inferido do nosso lado (pelo CNPJ). Pergunta de volume mata conversão.
4. Só chamar o webhook quando tiver **cidade/UF + CNPJ**.

## O que o CRM faz ao receber (você não precisa fazer)

- Enriquece o CNPJ (BrasilAPI) → porte + fit de sortimento (discreto).
- Cruza conflito **já-cliente** contra a `faturamento` do portal (read-only) → tag `conflito` + escritório no card.
- Cria o card com transcrição + `adReferral` + porte + conflito nos `custom_fields`.

## ⚠️ REQUISITO INEGOCIÁVEL — anti-ban

Este funil recebe **tráfego pago frio** (gente que nunca falou com o número). Isso é diferente do WhatsApp de e-commerce (onde quem chama já é cliente). Por isso:

- A conexão de WhatsApp da automação **TEM que ser API OFICIAL** (WhatsApp Business Cloud API). API não-oficial (Baileys / Z-API / QR-code estilo WhatsApp Web) **não serve** pra tráfego frio de volume — é ban na certa (já queimou 2x o número pessoal da Low).
- **Não usar o número do e-commerce.** Número dedicado pra este funil — se der problema, não derruba a operação do e-commerce junto.
- A ferramenta de automação (n8n, Make, etc.) pode ser a mesma que o Gabriel já usa — o que precisa mudar é a **peça de CONEXÃO**: trocar o conector não-oficial por um nó/BSP de **Cloud API oficial**. A lógica/fluxo dele pode ser reaproveitada.

> Em resumo: **a ferramenta é livre; a conexão oficial e o número dedicado não são.**

---
*Criado: 2026-07-21 — sessão CLI Zuca. Ref: `docs/2026-07-20-inbound-caca-pesca-*.md` (spec + plano).*
