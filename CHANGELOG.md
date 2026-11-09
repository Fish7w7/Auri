# Auri 1.15.1 — Histórias ganham vida

Esta versão substitui a 1.15.0, publicada com artefatos de uma compilação anterior.

### Novidades

- Abertura cinematográfica com opção de pular ou desativar em Aparência. A introdução respeita a preferência de movimento reduzido do sistema.
- Menu de Ações Rápidas com `Ctrl+K` para localizar obras pelo título ou nome alternativo, retomar leituras e abrir páginas e comandos pelo teclado.
- Continuar Lendo 2.0 mostra o último capítulo e a fonte usada. Abra a página salva ou escolha uma fonte alternativa.
- Estatísticas da biblioteca com filtros, gráficos por dia, semana e mês, composição por tipo e status e ranking de atividade.

### Melhorias e correções

- A ação selecionada pelo teclado permanece visível. Somente a lista de resultados rola, com a busca e os atalhos fixos.
- O ranking aproveita capas locais e em cache, carrega imagens sob demanda e mostra a inicial do título quando a capa está indisponível.
- As estatísticas ignoram alterações de progresso desfeitas.
- A extensão 0.3.2 reconhece capítulos nas URLs de leitura do ToonLivre e consulta o título da aba quando o título Open Graph traz apenas o nome da obra. A extensão confirma o progresso após reler o valor salvo no Desktop.
- O Protocol 0.2.1 usa Zod 4.6.6 e rejeita coleções acima do limite antes de validar os itens. A comunicação continua compatível com o protocolo v1.
- Atualizações de segurança e estabilidade no Electron, no processamento de imagens e na leitura dos metadados do atualizador.

Compatibilidade com schemas **1–3**, `@auri/protocol` **0.2.1**, `PROTOCOL_VERSION = 1` e Auri Extension Embedded **0.3.2**. Disponível para **Windows x64**.

# Auri 1.15.0

A publicação inicial da série 1.15 usou artefatos de uma compilação anterior. Consulte as [notas da versão 1.15.1](docs/releases/1.15.1.md).

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
