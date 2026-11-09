# Extensão do navegador - Desktop 1.14.0

## Desenvolvimento local

Use Windows x64 e Node.js 22.12 ou mais recente. Além do checkout do Desktop, disponibilize os inputs oficiais da Auri Extension nos caminhos definidos em `build/browser-extension.config.json`. No layout padrão, `Auri/` e `Auri-Extension/` são diretórios irmãos, e o ZIP Embedded 0.3.2 e sua metadata ficam em `Auri-Extension/release/`.

Com os inputs disponíveis, na raiz do Desktop:

```powershell
npm ci
npm run dev
```

O `predev` valida e prepara o Embedded antes de iniciar o aplicativo. Se o ZIP ou a metadata não existir ou não corresponder aos hashes fixados, obtenha os inputs oficiais; não substitua os hashes apenas para aceitar outro arquivo.

`npm run start` executa o conteúdo já compilado em `out/`; não recompila o projeto. Após mudar Main, preload ou contratos IPC, feche completamente a instância antiga antes de abrir o build atualizado. Recarregar somente a tela pode combinar um renderer novo com handlers antigos e causar falhas em ações como **Copiar endereço**. No desenvolvimento contínuo, `npm run dev -- --watch` habilita recompilação de Main/preload e reinício ou recarga pelo electron-vite.

