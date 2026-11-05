# Native Messaging E2E isolado

## Escopo e identidades

Brave com perfil próprio → Extension `e2e-native` → `app.auri.native_host.e2e` → bridge autenticado do Desktop unpackaged com `AURI_E2E_USER_DATA`.

PROD (`app.auri.native_host`), DEV (`app.auri.native_host.dev`) e E2E têm identidades distintas. O E2E usa o prefixo de pipe DEV e o hash do caminho canônico do perfil, com secret próprio. Não há mudança de Protocol, HMAC, nonces ou framing. O timeout de ociosidade do Desktop permanece em 60 segundos.

A entrada `src/native-host/e2e-index.ts` exige `e2e-config.json` adjacente e origin exata do chamador em `argv[2]` do executável SEA. A configuração admite somente version=1, projectRoot, userDataPath e extensionId. O perfil aceito pelo host é `<AURI_DESKTOP_ROOT>/artifacts/e2e-profiles/auritest-01`. Não consulta APPDATA nem inicia um Desktop instalado. Falha de configuração não autoriza fallback PROD/DEV.

Configuração, perfil e secret são revalidados antes das operações. A validação rejeita escapes, junctions/symlinks, arquivos compartilhados por hard link e backup externo nas settings existentes. O log E2E fica em `<perfil>/logs/native-host-e2e.log`; o secret em `<perfil>/native-bridge/secret`. O host não abre SQLite.

A Extension usa somente a chave **pública** em `config/e2e-extension.json`, com identidade distinta de Store, Embedded e DEV. A preparação compara exatamente a versão declarada em package.json, no manifest fonte e no bundle E2E, incluindo version_name. Aceita a próxima versão declarada válida, sem fixar 0.3.0 e sem comparação por prefixo/coerção. Nome, chave, permissões e host continuam estritos.

## Procedimento reutilizável — não executar automaticamente

1. Obter autorização para a execução pretendida. Conferir fontes, versões e hashes dos artefatos necessários. Não repetir builds sem necessidade.
2. Conferir caminhos canônicos, ausência de links e propriedade dos perfis. Registrar baseline readonly do banco sintético, do secret e dos backups. Não assumir uma quantidade de Works ou capítulo inicial a partir de um roteiro antigo.
3. Iniciar apenas o Desktop unpackaged com o override validado e confirmar userData, schema e bridge antes de qualquer gravação. Não usar `dev:extension:setup` nesse perfil.
4. Iniciar somente o Brave com user-data-dir E2E explícito, preservando o Brave Default. O usuário confirma Profile Path, extensão E2E, ID, permissões e recarregamento do build. Não carregar a variante Embedded nesse perfil por engano.
5. Conferir a identidade da Work antes de permitir gravações. A Extension não usa `matched/possible` como autorização de identidade, inclusive no fallback legado. Sugestões podem ser abertas explicitamente no Desktop para conferência.
6. Cada cenário de escrita precisa de fixture sintética e estado inicial autorizados. Não reutilizar uma fixture já atualizada como se estivesse no capítulo anterior, não fazer reset/restore e não repetir update automaticamente quando a entrega for incerta.
7. Depois de progress.update, confirmar pelo read-back. Se work.context não for anunciado, work.resolve precisa retornar matched, mesmo Work ID, confiança exact/high e capítulo equivalente. Divergência ou confiança insuficiente não produzem sucesso.
8. Encerrar somente processos identificados como E2E; comparar banco, histórico, fonte e todos os registros protegidos com o baseline. Preservar perfis, secret, backups e evidências.

Para testar idle, manter o mesmo popup/host e comprovar `bridge.connection_closed` nos logs após aproximadamente 60 segundos, sem usar apenas a duração de uma espera. Somente depois solicitar um clique. Nova operação pode autenticar uma conexão nova; comando potencialmente enviado não pode ser repetido automaticamente.

## Builds e preparação

Os comandos abaixo são referências para uma etapa autorizada, após substituir os placeholders. Não instalar dependências ou registrar hosts como efeito colateral.

Extension: `node node_modules/vite/bin/vite.js build --mode e2e-native` gera a variante em artifacts/e2e-native.

