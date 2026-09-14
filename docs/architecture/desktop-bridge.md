# Desktop Bridge

O Auri Desktop expõe, somente após o `AppContext` estar pronto, um Named Pipe local autenticado. Produção usa `auri-desktop-v1-<escopo>` e desenvolvimento usa `auri-desktop-dev-v1-<escopo>`; o escopo é um hash local e não contém o nome cru do usuário.

Cada frame possui um prefixo unsigned de 4 bytes little-endian seguido por JSON UTF-8, limitado por `MAX_PROTOCOL_MESSAGE_BYTES` do `@auri/protocol`. O servidor envia um nonce novo e exige HMAC-SHA256 de `auri-bridge-v1:<serverNonce>:<clientNonce>` com o secret de 256 bits persistido em `userData/native-bridge/secret`. O secret nunca é enviado pelo pipe.

Depois do handshake, a conexão aceita múltiplos `ProtocolRequest` v1. O pipe não é uma API pública para terceiros; ele é o transporte local usado pelo Auri Native Host. Node não oferece uma ACL Windows explícita e portátil para Named Pipes, portanto a integração combina endpoint por usuário/perfil com secret e HMAC.

## Native Host

`AuriNativeHost.exe` é um executável Windows standalone gerado por `npm run build:native-host` com Node SEA. Ele implementa somente o transporte entre o Native Messaging do navegador e o Named Pipe autenticado do Desktop: não acessa banco, repositórios nem serviços da aplicação.

Na entrada e na saída do navegador, as mensagens usam o mesmo prefixo little-endian de 4 bytes e o limite do protocolo. A entrada é validada com `safeParseRequest` antes do pipe, e a resposta do Desktop é validada com `safeParseResponse` antes de voltar ao navegador. `stdout` é reservado exclusivamente aos frames; os logs ficam em `%APPDATA%/Auri/logs/native-host.log`.

Produção é o modo padrão e usa `%APPDATA%/Auri`. Quando o pipe ainda não existe, o host pode iniciar uma única vez o `Auri.exe` instalado com `--native-bridge-start` e aguardar até 8 segundos. Essa inicialização prepara o contexto e o bridge com a janela oculta; somente operações de interface explícitas exibem a janela.

`AuriNativeHost.exe` é compilado como PROD e não escolhe ambiente por pastas, banco ou variáveis. `AuriNativeHostDev.exe` é gerado separadamente com `npm run build:native-host:dev`, tem DEV fixado no próprio bundle, usa exclusivamente `%APPDATA%/Auri-Dev` e nunca inicia `Auri.exe`, npm, Electron ou outro processo de desenvolvimento. Nesse modo, diagnósticos também podem ser enviados para `stderr`, sem contaminar `stdout`.

O host apenas lê `native-bridge/secret`; a criação e a posse do secret continuam exclusivas do Desktop. O fechamento de `stdin` encerra imediatamente o pipe e o processo do host.

## Production Native Messaging

O instalador inclui `AuriNativeHost.exe` em `<installDir>\resources\native-host`. Depois de extrair os arquivos, o NSIS cria `app.auri.native_host.json` no mesmo diretório com o caminho absoluto do executável e registra `app.auri.native_host` em HKCU para Chrome, Edge e Brave. Updates substituem o executável, regeneram o manifest e reescrevem os três registros para o caminho atual.

Na 1.12.0, `build/native-host/production.config.json` ativa a configuração oficial Embedded. Os IDs vêm de `build/browser-extension.config.json`: Edge `alnngjgmhiebpnjefjmhbhmhfpgoibnh` e Embedded `agefiaohfielfgadiagemnflekbboblp`. O manifest autoriza exatamente:

```json
[
  "chrome-extension://agefiaohfielfgadiagemnflekbboblp/",
  "chrome-extension://alnngjgmhiebpnjefjmhbhmhfpgoibnh/"
]
```

Não há wildcard ou IDs DEV. O guia de instalação não modifica esse manifest: apenas prepara a pasta e orienta o usuário. A detecção de processos e a decisão de iniciar o navegador pertencem ao Desktop, não ao Native Host.

`AURI_EXTENSION_CHROME_ID` e `AURI_EXTENSION_BRAVE_ID` devem estar ausentes: não há IDs de loja desses navegadores neste release. `AURI_EXTENSION_EDGE_ID`, se informado, deve coincidir com o Edge oficial. As três chaves Registry continuam apontando ao mesmo manifest, sem registrar a extensão nem aplicar policies.

A configuração oficial recusa modo `test` e IDs divergentes. O mecanismo genérico permanece coberto por testes isolados; o fluxo DEV separado permanece intacto. Consulte [Embedded, instalação guiada e segurança](../development/browser-extension.md) para o build reproduzível e atualização futura do pacote.

No uninstall, cada chave é removida somente quando seu valor ainda aponta para o manifest da instalação removida. As chaves parent, hosts de terceiros e `app.auri.native_host.dev` não são tocados. O manifest e o executável somem junto de `resources/native-host`; `%APPDATA%/Auri` e `%APPDATA%/Auri-Dev` não são alterados por essa integração.

O instalador não encerra `AuriNativeHost.exe` à força. Se uma conexão estiver mantendo o arquivo aberto durante um update, feche o popup da Extension e tente novamente; novas conexões usarão o executável substituído depois que a instalação terminar.

Registros de produção:

```text
HKCU\Software\Google\Chrome\NativeMessagingHosts\app.auri.native_host
HKCU\Software\Microsoft\Edge\NativeMessagingHosts\app.auri.native_host
HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\app.auri.native_host
```

Validação manual após instalar:

