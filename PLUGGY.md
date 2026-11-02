# Ativação do Meu Pluggy no REIS CASH

A integração está preparada, mas permanece desativada até o servidor ser configurado. Nenhuma conta bancária é conectada apenas por publicar estes arquivos.

## 1. Criar as contas e autorizar o Itaú

1. Crie sua conta em [Meu Pluggy](https://meu.pluggy.ai/). Conecte sua conta Itaú e conclua pessoalmente a autorização no banco.
2. Entre no [painel da Pluggy](https://dashboard.pluggy.ai/) com a **mesma conta**. Em Applications, abra sua aplicação e a área Demo. Em Connect Account, escolha **MeuPluggy** (não escolha o conector Itaú diretamente nem o Sandbox para esta conexão pessoal).
3. Autorize o compartilhamento do Itaú com sua aplicação. Guarde o identificador da conexão (`itemId`) exibido em Connected Items.
4. Na aplicação, obtenha Client ID e Client Secret. Não publique essas credenciais no GitHub e não envie pelo chat.
5. Crie uma conta gratuita na [Cloudflare](https://dash.cloudflare.com/sign-up). Não é necessário comprar domínio.

O [guia oficial de uso pessoal](https://docs.pluggy.ai/en/docs/guides/meu-pluggy-personal-use) detalha o fluxo. Cada banco precisa de autorização própria. O acesso pessoal permite até cinco conexões e atualização diária; consultar no REIS CASH não força atualização no banco.

## 2. Publicar o serviço protegido

O serviço está em `backend/worker.mjs`. Para preparar e publicar pelo computador, na pasta `backend`:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm exec wrangler login
pnpm exec wrangler deploy
```

Outra opção é compilar com `pnpm build` e usar o arquivo `backend/dist/worker.js` no editor de um Worker criado no painel Cloudflare. O arquivo compilado não contém credenciais. Configure as variáveis abaixo no Worker, em Settings → Variables and Secrets. Os nomes podem variar conforme o idioma do painel.

| Nome | Tipo | Conteúdo |
| --- | --- | --- |
| `ALLOWED_ORIGIN` | Texto | `https://amcreis.github.io` |
| `GOOGLE_CLIENT_ID` | Texto | O mesmo identificador público de `pluggy-config.js` |
| `GOOGLE_ALLOWED_EMAIL` | Secret | Seu endereço Gmail autorizado; somente essa conta poderá consultar |
| `GOOGLE_ALLOWED_SUB` | Secret opcional | Identificador estável da mesma conta Google, para restrição adicional |
| `PLUGGY_CLIENT_ID` | Secret | Client ID da sua aplicação Pluggy |
| `PLUGGY_CLIENT_SECRET` | Secret | Client Secret da sua aplicação Pluggy |
| `PLUGGY_ITEMS` | Secret | Lista de conexões no formato abaixo |

Formato de `PLUGGY_ITEMS` (substitua o exemplo pelo `itemId` real, no painel privado):

```json
[{"id":"00000000-0000-4000-8000-000000000000","bank":"Itaú"}]
```

Se usar a linha de comando, `pnpm exec wrangler secret put NOME` solicita o valor de maneira interativa. Não coloque valores reais nos argumentos, arquivos versionados, logs ou capturas de tela. Este servidor aceita apenas Gmail pessoal verificado. Não registra respostas bancárias nem credenciais nos logs da aplicação.

Após publicar, guarde a URL HTTPS `https://reis-cash-pluggy.SEUSUBDOMINIO.workers.dev`. Sem as configurações obrigatórias, o serviço recusa consultas.

## 3. Ativar a tela

1. Preencha apenas `apiUrl` em `pluggy-config.js` com a URL do Worker, sem caminho adicional. Publique a alteração no GitHub Pages.
2. Confira no cliente OAuth Google a origem autorizada `https://amcreis.github.io` e sua conta nos usuários de teste, se aplicável.
3. Exporte os backups de dívidas e saldos. Atualize o REIS CASH em todos os navegadores antes de usar contas conectadas.
4. Abra Saldos bancários → Entrar para consultar. Use a mesma conta Google dos dados do Drive.
5. Confira o saldo recebido e sua data com o aplicativo Itaú. Escolha **Substituir** se essa conta já existe no controle; escolha **Criar uma nova conta** somente se o dinheiro ainda não estiver contabilizado.
6. Conecte o Google Drive e aguarde a sincronização. Confirme o valor em outro navegador e no Android.

## Comportamento esperado

- Somente contas correntes e poupanças em reais são importadas. Cartões, limites de crédito, caixinhas e investimentos separados não entram nesta primeira versão.
- A aplicação automática do Itaú não é somada novamente: o campo de saldo da Pluggy já pode incluí-la.
- Contas conectadas exibem a data de origem e não permitem retirada ou edição manual do valor. Contas manuais continuam funcionando como antes.
- Falhas, autorização vencida e resposta sem contas preservam o último saldo. O valor salvo pode estar desatualizado; confira a data exibida.
- O botão de consulta lê os dados disponíveis na Pluggy. O servidor mantém uma cópia em memória por até um minuto para evitar consultas repetidas.
- Dados mais antigos não substituem saldos com data bancária mais recente, mesmo que cheguem por outro navegador.
- Nenhum pagamento, transferência ou baixa de dívida é realizado pela integração. As dívidas permanecem independentes.
- A sessão de consulta fica apenas na memória. Recarregar ou expirar exige entrar novamente. Sair da consulta mantém os saldos salvos e não revoga o consentimento bancário.
- Para revogar o compartilhamento, use Meu Pluggy/banco. Quando a autorização expirar, renove-a no fluxo do MeuPluggy; se os identificadores mudarem, atualize a configuração privada e substitua o registro antigo na tela, evitando duplicação.
- Backups de saldos incluem os identificadores e valores das contas conectadas. Guarde-os em local privado.

## Validação antes de considerar a integração ativa

Testes automatizados cobrem assinatura Google, audiência/emissor/expiração, restrição de usuário e origem, filtragem das contas, paginação, ausência de credenciais na resposta, datas antigas, duplicação, persistência, falhas e isolamento das dívidas. A autorização real, o saldo do Itaú e o acesso pelo Android ainda precisam de validação com as contas do proprietário.

Se precisar desativar a consulta, esvazie `apiUrl` e publique. Isso mantém os saldos locais e não cancela as autorizações externas. Para revogação completa, remova as autorizações no Meu Pluggy/banco e as credenciais do Worker.

Referências: [API pessoal](https://meu.pluggy.ai/api-guide), [campos de saldo](https://docs.pluggy.ai/en/docs/products/accounts), [segredos Cloudflare](https://developers.cloudflare.com/workers/configuration/secrets/), [validação Google](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
