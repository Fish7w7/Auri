# Documentação do Auri

Este índice reúne os guias mantidos no repositório. A versão em desenvolvimento do Desktop é **1.14.0**, com **Auri Extension Embedded 0.3.0**, schema **3** e compatibilidade com schemas **1–3**.

As fontes dessas informações são o [package.json](../package.json), a [configuração Embedded](../build/browser-extension.config.json) e a [compatibilidade de schema](../schema-compatibility.json).

## Por onde começar

- Para conhecer e instalar o aplicativo, veja o [README principal](../README.md).
- Para executar o projeto, confira os [pré-requisitos e o fluxo de desenvolvimento](development/browser-extension.md#desenvolvimento-local).
- Para instalar a extensão pelo Desktop, veja o [guia de instalação](development/browser-extension.md#instalação-pelo-desktop).

## Arquitetura

- [Processo principal](architecture/main-process.md): bootstrap, lifecycle, janela, tray, bridge, ambientes e shutdown.
- [Desktop Bridge](architecture/desktop-bridge.md): Named Pipe autenticado, Native Host e fluxos PROD/DEV.

## Desenvolvimento

- [Updater em desenvolvimento](development/updater.md): simulação local dos estados de atualização.
- [Extensão do navegador](development/browser-extension.md): pacote oficial, instâncias existentes, navegação manual, IPC e separação PROD/DEV.
- [Build e publicação](development/release.md): preparação, empacotamento local, auditoria, limpeza de outputs e publicação.

## Releases

- [Auri 1.14.0](releases/1.14.0.md): integração com navegador 2.0, contexto de leitura, reconhecimento entre fontes e mesclagem de obras.
- [Auri 1.13.0](releases/1.13.0.md): Home personalizável, coleções fixadas, Recentes e busca rápida global.
- [Auri 1.12.0](releases/1.12.0.md): extensão incluída, instalação guiada e uso da instância existente do navegador.
- [Releases no GitHub](https://github.com/Fish7w7/Auri/releases): consulte os arquivos e as notas disponibilizados em cada release.

As notas descrevem o comportamento da versão; não comprovam a publicação nem identificam um Setup por hash. A conferência de um instalador deve usar os bytes do arquivo correspondente, conforme o [guia de auditoria](development/release.md#conferência-do-artefato).