```powershell
reg query "HKCU\Software\Google\Chrome\NativeMessagingHosts\app.auri.native_host" /ve
reg query "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\app.auri.native_host" /ve
reg query "HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\app.auri.native_host" /ve

$key = 'Registry::HKEY_CURRENT_USER\Software\Microsoft\Edge\NativeMessagingHosts\app.auri.native_host'
$manifestPath = (Get-ItemProperty -LiteralPath $key).'(default)'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
Test-Path -LiteralPath $manifestPath
Test-Path -LiteralPath $manifest.path
$manifest | ConvertTo-Json -Depth 4
```

O build da Auri Extension continua separado: `npm run build` no repositório da Extension usa `app.auri.native_host` no transporte de produção. O E2E de produção deve ser executado somente com um ID explicitamente autorizado no instalador.

As funções do navegador exigem a Auri Extension e o Auri Desktop 1.10.0 ou superior compatível. O Desktop continua completo e independente sem a extensão. A comunicação permanece local: não há conta, nuvem, telemetria ou analytics. Os logs do Native Host e do bridge registram somente eventos operacionais, método, identificador truncado, duração e códigos de erro; não registram URL integral, payload integral, secret, nonce ou HMAC.

O electron-builder inclui executáveis de `extraResources` no fluxo de assinatura quando um certificado Windows estiver configurado. Sem certificado, o SEA e o instalador permanecem unsigned e podem receber alertas adicionais do SmartScreen ou antivírus; nenhuma evasão ou assinatura improvisada é aplicada.

## Native Messaging DEV

Esta integração é exclusiva para desenvolvimento. Ela registra somente `app.auri.native_host.dev` em `HKCU`, não requer administrador e não cria manifest ou Registry de produção.

### Preparação

O fluxo recomendado para Brave é executado na raiz do Auri Desktop:

```powershell
npm run dev:extension:setup
```

O comando executa o build `dev-native` no repositório irmão `Auri-Extension`, prepara uma cópia em `build/generated/browser-extension-dev/`, aplica a identidade DEV estável `lfneneebngmiikddoddnlcgobfjkodpm`, gera `AuriNativeHostDev.exe` e registra somente `app.auri.native_host.dev` para Brave em HKCU. O manifest contém apenas `chrome-extension://lfneneebngmiikddoddnlcgobfjkodpm/` em `allowed_origins`.

Carregue `build/generated/browser-extension-dev/` em `brave://extensions/`. O nome exibido é **Auri Extension DEV**. O build original `artifacts/dev-native/` da Extension continua separado: ele serve apenas como entrada, e a identidade estável é aplicada somente à cópia preparada pelo Desktop.

Esse fluxo fixa `app.auri.native_host.dev` no bundle. O `npm run build` comum, Store e Embedded usam `app.auri.native_host`, de produção; definir apenas `VITE_AURI_TRANSPORT=native` não transforma um build de produção em DEV.

Para preparação manual ou suporte adicional a outros navegadores, gere o host DEV:

No repositório Auri, gere somente o host DEV:

```powershell
npm run build:native-host:dev
```

Para Chrome:

```powershell
npm run native-host:register-dev -- --chrome-extension-id=<ID_CHROME_DA_EXTENSAO>
```

Para Edge:

```powershell
npm run native-host:register-dev -- --edge-extension-id=<ID_EDGE_DA_EXTENSAO>
```

Para Brave:

```powershell
npm run native-host:register-dev -- --brave-extension-id=<ID_BRAVE_DA_EXTENSAO>
```

Para autorizar os dois IDs no mesmo manifest:

```powershell
npm run native-host:register-dev -- --chrome-extension-id=<ID_CHROME_DA_EXTENSAO> --edge-extension-id=<ID_EDGE_DA_EXTENSAO>
```

Substitua os IDs de exemplo pelos IDs reais exibidos pelos navegadores. O manifest absoluto é regenerado em `artifacts/native-host/dev/app.auri.native_host.dev.json`; `allowed_origins` contém somente os IDs informados explicitamente.

O registrador DEV oferece Chrome, Edge e Brave, sempre sob o host com sufixo `.dev`. Isso é separado do instalador PROD. A instalação manual do Embedded no Brave não registra nem utiliza o host DEV.

### Teste manual

1. Inicie o Desktop DEV com `npm run dev` neste repositório. Ele usa `%APPDATA%/Auri-Dev`.
2. Abra uma página HTTP/HTTPS e clique na Extension unpacked.
3. Confirme `system.hello`, depois os estados `matched` e `not_found` de `work.resolve` usando apenas obras/fontes de teste em Auri-Dev.
4. Em `matched`, use `Abrir no Auri` e confirme que a janela existente aparece na obra.
5. Em `not_found`, use `Adicionar ao Auri` e confirme o draft no diálogo sem salvar a obra.
6. Feche o popup e confirme que `AuriNativeHostDev.exe` encerra no Gerenciador de Tarefas.

Com o Desktop DEV fechado, o host não inicia o Auri de produção. A Extension deve informar que o Desktop não está disponível; após `npm run dev`, use `Tentar novamente`.

Os logs ficam em `%APPDATA%/Auri-Dev/logs/native-host.log`. Para diagnosticar `Specified native messaging host not found`, confira se o ID registrado é o da extensão carregada, regenere o host/manifest e recarregue a Extension. As chaves podem ser inspecionadas com:

```powershell
reg query "HKCU\Software\Google\Chrome\NativeMessagingHosts\app.auri.native_host.dev" /ve
reg query "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\app.auri.native_host.dev" /ve
reg query "HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\app.auri.native_host.dev" /ve
```

Remova somente o registro DEV deste projeto com:

```powershell
npm run native-host:unregister-dev
```

Também é possível limitar a remoção com `-- --chrome`, `-- --edge` ou `-- --brave`. O comando não remove uma chave se ela tiver sido redirecionada para outro manifest.
