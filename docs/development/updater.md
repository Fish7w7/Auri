# Updater em desenvolvimento

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