Desktop: `node scripts/build/build-native-host.mjs --mode=e2e` publica no destino padrão **somente se ainda não existir**. Se houver binário anterior, ele é preservado e o build falha fechado. Para uma compilação adicional, usar um diretório novo sob artifacts/native-host/candidates com `--output-directory`. Ver [publicação segura do binário](native-host-build.md).

O preparador `node scripts/dev/prepare-native-host-e2e.mjs '<AURI_EXTENSION_ROOT>'` gera somente configuração, manifest e plano sob artifacts/native-host/e2e, quando todos os pré-requisitos forem válidos. Não sobrescreve arquivos anteriores, não registra hosts e não inicia aplicativos. Um candidato de build não é promovido automaticamente para o diretório preservado; qualquer promoção exige revisão própria. Não rodar esse preparador sobre as configurações já preservadas sem um plano explícito.

## Descoberta no Brave e registro temporário

Em 04/11/2026, neste ambiente Windows, somente a árvore BraveSoftware não foi suficiente: o Brave retornou `Specified native messaging host not found.` A descoberta funcionou após criar também uma entrada **exclusivamente E2E** na árvore Google/Chrome, com o mesmo manifest e origin. Isso não diagnostica nem autoriza mudanças em PROD/DEV e não deve ser generalizado automaticamente para instalações oficiais.

Os caminhos usados naquele teste foram:

- `HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\app.auri.native_host.e2e`
- `HKCU\Software\Google\Chrome\NativeMessagingHosts\app.auri.native_host.e2e`

Um perfil separado do navegador não isola HKCU. Antes de qualquer registro futuro, exigir autorização explícita para a execução e para os caminhos exatos. Revalidar hashes/identidades; fazer preflight de cada caminho E2E em HKCU/HKLM, visões 32/64; abortar se algum já existir; criar sem overwrite e proteger contra criação concorrente. Fazer read-back REG_SZ e manter comprovantes independentes de propriedade, visão, escopo, hash, conteúdo e timestamp.

Na remoção, conferir cada comprovante e a chave inteira novamente. Se algo divergir, preservar e informar. Nunca reutilizar recibos de outra execução ou apagar chaves PROD/DEV. O módulo versionado tem apenas planos puros, historicamente limitados ao ramo BraveSoftware; não é um executor de Registry nem prova de descoberta. A lista de dois caminhos acima deve integrar o plano específico autorizado quando se desejar reproduzir o ambiente observado.

## Testes automatizados e acessibilidade

Testes de configuração e binário usam raízes sintéticas independentes por caso, com secret, pipe e baseline de log próprios. Não usam o perfil preservado do checkout. O nome auritest-01 dentro dessas raízes novas é requisito do validador, não reutilização dos dados do perfil preservado.

`AURI_E2E_TEST_HOST_BINARY` permite apontar os testes para um novo AuriNativeHostE2E.exe sob artifacts/native-host/candidates. Cada caso copia esse candidato para sua própria fixture. Configuração ausente, perfil inválido e origin incorreta comprovam ausência de log novo; a preservação de log prévio é testada com baseline criado explicitamente pelo próprio caso. Os testes podem ser executados individualmente.

Os testes React/DOM da Extension usam transporte simulado. O feedback mantém uma região role=status anterior à ação, aria-live=polite e aria-atomic=true, sem aria-busy bloquear seus estados transitórios. Isso verifica DOM/estados, não anúncios de NVDA/JAWS. Leitor de tela real continua pendente. Não repetir gravações reais só para observar estados transitórios.

## Histórico de execução — não é um roteiro para repetir

O reteste funcional no Brave em 04/11/2026 foi concluído: **4 autenticações**, encerramento ocioso após **60,017 s**, nova autenticação antes do único **progress.update**, read-back, capítulo **3** persistido, histórico sem duplicação, reabertura e desconexão/reconexão. As duas chaves temporárias foram removidas com comprovantes independentes e verificação de ausência. Isso não autoriza novo registro.

O perfil preservado auritest-01 contém **26 Works sintéticas**. A fixture de progresso daquele reteste está em **3**, não em 2. Não alterá-la nem criar outra Work automaticamente. Preservar o banco, os históricos, os backups e o secret.

Evidência local histórica, ignorada pelo Git: `artifacts/brave-reconnect-final-20261104/RELATORIO.md`. Relatórios e hashes de execuções anteriores não são reescritos quando o código ou um candidato novo muda. Identificar os artefatos de cada execução pelo seu próprio relatório.