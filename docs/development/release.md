# Build e publicação

O [package.json](../../package.json) define a versão do Auri. Os comandos `npm run dist` e `npm run dist:dir` geram outputs locais com `--publish never`. A existência de um Setup em `release/` não significa que ele foi publicado.

## Pré-requisitos

Use Windows x64, Node.js 22.12 ou mais recente e as dependências do lockfile. Disponibilize o ZIP e a metadata oficiais da Extension Embedded nos caminhos definidos em [browser-extension.config.json](../../build/browser-extension.config.json). Consulte [desenvolvimento local](browser-extension.md#desenvolvimento-local) para o layout dos repositórios e a preparação inicial.

A preparação valida os hashes dos inputs, a chave pública, o ID Embedded, a versão, os arquivos, as permissões, os locales e o host PROD. A 1.14.0 usa Embedded 0.3.0 com ID `agefiaohfielfgadiagemnflekbboblp`.

## Native Host de produção

A configuração oficial usa exatamente:

```text
chrome-extension://agefiaohfielfgadiagemnflekbboblp/
chrome-extension://alnngjgmhiebpnjefjmhbhmhfpgoibnh/
```

Deixe `AURI_EXTENSION_CHROME_ID` e `AURI_EXTENSION_BRAVE_ID` ausentes. `AURI_EXTENSION_EDGE_ID` é opcional; se definido, deve ser `alnngjgmhiebpnjefjmhbhmhfpgoibnh`. Não use modo `test`, wildcard ou IDs DEV para o release oficial.

O executável `artifacts/native-host/AuriNativeHost.exe` precisa existir antes do empacotamento. O comando `prepare:native-host:production` prepara o include NSIS e a metadata; ele não compila o executável e não registra o host na máquina. Veja [Production Native Messaging](../architecture/desktop-bridge.md#production-native-messaging).

## Validação e empacotamento local

Na raiz do Desktop, prepare os inputs e execute os testes apropriados às áreas alteradas. Depois confira os tipos e compile o aplicativo. Gere o Native Host PROD em um checkout limpo ou quando seu código tiver mudado:

```powershell
npm run prepare:browser-extension
# Execute aqui os testes pertinentes à mudança.
npm run typecheck
npm run build:app
npm run build:native-host
npm run dist
```

Se qualquer validação falhar, corrija antes do dist. Quando o Native Host existente já tiver sido validado e seu código não tiver mudado, ele pode ser reutilizado.

`prebuild:app` gera os assets, a compatibilidade e o Embedded. O hook `beforePack` repete a validação dos inputs e prepara o include NSIS oficial. `dist` empacota o conteúdo que já existe em `out/`: não executa `build:app` nem `build:native-host`. Usar outputs antigos pode empacotar código desatualizado.

Não execute dois empacotamentos ao mesmo tempo no mesmo checkout; eles compartilham `out/`, `build/generated/`, `artifacts/` e `release/`.

## Conferência do artefato

Na 1.14.0, mantenha o conjunto correspondente ao mesmo Setup:

| Arquivo em `release/` | Conferência |
| --- | --- |
| `Auri-Setup-1.14.0-x64.exe` | Versão, tamanho exato, SHA-256, SHA-512 Base64 e hexadecimal. |
| `Auri-Setup-1.14.0-x64.exe.blockmap` | Tamanho e checksums dos blocos do Setup correspondente. |
| `latest.yml` | Versão 1.14.0, nome do Setup, tamanho e SHA-512 iguais aos bytes atuais. |
| `auri-compatibility.json` | Versão 1.14.0, `minSchema: 1` e `maxSchema: 3`. |

Para auditar sem executar o instalador:

```powershell
node scripts/release/verify-local-artifacts.mjs '<caminho-do-7za.exe>'
```

O verificador extrai o Setup como dados em `artifacts/release-audit/1.14.0/`. Confere os dez arquivos Embedded contra o ZIP oficial, versão 0.3.0, chave/ID, locales en e pt_BR, Native Host PROD, bundles do ASAR contra `out/`, cabeçalho NSIS, as duas origins, registros previstos, updater e blockmap. A comparação do ASAR exige que `out/` ainda corresponda ao build empacotado.

O processo gera `report.json`, `extraction.txt`, `nsis-header.bin` e `extracted/`; apenas extrair esses dados não instala o aplicativo nem altera Registry ou AppData. A assinatura deve ser conferida separadamente com `Get-AuthenticodeSignature` para Setup, Auri e Native Host. Sem certificado configurado, o esperado é `NotSigned`.

Calcule os hashes a partir do Setup que será entregue. Qualquer novo dist invalida hashes e relatórios do instalador anterior, mesmo que a versão permaneça 1.14.0. Não reutilize números de uma conversa ou de uma auditoria anterior sem conferir o arquivo atual.

## Outputs e limpeza

| Diretório ou arquivo | Uso |
| --- | --- |
| `src/`, `scripts/`, `tests/`, configurações e lockfile | Fontes e ferramentas do projeto; não são temporários. |
| `out/` | Aplicativo compilado, usado por `npm run start` e pelo dist. |
| `build/assets/` e `build/generated/` | Recursos gerados; prepare-os novamente antes de usar o fluxo que depende deles. |
| `artifacts/native-host/` | Binários e configuração do host; o host DEV pode estar referenciado no Registry local. |
| `release/win-unpacked/` e arquivos de depuração do builder | Outputs recriáveis de empacotamento. |
| `.cache/`, temporários, logs e extrações de auditoria | Podem ser removidos quando não estiverem em uso. |
| Setup, blockmap, `latest.yml`, compatibilidade e relatórios finais | Preserve o conjunto de entrega e suas evidências de validação. |

Espere builds e auditorias terminarem antes da limpeza. Preserve os binários DEV registrados e os arquivos usados por instâncias abertas. Após remover extrações temporárias, os caminhos internos de um relatório antigo podem não existir mais; o relatório registra uma conferência passada, e as extrações podem ser recriadas.

## Publicação

A publicação é uma etapa separada do empacotamento local. Antes de publicar:

1. valide a versão definida no `package.json` e revise as notas;
2. faça o commit da release;
3. crie uma tag com o mesmo número prefixado por `v`;
4. em Windows x64, forneça `GH_TOKEN` somente como variável de ambiente ou segredo do CI;
5. execute `npm run release:win`.

Esse comando executa typecheck, a suíte de testes, os builds e a preparação do Native Host; em seguida gera novos artefatos e os envia para uma release em estado **draft**. Como há um novo empacotamento, confira os artefatos efetivamente enviados antes de publicar a release manualmente. Inclua Setup, blockmap, `latest.yml` e `auri-compatibility.json` na revisão.

Nunca grave o token no repositório, no `package.json` ou em arquivos `.env`.
