# Updater em desenvolvimento

Antes de iniciar, disponibilize os inputs Embedded exigidos pelo `predev`, conforme os [pré-requisitos do desenvolvimento local](browser-extension.md#desenvolvimento-local). O mock evita consultas do updater real; o Desktop continua usando os dados do ambiente `Auri-Dev`.

O updater real funciona somente no aplicativo empacotado. Para testar a tela **Configurações → Atualizações** sem rede, release ou instalador, ative o mock explicitamente no PowerShell:

```powershell
$env:AURI_DEV_UPDATER_MOCK = '1'
$env:AURI_DEV_UPDATER_SCENARIO = 'available'
npm run dev
```

Com o cenário `available`, use **Verificar atualizações**, **Baixar atualização** e **Reiniciar e instalar** na interface. A instalação final é apenas registrada como simulada e não fecha o aplicativo.

Os cenários disponíveis são:

- `up-to-date`;
- `available`;
- `download`;
- `ready`;
- `check-error`;
- `download-error`.

Se a variável de cenário for omitida ou inválida, o Auri usa `available`.

Para voltar ao desenvolvimento normal:

```powershell
Remove-Item Env:AURI_DEV_UPDATER_MOCK -ErrorAction SilentlyContinue
Remove-Item Env:AURI_DEV_UPDATER_SCENARIO -ErrorAction SilentlyContinue
```

O mock é ignorado incondicionalmente quando `app.isPackaged` é verdadeiro.

Feche completamente o Auri e inicie-o novamente após ativar, trocar ou remover essas variáveis: elas são lidas pelo processo principal durante a inicialização. Recarregar apenas a interface não troca o cenário. Nenhum Setup, blockmap ou metadado de release é gerado pelo mock; o fluxo real está descrito em [Build e publicação](release.md).
