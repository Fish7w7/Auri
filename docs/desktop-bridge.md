# Desktop Bridge

O Auri Desktop expõe, somente após o `AppContext` estar pronto, um Named Pipe local autenticado. Produção usa `auri-desktop-v1-<escopo>` e desenvolvimento usa `auri-desktop-dev-v1-<escopo>`; o escopo é um hash local e não contém o nome cru do usuário.

Cada frame possui um prefixo unsigned de 4 bytes little-endian seguido por JSON UTF-8, limitado por `MAX_PROTOCOL_MESSAGE_BYTES` do `@auri/protocol`. O servidor envia um nonce novo e exige HMAC-SHA256 de `auri-bridge-v1:<serverNonce>:<clientNonce>` com o secret de 256 bits persistido em `userData/native-bridge/secret`. O secret nunca é enviado pelo pipe.

Depois do handshake, a conexão aceita múltiplos `ProtocolRequest` v1. O pipe não é uma API pública para terceiros; ele é o transporte local previsto para o futuro Auri Native Host. Node não oferece uma ACL Windows explícita e portátil para Named Pipes, portanto a Fase A combina endpoint por usuário/perfil com secret e HMAC.

## Native Host

`AuriNativeHost.exe` é um executável Windows standalone gerado por `npm run build:native-host` com Node SEA. Ele implementa somente o transporte entre o Native Messaging do navegador e o Named Pipe autenticado do Desktop: não acessa banco, repositórios nem serviços da aplicação.

Na entrada e na saída do navegador, as mensagens usam o mesmo prefixo little-endian de 4 bytes e o limite do protocolo. A entrada é validada com `safeParseRequest` antes do pipe, e a resposta do Desktop é validada com `safeParseResponse` antes de voltar ao navegador. `stdout` é reservado exclusivamente aos frames; os logs ficam em `%APPDATA%/Auri/logs/native-host.log`.

Produção é o modo padrão e usa `%APPDATA%/Auri`. Quando o pipe ainda não existe, o host pode iniciar uma única vez o `Auri.exe` instalado com `--native-bridge-start` e aguardar até 8 segundos. Essa inicialização prepara o contexto e o bridge com a janela oculta; somente operações de interface explícitas exibem a janela.

`AuriNativeHost.exe` é compilado como PROD e não escolhe ambiente por pastas, banco ou variáveis. `AuriNativeHostDev.exe` é gerado separadamente com `npm run build:native-host:dev`, tem DEV fixado no próprio bundle, usa exclusivamente `%APPDATA%/Auri-Dev` e nunca inicia `Auri.exe`, npm, Electron ou outro processo de desenvolvimento. Nesse modo, diagnósticos também podem ser enviados para `stderr`, sem contaminar `stdout`.

O host apenas lê `native-bridge/secret`; a criação e a posse do secret continuam exclusivas do Desktop. O fechamento de `stdin` encerra imediatamente o pipe e o processo do host.

## Native Messaging DEV

Esta integração é exclusiva para desenvolvimento. Ela registra somente `app.auri.native_host.dev` em `HKCU`, não requer administrador e não cria manifest ou Registry de produção.

### Preparação

No repositório da Auri Extension, em PowerShell:

```powershell
$env:VITE_AURI_TRANSPORT = 'native'
npm run build
```

Carregue a pasta `dist/` como extensão unpacked em `chrome://extensions` ou `edge://extensions` e copie o ID exibido. Chrome e Edge podem atribuir IDs diferentes.

No repositório Auri, gere somente o host DEV:

```powershell
npm run build:native-host:dev
```

Para Chrome:

```powershell
npm run native-host:register-dev -- --chrome-extension-id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

Para Edge:

```powershell
npm run native-host:register-dev -- --edge-extension-id=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
```

Para autorizar os dois IDs no mesmo manifest:

```powershell
npm run native-host:register-dev -- --chrome-extension-id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --edge-extension-id=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
```

Substitua os IDs de exemplo pelos IDs reais exibidos pelos navegadores. O manifest absoluto é regenerado em `artifacts/native-host/dev/app.auri.native_host.dev.json`; `allowed_origins` contém somente os IDs informados explicitamente.

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
```

Remova somente o registro DEV deste projeto com:

```powershell
npm run native-host:unregister-dev
```

Também é possível limitar a remoção com `-- --chrome` ou `-- --edge`. O comando não remove uma chave se ela tiver sido redirecionada para outro manifest.
