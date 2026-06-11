# 🔧 OficinaOS

Sistema de **Ordens de Serviço, orçamentos e estoque** para oficinas mecânicas (radiador, intercooler, ar-condicionado e geral). Feito pra dono de oficina que hoje controla tudo em caderno e WhatsApp.

## O que faz

- **Ordens de Serviço** com fluxo: Orçamento → Aprovada → Em execução → Pronta → Entregue
- **Orçamento com link público** — manda pro cliente direto no WhatsApp, ele abre sem login e imprime/salva PDF
- **Estoque de peças** com alerta de mínimo e **baixa automática** quando o orçamento é aprovado
- **Clientes** com histórico de OS
- **Painel** com faturamento do mês e OS por status

## Stack

- Backend: Node.js + Express + SQLite (better-sqlite3) + JWT
- Frontend: React + Vite + React Router
- Um deploy só: o Express serve a API e o frontend buildado

## Rodar local

```bash
npm install          # instala backend + client (postinstall)
npm run build        # builda o frontend
npm start            # sobe em http://localhost:3000
```

Dev com hot-reload: `node server.js` num terminal + `cd client && npm run dev` noutro (Vite proxy pra :3000).

## Variáveis de ambiente (produção)

| Var | Default | Obs |
|-----|---------|-----|
| `PORT` | 3000 | porta do servidor |
| `JWT_SECRET` | dev | **OBRIGATÓRIO trocar em produção** |
| `DB_PATH` | ./data/oficina.db | apontar pra disco persistente no deploy |

## Modelo de negócio

Micro-SaaS por assinatura: **R$49-79/mês por oficina**. Multi-tenant por conta (cada oficina cadastra a sua). Venda direta: rede de oficinas do nicho radiador/intercooler, indicação entre mecânicos.

---

*"Toda obra do diligente certamente prospera." — Provérbios 13:4*
