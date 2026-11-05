# Preparação e publicação segura do Native Host

O script build-native-host.mjs separa a geração do bundle/SEA da preparação do executável e da publicação. Não registra Native Messaging nem instala o aplicativo.

## Arquivos e publicação

- Diretórios devem ser absolutos, canônicos e sem links. No Windows, há inspeção explícita de FileAttributes.ReparsePoint; se essa inspeção não estiver disponível, a operação falha fechada.
- Destino existente é inspecionado com lstat: symlink/junction, reparse point, tipo inesperado ou nlink diferente de 1 são recusados sem remoção.
- Um arquivo regular anterior é válido para inspeção, mas **não é automaticamente substituído**. As APIs portáteis usadas não fornecem compare-and-swap sobre a identidade validada do arquivo no Windows. Checar e depois copiar/renomear com overwrite não elimina essa corrida.
- Cada preparação usa diretório temporário exclusivo sob a saída validada. A cópia usa COPYFILE_EXCL; postject escreve somente nesse temporário, nunca no destino publicado.
- Após preparar, validar novamente a propriedade do temporário e, em PROD, verificar conteúdo proibido antes de publicar.
- A publicação usa hard link com criação exclusiva do nome de destino, no mesmo volume. Um arquivo/link concorrente criado depois do último preflight causa falha, sem sobrescrevê-lo. Não há fallback para copy ou rename com overwrite. Filesystem sem suporte a hard links falha fechado.
- Depois do sucesso, remove-se apenas o nome temporário cuja identidade foi comprovada. Temporários de falha ou propriedade divergente são preservados para inspeção; não há remoção recursiva de árvores existentes.

O script aceita um diretório alternativo novo sob artifacts/native-host/candidates:

```text
node scripts/build/build-native-host.mjs --mode=e2e --output-directory=artifacts/native-host/candidates/<novo-id>
```

Substituir o placeholder. PROD/DEV usam os respectivos modos, sem mudança de identidade. O destino padrão continua sendo o caminho esperado pelo pipeline, mas um binário anterior é preservado e impede nova publicação automática nesse nome.

## Limitação deliberada para rebuild/release

Um candidato novo **não altera automaticamente** extraResources, o binário registrado ou uma instalação. A promoção para um caminho já existente exige uma etapa separada, revisada e autorizada, com destino anterior preservado e política de substituição apropriada ao Windows. Não apagar ou mover arquivos suspeitos para fazer o comando passar.

Não usar dist com um candidato não promovido: o empacotamento poderia consumir o binário antigo do caminho padrão. release:win para quando o build padrão recusa um destino anterior; isso é uma proteção, não autorização para limpar arquivos. A organização/publicação da release deve incluir a decisão explícita sobre a promoção do candidato.

## Testes

native-host-output.test.ts usa somente diretórios/sentinelas novos e callbacks sintéticos de preparação. Cobre destino inexistente, regular anterior preservado, links, tipos inválidos, falhas, corridas no nome final e postject limitado ao temporário. Não roda contra binários oficiais ou perfis E2E preservados.

Para validar o runtime alterado, um build E2E pode ser feito em um candidato novo e passado aos testes de processo por AURI_E2E_TEST_HOST_BINARY. O binário/configuração E2E anterior e os ZIP/metadata Embedded oficiais permanecem intactos.