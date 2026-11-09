# Perfil E2E do Desktop

## Seleção e limites

`AURI_E2E_USER_DATA` é opt-in de desenvolvimento, selecionado antes do lock de instância, dos serviços, do banco e do bridge. A instalação empacotada e os runners de smoke rejeitam esse override.

O destino deve ser absoluto sob `<AURI_DESKTOP_ROOT>/artifacts/e2e-profiles/<perfil>`. A validação confere caminho canônico, ancestrais e conteúdo existente; rejeita escapes, junctions/symlinks, arquivos compartilhados por hard link e backups existentes direcionados para fora de `<perfil>/backups`. Falha interrompe a inicialização sem recovery ou fallback para Auri/Auri-Dev.

SQLite, settings, assets, capas/cache, backups, logs, sessão do Electron, crash dumps e secret ficam no perfil. O userData efetivo é revalidado antes de abrir serviços. Sem override, o DEV convencional continua usando seu perfil habitual Auri-Dev. Não reutilizar dados pessoais como fixtures.

Exemplo somente para uma execução previamente autorizada, na raiz do checkout e com perfil validado:

```powershell
$env:AURI_E2E_USER_DATA = Join-Path (Get-Location) 'artifacts/e2e-profiles/<perfil-validado>'
$env:AURI_DEV_UPDATER_MOCK = '1'
$env:AURI_DEV_UPDATER_SCENARIO = 'up-to-date'
& .\node_modules\electron\dist\electron.exe .
```

Substituir o placeholder antes de usar. Depois de encerrar, remover apenas as variáveis da sessão. Nenhuma rotina E2E faz reset ou limpa o perfil automaticamente.

## Conferir Estatísticas com uma biblioteca representativa

No Windows, a instalação usa `%APPDATA%\Auri` como `userData`, e `npm run dev` usa `%APPDATA%\Auri-Dev`. Cada perfil tem seu próprio `data\library.sqlite`, preferências e capas. Para trabalhar com uma cópia da biblioteca instalada, use um perfil E2E novo, separado dos dois.

1. No Auri instalado, abra **Configurações → Backup e dados → Criar backup**. Guarde o `.auri-backup` fora do checkout e mantenha o original intacto.
2. Abra o PowerShell na raiz do Desktop. Defina um caminho de teste que ainda não exista e execute o Electron a partir do build local. Assim o aplicativo pode reiniciar após a restauração sem depender do servidor do Vite.

   ```powershell
   npm.cmd run build:app
   if ($LASTEXITCODE -ne 0) { throw 'O build do Auri falhou.' }
   $statisticsProfile = Join-Path (Get-Location) ('artifacts/e2e-profiles/statistics-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
   if (Test-Path -LiteralPath $statisticsProfile) { throw 'Escolha um perfil de teste novo.' }
   $env:AURI_E2E_USER_DATA = $statisticsProfile
   $env:AURI_DEV_UPDATER_MOCK = '1'
   $env:AURI_DEV_UPDATER_SCENARIO = 'up-to-date'
   & .\node_modules\electron\dist\electron.exe .
   ```

3. Na janela de teste, confira se a biblioteca abre vazia. Em **Configurações → Backup e dados → Escolher backup**, selecione o arquivo, confira a prévia e restaure. A restauração usa uma cópia de trabalho e preserva o diretório de backups do perfil de destino.
4. Após o reinício, abra **Estatísticas**. Para editar com recarregamento do renderer, feche a janela e execute `npm.cmd run dev` no mesmo PowerShell, com as variáveis ainda definidas. Ao terminar, feche o aplicativo e remova as variáveis da sessão com `Remove-Item Env:AURI_E2E_USER_DATA, Env:AURI_DEV_UPDATER_MOCK, Env:AURI_DEV_UPDATER_SCENARIO`.

O backup inclui o histórico, as preferências e as capas personalizadas. O cache de capas remotas é local a cada perfil. O ranking usa apenas as capas já disponíveis no perfil. Trate o perfil de teste como dados pessoais e mantenha-o fora do controle de versão.

## Integração Native Messaging disponível

O host E2E separado já existe e obtém caminhos por configuração adjacente validada, sem depender do ambiente do terminal do Desktop. A identidade/manifest são exclusivos e ele não inicia um Desktop instalado. O validador do host atualmente seleciona o perfil canônico auritest-01 desse checkout; outros perfis aceitos pelo Desktop não são automaticamente aceitos pelo host.

O host DEV convencional continua derivando Auri-Dev e não herda esse override. Não usar `dev:extension:setup` para conectar o perfil E2E. A preparação E2E não registra hosts. Procedimento de autorização, preflight, recibos e descoberta no Brave está em [native-messaging-e2e.md](native-messaging-e2e.md).

## Estado preservado após o reteste de 04/11/2026

O auritest-01 do reteste contém **26 Works sintéticas**. A fixture de progresso já foi atualizada e confirmada em **3**, com um único novo progress_update e histórico anterior preservado. O reteste funcional já foi concluído; não tratá-lo como uma tarefa futura nem presumir capítulo 2 a partir de um roteiro antigo.

Perfis Desktop/Brave, secret, backups e relatórios devem ser preservados. Novos testes unitários/processos criam raízes temporárias próprias, sem abrir esse banco. Uma futura execução real exige autorização e baseline atuais; não copiar, restaurar ou limpar o perfil para repetir um teste.
