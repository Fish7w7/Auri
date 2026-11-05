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

## Integração Native Messaging disponível

O host E2E separado já existe e obtém caminhos por configuração adjacente validada, sem depender do ambiente do terminal do Desktop. A identidade/manifest são exclusivos e ele não inicia um Desktop instalado. O validador do host atualmente seleciona o perfil canônico auritest-01 desse checkout; outros perfis aceitos pelo Desktop não são automaticamente aceitos pelo host.

O host DEV convencional continua derivando Auri-Dev e não herda esse override. Não usar `dev:extension:setup` para conectar o perfil E2E. A preparação E2E não registra hosts. Procedimento de autorização, preflight, recibos e descoberta no Brave está em [native-messaging-e2e.md](native-messaging-e2e.md).

## Estado preservado após o reteste de 04/11/2026

O auritest-01 do reteste contém **26 Works sintéticas**. A fixture de progresso já foi atualizada e confirmada em **3**, com um único novo progress_update e histórico anterior preservado. O reteste funcional já foi concluído; não tratá-lo como uma tarefa futura nem presumir capítulo 2 a partir de um roteiro antigo.

Perfis Desktop/Brave, secret, backups e relatórios devem ser preservados. Novos testes unitários/processos criam raízes temporárias próprias, sem abrir esse banco. Uma futura execução real exige autorização e baseline atuais; não copiar, restaurar ou limpar o perfil para repetir um teste.