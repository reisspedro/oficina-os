# Deploy do OficinaOS

Guia de implantação em produção para o OficinaOS.

## 1. Repositório no GitHub

Recomenda-se manter o repositório como privado durante o desenvolvimento inicial.

```bash
# Opção A — GitHub CLI
gh auth login
gh repo create oficina-os --private --source=. --push

# Opção B — manual
# 1. Acesse github.com/new
# 2. Crie o repositório "oficina-os" como Private (sem README)
# 3. Execute:
git remote add origin https://github.com/SEU_USUARIO/oficina-os.git
git push -u origin master
```

**Verificações antes do push:**
- `.gitignore` já exclui `data/`, `.env` e `*.db`.
- Nunca commite `JWT_SECRET` ou arquivos de banco de dados.

## 2. Deploy no Railway

1. Acesse railway.app e faça login com GitHub.
2. Crie um novo projeto e selecione "Deploy from GitHub repo".
3. Selecione o repositório `oficina-os`.
4. Em Settings, confirme:
   - Build command: `npm run build`
   - Start command: `npm start`
5. Adicione as variáveis de ambiente:
   - `JWT_SECRET`: string aleatória de 64+ caracteres (gere com `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
   - `DB_PATH`: `/data/oficina.db`
6. Adicione um volume persistente montado em `/data` (1 GB é suficiente).
7. Em Networking, gere um domínio público.

**Importante:** `JWT_SECRET` é obrigatório em produção. Quando `NODE_ENV=production`, o servidor recusa iniciar se a variável não estiver definida.

## 3. Alternativa VPS

Para escala com custo fixo mais baixo (~R$25/mês):

- Use VPS Ubuntu (Hostinger, Contabo ou similar).
- Instale Node.js 22+.
- Clone o repositório e execute `npm install && npm run build`.
- Inicie com `pm2 start server.js --name oficina-os`.
- Execute `pm2 save && pm2 startup`.
- Coloque Caddy ou nginx na frente para HTTPS.

## 4. Cobrança via Mercado Pago (assinaturas)

1. No Mercado Pago, acesse Assinaturas e crie planos (ex.: R$49, R$59 e R$79 mensais).
2. Envie o link de assinatura diretamente para o cliente.
3. Gerencie inadimplência manualmente até atingir volume maior (5+ clientes).

## 5. Backup do SQLite

Configure backup diário do banco de dados antes de receber o primeiro cliente pagante.

- Railway: use Litestream com armazenamento em R2 ou Backblaze B2 (camada gratuita disponível).
- VPS: cron job copiando o arquivo do banco para local externo ou object storage.

## Checklist pré-go-live

- [ ] Backup testado e restaurável
- [ ] `JWT_SECRET` forte (64+ caracteres) definido
- [ ] Volume persistente montado corretamente em `/data`
- [ ] `DB_PATH` apontando para o volume persistente
- [ ] Domínio configurado e acessível
- [ ] `NODE_ENV=production` definido
- [ ] Teste de fluxo completo (criação de OS, aprovação, baixa de estoque, pagamento)
