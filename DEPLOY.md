# Deploy do OficinaOS — guia pronto pra quando precisar

> Status: projeto engavetado em 06/2026 (patrão recusou). MVP funcional e testado.
> Quando aparecer interessado, seguir este guia — 1h até estar no ar.

## 1. Repo no GitHub (PRIVADO — lembrar do incidente de 12/05)

```bash
# opção A — com GitHub CLI (instalar: winget install GitHub.cli)
gh auth login
cd C:\Users\phspi\oficina-os
gh repo create oficina-os --private --source=. --push

# opção B — manual
# 1. github.com/new → nome "oficina-os" → Private → criar SEM readme
# 2. depois:
cd C:\Users\phspi\oficina-os
git remote add origin https://github.com/SEU_USUARIO/oficina-os.git
git push -u origin master
```

**Checagem antes do push:** `.gitignore` já exclui `data/`, `.env` e `*.db`. Nunca commitar JWT_SECRET.

## 2. Deploy no Railway (~US$5/mês)

1. railway.app → login com GitHub → New Project → Deploy from GitHub repo → `oficina-os`
2. Ele detecta Node. Conferir em Settings:
   - Build command: `npm run build`
   - Start command: `npm start`
3. **Variables**: `JWT_SECRET` = string aleatória de 64+ chars (gerar: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
   e `DB_PATH` = `/data/oficina.db`
4. **Volume**: add volume montado em `/data` (1GB basta) — sem isso o banco morre a cada deploy
5. Settings → Networking → Generate Domain → pronto, URL pública

## 3. Alternativa VPS (mais barato em escala: ~R$25/mês fixo p/ N clientes)

Hostinger/Contabo VPS Ubuntu → instalar Node 22+ → clonar repo → `npm install && npm run build` →
`pm2 start server.js --name oficina-os` → `pm2 save && pm2 startup` → Caddy/nginx na frente com HTTPS.

## 4. Cobrança sem código

Mercado Pago → Assinaturas → criar plano (R$49/59/79 mensal) → mandar link pro cliente.
Inadimplência se gerencia manual até ter 5+ clientes.

## 5. Backup (fazer ANTES do primeiro cliente pagar)

Cron diário copiando `/data/oficina.db` pra outro lugar (Railway: usar litestream com R2/B2 grátis).
