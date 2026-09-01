# Checklist de release - Auri 1.10.0

Validações já concluídas nesta linha de desenvolvimento:

- [x] Código 1.10 finalizado
- [x] Testes focados
- [x] Typecheck
- [x] Build do aplicativo
- [x] Build do Native Host
- [x] Changelog
- [x] Release notes
- [x] E2E DEV validado pelo desenvolvedor
- [x] E2E PROD local validado pelo desenvolvedor
- [x] Update real 1.9 para 1.10 validado pelo desenvolvedor
- [x] Instalador de teste validado pelo desenvolvedor

Pendências para a distribuição oficial:

- [ ] ID oficial da extensão no Edge obtido
- [ ] `AURI_EXTENSION_EDGE_ID` configurado no ambiente de release
- [ ] Dist definitivo gerado em modo release
- [ ] Manifest e origin oficial validados no Setup definitivo
- [ ] SHA-256 do Setup definitivo validado e registrado
- [ ] GitHub Release publicada
- [ ] URL pública fornecida à certificação do Edge
- [ ] Auri Extension enviada para certificação
- [ ] E2E executado com a versão publicada no Edge

O code signing ainda não está configurado. O Setup e o Native Host serão distribuídos sem assinatura nesta release e poderão acionar o Windows SmartScreen; a assinatura poderá ser adicionada posteriormente.
