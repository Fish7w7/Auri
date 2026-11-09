# Build e publicação

O [package.json](../../package.json) define a versão do Auri. Os comandos `npm run dist` e `npm run dist:dir` geram outputs locais com `--publish never`. A existência de um Setup em `release/` não significa que ele foi publicado.

## Pré-requisitos

Use Windows x64, Node.js 22.12 ou mais recente e as dependências do lockfile. Disponibilize o ZIP e a metadata oficiais da Extension Embedded nos caminhos definidos em [browser-extension.config.json](../../build/browser-extension.config.json). Consulte [desenvolvimento local](browser-extension.md#desenvolvimento-local) para o layout dos repositórios e a preparação inicial.

A preparação valida os hashes dos inputs, a chave pública, o ID Embedded, a versão, os arquivos, as permissões, os locales e o host PROD. A 1.15.1 usa Embedded 0.3.2 com ID `agefiaohfielfgadiagemnflekbboblp`.

Desktop e extensão instalam o mesmo `vendor/auri-protocol-0.2.1.tgz`, cuja integridade consta nos lockfiles. O pacote local contém fonte e módulos compilados da migração sobre o [Auri-Protocol v0.2.0](https://github.com/Fish7w7/Auri-Protocol/tree/v0.2.0). Usa Zod 4.6.6 e mantém o wire v1. Para atualizar o pacote, execute os testes e o build no checkout do Protocol, gere o tarball com `npm pack --ignore-scripts` e atualize os dois lockfiles a partir do mesmo arquivo.

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
# Prepare os binários DEV e E2E ausentes antes da suíte completa.
npm run build:native-host:dev
node scripts/build/build-native-host.mjs --mode=e2e
npm test -- --maxWorkers=2
npm run typecheck
npm run build:app
npm run build:native-host
npm run dist
```

Se qualquer validação falhar, corrija antes do dist. Quando o Native Host existente já tiver sido validado e seu código não tiver mudado, ele pode ser reutilizado.

`prebuild:app` gera os assets, a compatibilidade e o Embedded. O hook `beforePack` repete a validação dos inputs e prepara o include NSIS oficial. `dist` empacota o conteúdo que já existe em `out/`: não executa `build:app` nem `build:native-host`. Usar outputs antigos pode empacotar código desatualizado.

Não execute dois empacotamentos ao mesmo tempo no mesmo checkout; eles compartilham `out/`, `build/generated/`, `artifacts/` e `release/`.

## Conferência do artefato

Mantenha o conjunto correspondente ao mesmo Setup da 1.15.1.

| Arquivo em `release/` | Conferência |
| --- | --- |
| `Auri-Setup-1.15.1-x64.exe` | Versão, tamanho exato, SHA-256, SHA-512 Base64 e hexadecimal. |
| `Auri-Setup-1.15.1-x64.exe.blockmap` | Tamanho e checksums dos blocos do Setup correspondente. |
| `latest.yml` | Versão 1.15.1, nome do Setup, tamanho e SHA-512 iguais aos bytes atuais. |
| `auri-compatibility.json` | Versão 1.15.1, `minSchema: 1` e `maxSchema: 3`. |

Para auditar sem executar o instalador:

```powershell
node scripts/release/verify-local-artifacts.mjs '<caminho-do-7za.exe>'
```

O verificador extrai o Setup como dados em `artifacts/release-audit/<versão>/`. Confere os dez arquivos Embedded contra o ZIP configurado, a identidade da extensão, locales, Native Host PROD, dependências, bundles do ASAR contra `out/`, binários desempacotados, cabeçalho NSIS, origins, registros previstos, updater e blockmap. A comparação do ASAR exige que `out/` ainda corresponda ao build empacotado. Para conferir um candidato separado, passe o diretório do candidato como segundo argumento. As evidências ficam na subpasta `verification`.

O processo gera `report.json`, `extraction.txt`, `nsis-header.bin` e `extracted/`; apenas extrair esses dados não instala o aplicativo nem altera Registry ou AppData. A assinatura deve ser conferida separadamente com `Get-AuthenticodeSignature` para Setup, Auri e Native Host. Sem certificado configurado, o esperado é `NotSigned`.

Calcule os hashes a partir do Setup que será entregue. Qualquer novo dist invalida hashes e relatórios do instalador anterior, mesmo que a versão continue igual. Confira o arquivo atual antes de reutilizar qualquer hash.

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

A publicação é uma etapa separada do empacotamento local. Para publicar um candidato já validado, use os mesmos arquivos conferidos na auditoria.

1. Revise os diffs e envie os commits aprovados da extensão e do Desktop. Aponte as tags `v0.3.2` e `v1.15.1` para os commits correspondentes.
2. Prepare a release da extensão com o ZIP Embedded e a metadata da mesma versão. O pacote Chromium pode acompanhar a release como arquivo separado para distribuição em loja.
3. Crie o rascunho da release `v1.15.1` no GitHub do Desktop. Use as [notas da versão](../releases/1.15.1.md) e anexe o Setup, o blockmap, `latest.yml` e `auri-compatibility.json` do candidato validado.
4. Confira a tag, os nomes, os tamanhos e os hashes dos arquivos do rascunho antes de publicar. Mantenha o conjunto no canal estável quando a publicação for aprovada.

O comando `npm run release:win` recompila o projeto, gera outro Setup e envia os novos arquivos para um rascunho. Para publicar o candidato já conferido, carregue os arquivos diretamente no rascunho do GitHub. Quando o pipeline automatizado for usado, forneça `GH_TOKEN` como segredo do CI ou variável de ambiente.
