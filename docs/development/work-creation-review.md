# Revisão de possíveis obras duplicadas

## Política de identidade

O Desktop mantém Source Identity antes dos títulos. URLs/fonte confiáveis prevalecem; empates entre Works continuam ambíguos. Um único candidato possible nunca produz matched. Como Protocol 0.2.0 exige de 2 a 20 candidatos em ambiguous, uma sugestão fraca única usa not_found no wire e pode aparecer na revisão local do Desktop.

O fuzzy normaliza acentos/pontuação, remove palavras comuns e exige ao menos dois tokens relevantes em comum e Dice >= 0,6. A busca é limitada, mas não prova identidade. Creator, capa ou fuzzy isolados não autorizam associação. Não há comparação visual de capas. Traduções sem palavras/sinais em comum podem não ser descobertas automaticamente; a pesquisa manual continua disponível.

Permanecem os sinais fortes: ID externo compartilhado ou alias exato inequívoco; título exato corroborado por creator ou URL de capa, sem contradição. Um ID diferente do mesmo provider impede promoção por alias/título. ID/URL reservados não podem ser ignorados por uma confirmação de possível duplicata, inclusive ID reservado na Lixeira. Nenhuma conclusão sobre a identidade de obras reais pode ser tirada somente por essas sugestões.

A Extension aplica sua própria política conservadora para compatibilidade: matched/possible de um Desktop legado é uma sugestão, não autorização de progress.update/source.add. É permitido abrir explicitamente a possível Work para conferir no Desktop. Essa confiança de identidade é independente da confiança de extração do capítulo.

## Fluxos e revisão

Quick, Manual, URL, AniList e rascunho da Extension convergem para reviewWorkCreation e WorkCreationReview no mesmo modal.

- Sem candidatos, Quick continua simples.
- Com sugestões, a revisão mostra título, progresso e fontes; capas usam apenas dados personalizados/cache local compatível, sem busca de rede pela revisão.
- Abrir existente navega por decisão explícita.
- Adicionar como fonte exige evidência forte, única, sem conflito, Work ativa e URL válida/disponível. Requer clique explícito e não aplica o capítulo do rascunho à Work existente.
- Manter separada registra os IDs revisados e reavalia o estado antes de criar.
- Resultados de pesquisa manual não concedem permissão de vínculo.
- Voltar aos dados preserva o formulário; a trava de persistência bloqueia saída e ações duplicadas durante operação e atualização após falha.

A prévia é leitura. createWork, createDetailed, importação AniList e addReviewedSource revalidam dentro de transação IMMEDIATE. reviewedWorkIds é transitório no IPC local, sem alteração do Protocol ou persistência. Um novo candidato, alias forte, ID reservado ou fonte concorrente pode invalidar a decisão anterior.

## Rejeições concorrentes

Após qualquer rejeição de gravação, inclusive Error sem propriedades personalizadas, o modal faz nova leitura e mantém o erro original. Não analisa o texto traduzido para deduzir códigos e não repete a gravação.

Se a nova leitura falhar, confirmações e vínculos ficam bloqueados até Consultar novamente. Resultados de busca pertencem ao draft, review e query específicos; mudanças de revisão, processamento ou desmontagem invalidam respostas antigas. Uma pesquisa antiga não pode restaurar permissões removidas por uma revisão mais recente.

## Preservação e testes

Adicionar fonte pela revisão mantém progresso, histórico, metadados e fonte preferida. Nenhum desses fluxos chama merge. Protocol 0.2.0/wire 1 e schema 3 permanecem; nenhuma migration é necessária para essa revisão de cadastro.

As regressões de domínio usam SQLite em memória e valores sintéticos; incluem progressos independentes 20/14, IDs contraditórios/reservados, aliases, fonte concorrente e confirmação antiga. As regressões do modal e da Extension usam helpers/DOM simulados, sem dados pessoais ou gravações reais. Testes de versão/identidade não dependem de caminhos absolutos de máquina.

## Histórico e estado atual

A implementação foi desenvolvida no checkout íntegro `<AURI_DESKTOP_ROOT>`, mantendo as alterações locais anteriores. Os relatórios históricos de validação de duplicatas e de revisão concorrente permanecem sob artifacts, ignorados pelo Git; seus resultados não são reescritos como se pertencessem a uma nova execução.

A referência antiga a um teste procurando recovery no módulo principal é histórica: o teste atual aponta para application/startup-recovery.ts. O reteste de integração funcional no Brave já foi concluído em 04/11/2026, com quatro autenticações, reconexão após 60,017 segundos, uma atualização e read-back em 3. O perfil preservado contém 26 Works sintéticas e não deve ser reutilizado para repetir essa gravação. Ver [native-messaging-e2e.md](native-messaging-e2e.md).

A identidade das duas obras reais inicialmente relatadas pelo usuário continua sem comprovação por esta infraestrutura; nenhum merge ou ajuste de banco real é efeito destas correções. Qualquer ação futura sobre dados reais exige diagnóstico e aprovação próprios.