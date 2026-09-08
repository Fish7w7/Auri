# Extensão do navegador — Desktop 1.12.0

## Entrada e build reproduzível

`build/browser-extension.config.json` é a configuração revisável da distribuição: caminhos dos inputs oficiais, hashes SHA-256, versão, identidade Embedded, fingerprint público e URL pública da loja Edge. Os caminhos são relativos à raiz do Desktop. A entrada 0.2.0 é `../Auri-Extension/release/auri-extension-0.2.0-embedded.zip`, com metadata no `.json` de mesmo nome.

- ZIP SHA-256: `35a8ad1e0c662285ba3c1e9259d9e852c3b52cdc66e9454458f1b42fddeddade`.
- Metadata SHA-256: `82e7562af7a640111e66ecfab60d83ea2de19b14bebdd19eece070517764faec`.
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

API isolada `window.auri.browserExtension`: `getStatus()`, `openEdgeStore()`, `openExtensionsPage(edge|chrome|brave)`, `openFolder()`, `copyPath()`. Não expõe executáveis, shell/spawn, URL ou path arbitrário. O Main valida a enumeração em runtime; folder/copy ignoram qualquer payload extra e usam exclusivamente a pasta fixa. Erros retornados são sanitizados. Schemes internos usam spawn do executável detectado, com URL fixa em argumento separado e `shell: false`.

A UI informa detecção de navegador e disponibilidade do Embedded, sem alegar extensão instalada. O usuário ativa o Modo do desenvolvedor, clica em Carregar sem compactação e seleciona a pasta. Não há instalação silenciosa, automação, seleção de pasta pelo aplicativo, telemetria, analytics ou envio de detecção à nuvem.

## Atualizar o Embedded no futuro

1. Obter ZIP e metadata oficiais novos; confirmar hashes e a identidade com o responsável pela Extension.
2. Revisar os campos da configuração central. Manter a mesma chave pública/ID e o destino sem versão; mudança de identidade exige revisão explícita do Native Host.
3. Rodar preparação e testes focados, revisar permissões/host/locales e atualizar documentação/testes da versão.
4. Fazer typecheck, build app e Native Host, gerar dist local e inspecionar os bytes extraídos do Setup contra o ZIP oficial.
5. Validar manualmente atualização no mesmo installDir. O navegador pode exigir **Recarregar**; não automatizar essa ação.

Desktop 1.12.0 mantém schema 3, suporte 1–3, @auri/protocol 0.1.3 e protocolVersion 1, sem migrations nem capabilities novas.

## Auditoria local do Setup

Após o dist, execute `node scripts/release/verify-local-artifacts.mjs <caminho-do-7za.exe>`. O verificador extrai arquivos para `artifacts/release-audit/<versão>/`, sem executar Setup, Auri ou Native Host. Compara todos os bytes Embedded ao ZIP, verifica os bundles do ASAR, o Native Host, o cabeçalho NSIS compilado, as três entradas NativeMessagingHosts, os hashes do updater e cada checksum BLAKE2b do blockmap. Gera `report.json`, log de extração e cópia do cabeçalho NSIS para auditoria. Verifique também as três assinaturas com `Get-AuthenticodeSignature`; nesta distribuição o esperado é `NotSigned`.
