# REIS CASH para Android

Aplicativo leve para Android 6 ou superior que abre o REIS CASH em uma Custom Tab do navegador instalado. Usa a mesma plataforma publicada no GitHub Pages, com cadastro, credores, centralizador, contas fixas, parcelas e Google Drive.

## Como usar
Instale o APK, abra REIS CASH e conecte a mesma conta Google usada no computador. Aguarde a sincronização antes de fechar. Use um navegador atualizado. O aplicativo precisa de internet para carregar o site; não promete funcionamento totalmente offline.

A barra de identificação do navegador permanece visível. Não é uma reimplementação nativa das telas: o app utiliza as telas do site e recebe suas atualizações automaticamente. O armazenamento e a sessão pertencem ao navegador escolhido; alterar o navegador pode exigir reconexão ao Drive. Dados que estiverem somente no computador precisam ser sincronizados primeiro.

## APK de teste
O workflow Android APK compila e verifica uma versão de teste assinada com chave de depuração gerada no runner. O APK é para instalação direta e não para envio à Play Store. Uma nova compilação pode usar outra chave, exigindo desinstalar o pacote anterior; as atualizações normais do site não exigem outro APK. Para distribuição permanente, configurar chave de produção privada e estável antes de uma nova versão. Nunca versionar uma chave privada.

## Compilar
JDK 17, SDK Android 35, Gradle 8.11.1.
Na pasta android: gradle :app:assembleDebug
O APK aparece em app/build/outputs/apk/debug/app-debug.apk.

O APK não contém credenciais, dados financeiros ou segredo OAuth. A autorização Google é realizada no navegador, na origem HTTPS já autorizada.
