# REIS CASH

Controle pessoal de contas e dívidas: https://amcreis.github.io/REIS-CASH/

## Sincronização com Google Drive
1. Abra o site no navegador que já contém seus gastos.
2. Exporte um backup e clique em **Conectar Google Drive**.
3. Escolha a conta Google autorizada como usuário de teste e permita o acesso.
4. Aguarde **Sincronizado**. Abra o site em outro navegador e conecte a mesma conta.

Os gastos existentes são migrados automaticamente, mantendo o armazenamento antigo intacto como cópia de segurança. Não há dados financeiros no repositório. Apenas o identificador público OAuth está no código; não use segredo de cliente aqui.

A integração solicita `openid`, `email` e `drive.appdata`. Os registros ficam na pasta privada de dados do aplicativo, invisível na interface comum do Drive. O e-mail identifica a conta vinculada. Os tokens permanecem apenas na memória e precisam ser renovados com **Reconectar Google Drive** ao recarregar ou expirar a autorização.

Enquanto a conexão estiver autorizada e o site aberto, alterações são enviadas após salvar e verificadas a cada 30 segundos, ao voltar à aba e ao recuperar conexão. **Sincronizar agora** força uma verificação. Sem conexão, os dados ficam locais até o próximo envio bem-sucedido. Não limpe o navegador antes de ver **Sincronizado**. Desconectar encerra a sessão local de sincronização, mas mantém os dados locais e a autorização concedida no Google. Para revogar a autorização, use as configurações da conta Google.

## Alterações simultâneas
Cada alteração produz um arquivo imutável. Navegadores unem o histórico por identificadores únicos em vez de substituir um arquivo compartilhado. Pagamentos de parcelas diferentes são reunidos. A exclusão impede que uma edição antiga ressuscite o gasto. Alterações concorrentes nos detalhes da mesma compra usam a ordem de versão (relógio lógico com desempate por ID); revise se editar a mesma compra em dois dispositivos desconectados. Os detalhes da compra são tratados juntos para preservar a validade do valor e do parcelamento.

Um navegador fica vinculado à primeira conta conectada para evitar enviar os dados a outra pessoa. Para usar outra conta, use um perfil separado do navegador.

## Backups
Exportar backup baixa os gastos atuais. Restaurar substitui os gastos visíveis deste navegador e sincroniza essas alterações quando conectado. Os gastos remotos ainda desconhecidos serão reunidos na próxima sincronização; sincronize antes de restaurar. Guarde seus backups em local privado, nunca neste repositório público.

## Configuração Google
- Google Drive API habilitada.
- Cliente OAuth do tipo Aplicativo da Web.
- Origem JavaScript autorizada: `https://amcreis.github.io`.
- Conta incluída nos usuários de teste enquanto o aplicativo estiver em teste.
- Escopos: `openid`, `email`, `https://www.googleapis.com/auth/drive.appdata`.
- Sem segredo de cliente, chave de API ou servidor privado.

## Publicação
GitHub Pages: branch `main`, pasta raiz. Arquivos estáticos sem dependências de compilação: `index.html`, `app.js`, `sync-core.js`, `drive-sync.js`.

## Validação
Testes locais cobrem migração, combinação de pagamentos, exclusões concorrentes, restauração, isolamento de conta, persistência, falha de armazenamento, envio/repetição simulados, expiração e ausência de tokens no armazenamento. A autorização e sincronização reais precisam ser confirmadas na conta Google do usuário.