A tela e a detecção podem ser conferidas em DEV, mas o Embedded oficial usa o Native Host **PROD**. Para testar a comunicação com o Desktop em `Auri-Dev`, use a [extensão e o host específicos de desenvolvimento](../architecture/desktop-bridge.md#native-messaging-dev). Não redirecione o pacote Embedded oficial para o host DEV.

### Testar Auri Extension com Desktop DEV

1. Na raiz do Desktop, execute `npm run dev:extension:setup` para buildar a Extension DEV, gerar o Native Host DEV e registrar `app.auri.native_host.dev` no Brave em HKCU.
2. Inicie o Desktop com `npm run dev`; ele usa exclusivamente `%APPDATA%\Auri-Dev` e o pipe DEV.
3. Em `brave://extensions/`, ative o modo do desenvolvedor, escolha **Carregar sem compactação** e selecione `Auri\build\generated\browser-extension-dev`.
4. Confirme o nome **Auri Extension DEV**, o ID `lfneneebngmiikddoddnlcgobfjkodpm` e o log `%APPDATA%\Auri-Dev\logs\native-host.log`. Com o Desktop fechado, o popup deve permanecer desconectado e nunca iniciar o Auri instalado.
5. Para remover somente os registros DEV deste projeto, execute `npm run native-host:unregister-dev`; use `-- --brave` para limitar a remoção ao Brave.

As variantes **Embedded** e **Store** são PROD e continuam usando `app.auri.native_host`. A pasta `browser-extension-dev` é exclusiva de desenvolvimento, usa uma identidade pública própria e é recriada pelo comando de setup. `build/browser-extension-dev.public.json` contém somente a chave pública necessária para o ID estável; nenhuma chave privada ou secret local faz parte do repositório.

## Instalação pelo Desktop

Abra **Configurações → Extensão do navegador**. Edge oferece o link oficial do Edge Add-ons. Chrome e Brave oferecem **Instalar no Chrome** e **Instalar no Brave** quando o navegador e os arquivos Embedded estão disponíveis.

Na instalação manual, o Auri valida os arquivos e abre a pasta antes de verificar a instância do navegador:

| Estado da consulta | Comportamento |
| --- | --- |
| Navegador em execução | Mantém a instância existente e orienta copiar o endereço no guia. |
| Navegador fechado | Tenta iniciar o executável detectado com sua URL interna de extensões. |
| Consulta inconclusiva | Evita uma nova abertura e orienta navegar manualmente. |

Use **Copiar endereço** e cole o valor na barra de endereço do navegador. Em seguida, ative o **Modo do desenvolvedor**, clique em **Carregar sem compactação** e selecione a pasta preparada. **Abrir pasta** e **Copiar caminho** permitem repetir essas ações. Nenhuma dessas etapas detecta ou confirma que a extensão foi instalada.

Se uma ação falhar, o guia permanece disponível e o toast identifica a etapa. **Atualizar detecção** refaz a consulta dos navegadores instalados; a verificação de processos ocorre a cada solicitação de abertura de extensões.

## Entrada e build reproduzível

`build/browser-extension.config.json` define os caminhos, hashes SHA-256, versão, identidade Embedded, fingerprint público e URL pública da loja Edge. Os caminhos são relativos à raiz do Desktop. A entrada 0.3.2 é `../Auri-Extension/release/auri-extension-0.3.2-embedded.zip`, com metadata no `.json` de mesmo nome.

- ZIP SHA-256 `62f35b96e5d0a20073930e7fc9bf82d1f4a2ae82649bf332cf6d2202a344786d`.
- Metadata SHA-256 `d5a6ca241f739a60b42e4463fcab104a43f085cf2c23da145e22b88eae8e2296`.
- Fingerprint SHA-256 da chave pública: `064580e7584b56038064cd5b4a11e1bfde8ddf403a06cc974d2d63c59b7e155b`.
- ID Embedded: `agefiaohfielfgadiagemnflekbboblp`.
- Origin Embedded: `chrome-extension://agefiaohfielfgadiagemnflekbboblp/`.

Execute `npm run prepare:browser-extension` antes de testes/typecheck em checkout limpo. O comando também roda no predev e prebuild:app. Ele valida os bytes do ZIP e da metadata independentemente, manifest v3/versão/key/ID/fingerprint, host PROD, locales en e pt_BR, permissões exatas activeTab/scripting/nativeMessaging e arquivos obrigatórios. Rejeita conteúdo DEV, segredos, chave privada, sourcemaps, testes, node_modules e paths inseguros. Os 10 arquivos oficiais são extraídos somente após validação, para `build/generated/browser-extension/` (ignorado). O ZIP permanece a fonte, sem cópia manual em source.

`extraResources` entrega diretamente `<installDir>\resources\browser-extension\manifest.json`, `_locales/`, `assets/`, `icons/` e HTML. O caminho não contém versão e permanece estável nas atualizações no mesmo diretório de instalação. `browser-extension-integrity.json`, gerado ao lado, contém versão, ID, hash original, contagem e hashes individuais; seu inventário também é incorporado no Main para verificação de integridade em runtime. Arquivos ausentes, extras, alterados ou links simbólicos tornam o Embedded indisponível, sem encerrar o aplicativo.

O hook `beforePack` valida novamente a URL pública, inputs e configuração PROD inclusive em chamadas diretas ao electron-builder. `npm run dist` cria artefatos locais com `--publish never`. Não usar `release:win` para esse fluxo local: esse comando histórico publica.

## Edge Store e Embedded

A [URL pública da Auri no Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/auri/alnngjgmhiebpnjefjmhbhmhfpgoibnh) foi fornecida pelo responsável pelo release. Ela fica controlada no Main/configuração e precisa estar preenchida antes de gerar artefato oficial. Nunca derive um link a partir de Store/Product ID.

Edge usa a loja oficial. Chrome e Brave usam o mesmo Embedded unpacked. Não há ID oficial de Chrome Web Store ou Brave Store neste release: deixe `AURI_EXTENSION_CHROME_ID` e `AURI_EXTENSION_BRAVE_ID` ausentes. O empacotamento rejeita valores nessas variáveis, modo test e Edge divergente. `AURI_EXTENSION_EDGE_ID` pode estar ausente (configuração oficial versionada) ou ser exatamente `alnngjgmhiebpnjefjmhbhmhfpgoibnh`.

## Native Messaging

Preservado o include NSIS gerado por `scripts/release/native-host-production.js`. O installer materializa `resources/native-host/app.auri.native_host.json`, com path absoluto para o executável instalado e exatamente:

```json
[
  "chrome-extension://alnngjgmhiebpnjefjmhbhmhfpgoibnh/",
  "chrome-extension://agefiaohfielfgadiagemnflekbboblp/"
]
```

As três chaves HKCU sob `Software\Google\Chrome`, `Software\Microsoft\Edge` e `Software\BraveSoftware\Brave-Browser`, em `NativeMessagingHosts\app.auri.native_host`, apontam ao mesmo manifest. Registram apenas o host. Não há registro da extensão ou policies. O ID antigo `kldacocmhefloboachmkpeojenaaocek` não é autorizado. `Auri-Dev` e `app.auri.native_host.dev` continuam no fluxo DEV independente.

## Main, IPC e privacidade

Detecção por App Paths HKCU (64/32), HKLM (64/32), LOCALAPPDATA, Program Files e Program Files (x86), nessa ordem. Apenas executáveis de nomes conhecidos, caminhos absolutos locais e arquivos existentes são aceitos. Consultas Registry usam reg.exe com argumentos separados, timeout e shell desabilitado. Não se leem perfis, histórico, cookies, Preferences ou extensões instaladas.

API isolada `window.auri.browserExtension`: `getStatus()`, `openEdgeStore()`, `openExtensionsPage(edge|chrome|brave)`, `openFolder()`, `copyPath()`, `copyExtensionsUrl(edge|chrome|brave)`. Não expõe executáveis, shell/spawn, URL, texto ou path arbitrário. O Main valida a enumeração em runtime; folder/copyPath ignoram qualquer payload extra e usam exclusivamente a pasta fixa. A cópia do endereço usa apenas as três URLs internas fixas do contrato. Erros retornados são sanitizados.

## Abertura e fallback de navegação

O Brave 1.94.121 usado na investigação da 1.12.0 utiliza Chromium 152.0.7977.83. A causa da Nova guia é o filtro de URLs de inicialização do Chromium: a URL interna não é uma URL web-safe aceita pela navegação normal via linha de comando. O evento `spawn` não comprova navegação. Referências: [versão usada pelo Brave](https://raw.githubusercontent.com/brave/brave-core/v1.94.121/package.json), [delegação de tabs do Brave](https://raw.githubusercontent.com/brave/brave-core/v1.94.121/browser/ui/startup/brave_startup_tab_provider_impl.cc) e [ValidateLaunchUrlWebUnsafe no Chromium correspondente](https://raw.githubusercontent.com/chromium/chromium/152.0.7977.83/chrome/browser/ui/startup/url_util.cc).

Antes de cada tentativa, o Main consulta os processos Brave, Chrome e Edge na sessão atual do Windows. A consulta PowerShell usa script fixo, `-NoProfile`, janela oculta, timeout de quatro segundos e `shell: false`. Retorna apenas nomes de processos; não consulta perfis, abas, títulos ou linhas de comando. Processos em segundo plano também contam como navegador em execução, evitando disparar outra janela nessa situação.

Se o navegador já estiver em execução, não há spawn nem envio da URL interna: o guia orienta copiar o endereço na janela existente. Se a consulta falhar, o resultado é desconhecido e a navegação fica manual. Somente quando a consulta confirma ausência de processo é feita a tentativa com o executável detectado e exatamente um argumento: `brave://extensions/`, `chrome://extensions/` ou `edge://extensions/`, com `shell: false`. Sem flags de perfil, guest, incognito, headless ou bypass. Não há confirmação de página carregada nem inspeção do perfil. O IPC retorna `already-running`, `launch-requested` ou `unknown`; chamadas simultâneas para o mesmo navegador compartilham a operação para evitar aberturas duplicadas.

Conforme fallback manual aprovado, o guia mantém **Copiar endereço** e a instrução de colar na barra de endereço quando a tentativa automática não abrir a página. O Main só copia a URL fixa correspondente ao navegador validado. Esse fallback também está disponível para Chrome e para a ação secundária do Edge.

Ao iniciar instalação manual, o Auri valida a integridade e aguarda `openFolder()` antes de verificar a instância e, se necessário, solicitar o navegador por último, sem delays arbitrários. Cada etapa é tratada separadamente: falha na pasta não impede verificar o navegador, e falha no navegador preserva a pasta aberta e o guia. Os toasts distinguem navegador já em execução, solicitação de abertura e consulta inconclusiva. O sistema operacional controla o foco final; o Auri não muda o foco da janela existente.

Os três cards usam status textual e ícone, sem controles para browsers ausentes. Um único guia segue a seleção Chrome/Brave, com três passos, fallback de endereço, ações individuais e nota de recarregamento. Feedback temporário usa os toasts existentes; atualizar detecção fica no topo e tentar novamente aparece apenas após erro de carregamento. O guia não recebe foco programático.

A UI informa detecção de navegador e disponibilidade do Embedded, sem alegar extensão instalada. O usuário ativa o Modo do desenvolvedor, clica em Carregar sem compactação e seleciona a pasta. Não há instalação silenciosa, automação, seleção de pasta pelo aplicativo, telemetria, analytics ou envio de detecção à nuvem.

## Atualizar o Embedded no futuro

1. Obter ZIP e metadata oficiais novos; confirmar hashes e a identidade com o responsável pela Extension.
2. Revisar os campos da configuração central. Manter a mesma chave pública/ID e o destino sem versão; mudança de identidade exige revisão explícita do Native Host.
3. Rodar preparação e testes focados, revisar permissões/host/locales e atualizar documentação/testes da versão.
4. Fazer typecheck, build app e Native Host, gerar dist local e inspecionar os bytes extraídos do Setup contra o ZIP oficial.
5. Validar manualmente atualização no mesmo installDir. O navegador pode exigir **Recarregar**; não automatizar essa ação.

Desktop 1.14.0 mantém schema 3, suporte 1–3 e protocolVersion 1. A dependência `@auri/protocol` 0.2.0 acrescenta `work.context` de forma aditiva; a Extension Embedded 0.3.1 usa esse contrato e os hosts DEV/PROD permanecem os mesmos.

## Auditoria local do Setup

Após o dist, execute `node scripts/release/verify-local-artifacts.mjs <caminho-do-7za.exe>`. O verificador extrai arquivos para `artifacts/release-audit/<versão>/`, sem executar Setup, Auri ou Native Host. Compara todos os bytes Embedded ao ZIP, verifica os bundles do ASAR, o Native Host, o cabeçalho NSIS compilado, as três entradas NativeMessagingHosts, os hashes do updater e cada checksum BLAKE2b do blockmap. Gera `report.json`, log de extração e cópia do cabeçalho NSIS para auditoria. Verifique também as três assinaturas com `Get-AuthenticodeSignature`; nesta distribuição o esperado é `NotSigned`.
