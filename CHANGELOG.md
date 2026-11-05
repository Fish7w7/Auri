# Auri 1.14 — Integração com navegador 2.0

### Novidades

- A Auri Extension 0.3.1 agora consulta o contexto de leitura pelo novo `work.context`, incluindo progresso, status pessoal, relação com a página e um destino seguro para continuar a leitura.
- O reconhecimento entre fontes identifica obras equivalentes com sinais fortes, sem criar vínculos de fonte automaticamente.
- Duas obras confirmadas como equivalentes podem ser mescladas com uma prévia clara, escolhas para dados conflitantes e backup obrigatório antes da alteração.

### Melhorias

- O progresso enviado pelo navegador atualiza a última URL de leitura apenas quando a página pertence comprovadamente à fonte da obra.
- A Biblioteca ganhou acesso rápido à mesclagem ao selecionar exatamente duas obras, com seleção, filtros e contexto preservados.
- Os filtros da Biblioteca aplicam alterações imediatamente, exibem critérios ativos e podem ser fechados por Esc, botão ou clique fora.
- A instalação da extensão separa Store, Embedded e DEV, validando integridade, identidade e permissões do pacote Embedded 0.3.1.

### Correções

- Títulos com sufixos SEO reconhecidos não viram aliases brutos durante a mesclagem; títulos legítimos com palavras como "Online" são preservados.
- Fontes equivalentes são unidas sem perder a URL de leitura mais recente nem criar mais de uma fonte preferida.
- IDs externos contraditórios do mesmo provedor bloqueiam a mesclagem para evitar uniões incorretas.

Esta versão mantém schema **3**, suporte a schemas **1-3**, `@auri/protocol` **0.2.0**, `PROTOCOL_VERSION = 1`, Auri Extension Embedded **0.3.1** e Native Host PROD `app.auri.native_host`.

Disponível para **Windows x64**.
