# Lumi Desktop

Aplicativo desktop local-first para organizar manhwas e outras obras seriadas, com metadados opcionais do AniList, cache seguro de capas e portabilidade completa dos dados.

## Interface

- shell persistente com sidebar compactável, rotas locais e contadores da biblioteca;
- Home orientada à retomada de leitura, com seções ocultadas quando não há conteúdo;
- Biblioteca com busca por título, alias e autor, filtros combináveis, ordenação, grade/lista e tamanhos de cartão persistidos;
- renderização virtualizada para bibliotecas extensas;
- ações rápidas reais para favoritar, avançar capítulo, desfazer progresso e mover para a lixeira;
- lixeira com restauração e exclusão permanente confirmada;
- configurações locais em `settings.json`, separadas do banco SQLite;
- estados de carregamento, vazio e erro, diálogos acessíveis e notificações com ação.
- cadastro rápido e cadastro manual organizado em seções, exigindo apenas o título;
- página `/work/:id` com detalhes, progresso, histórico, notas, fontes e organização;
- edição atômica de metadados, aliases, creators e gêneros, com detecção de alterações não salvas;
- tags pessoais e associações a coleções, incluindo criação de coleção a partir da obra;
- fontes múltiplas, preferência exclusiva, arquivamento, indisponibilidade e exclusão permanente;
- capas por URL e capas personalizadas copiadas para assets internos controlados pelo Lumi.
- busca de obras no AniList com debounce, revisão antes da importação e fallback completo para cadastro manual;
- detecção de duplicatas por external ID, Lixeira, título e aliases;
- atualização manual com preview, preservando todos os campos editados pelo usuário;
- selects próprios acessíveis nos formulários, dialogs, Biblioteca e página da obra.
- backups `.lumi-backup` manuais e automáticos, restauração validada e cópias especiais antes de restore/import;
- exportação aberta em JSON, resumo CSV e importação transacional com preview de conflitos.
- tela de atualizações com verificação, download, progresso, release notes e instalação protegida quando a build possui provider publicado;
- migrations futuras protegidas por backup `before_migration`, execução atômica e recusa de schemas mais novos.

AniList é o primeiro `MetadataProvider` e fornece somente dados públicos. O SQLite permanece como source of truth: abrir uma obra nunca consulta o provider, e não existe atualização massiva ou automática. MangaDex, login/sincronização AniList, scraping e importação de listas não fazem parte desta versão.

## Estado do domínio

O banco está no **schema 1**, criado incrementalmente pela migration `001_initial_schema`:

- `works`, `aliases`, `external_refs` e `work_creators`;
- `genres`/`work_genres` e `tags`/`work_tags`;
- `collections`/`collection_items`;
- `sources` e índice parcial que garante uma fonte preferida por obra;
- `reading_history`, incluindo snapshots de fontes e referência de undo;
- `metadata_overrides`;
- índices locais para título, status, fontes, histórico e relações.

O domínio implementa criação e edição detalhada de obras, progresso textual ou numérico, confirmação explícita de regressão, histórico e undo, fontes múltiplas, aliases, creators, gêneros, tags, coleções, metadata overrides, external refs, importação/refresh manual, soft delete, restauração, exclusão permanente e busca local por título/alias/creator.

## Arquitetura

- Electron com `nodeIntegration: false`, `contextIsolation: true` e `sandbox: true`;
- Renderer React sem acesso a Node, filesystem ou SQLite;
- API mínima e tipada em `window.lumi`, sem exposição genérica do IPC;
- Zod validando entradas no Main antes dos services/repositories;
- SQL centralizado em repositories;
- regras e transactions centralizadas em services; `WorkDetailsService` coordena relações e edições atômicas sem transformar `WorkService` em um objeto monolítico;
- `AssetService` importa capas locais para `assets/covers/custom/`, atualiza o banco antes de remover o asset anterior e só devolve imagens controladas como data URL;
- `MetadataService` isola providers do restante do domínio; `AniListProvider` normaliza e valida GraphQL sem expor tipos externos ao Renderer;
- `CoverService` usa a camada `net` do Electron no Main, limita downloads a 10 MB/15 s, valida bytes e dimensões com Sharp e produz WebP 300×450 com qualidade 80;
- capas remotas são carregadas sob demanda pelos cards virtualizados, com fila de quatro jobs, deduplicação e cache derivável em `cache/covers/`; o Renderer recebe apenas data URLs locais;
- cache remoto é descartável e pode ser limpo nas Configurações sem alterar a URL ou os dados da obra; capas customizadas continuam permanentes e prioritárias;
- `ExternalNavigationService` permite somente URLs `http:` e `https:` antes de delegar a abertura ao Main;
- erros de domínio tipados, sem mensagens SQLite cruas no Renderer;
- logging estruturado sem payloads da biblioteca.
- `BackupService` usa snapshot online do SQLite, SHA-256, staging e ZIP com limites/path traversal bloqueado; cache e logs ficam fora, assets permanentes entram;
- `TransferService` exporta o domínio sem expor rows SQL e mescla JSON de forma transacional, priorizando IDs externos e preservando conflitos sem decisão explícita.
- `UpdateService` mantém estado tipado do `electron-updater`, desativa instalação implícita ao fechar e respeita edições sujas e o coordenador de operações críticas.

## Comandos

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run test:smoke
npm run test:visual
npm run test:backup-smoke
npm run build:app
npm run dist:dir
npm run dist
```

## Fluxo de camadas

```text
Renderer → Preload/Lumi API → IPC → Services → Repositories → SQLite
```

Dados persistentes são resolvidos a partir de `app.getPath('userData')`. No Windows, a versão final usa `%APPDATA%/Lumi`, com o banco em `data/library.sqlite`.

Testes automatizados usam SQLite em memória e diretórios temporários. O smoke test redireciona `userData` para `lumi-smoke-test` e percorre os fluxos locais, além de validar provider, importação atômica e cache WebP com fixtures determinísticas. O teste visual usa `lumi-screenshot-test` e gera capturas em `artifacts/`. Nenhum deles utiliza a biblioteca real ou a rede.

Sem internet, a biblioteca, o progresso, o histórico, os metadados importados, as capas customizadas e as thumbnails já cacheadas continuam disponíveis. Um cache miss remoto volta ao placeholder e não interfere no uso do restante do app.
