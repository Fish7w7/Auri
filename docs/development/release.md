# Build e publicação

O `package.json` é a fonte da versão do Auri. Os comandos `npm run dist` e `npm run dist:dir` geram artefatos locais e nunca os publicam.

## Native Host de produção

Antes de empacotar, configure as origins oficiais da Auri Extension conforme a seção [Production Native Messaging](../architecture/desktop-bridge.md#production-native-messaging). Esse guia concentra as variáveis aceitas, o comportamento fail-closed do manifest, os modos PROD/DEV, a instalação e o registro do Native Host.

## Publicação

Antes de publicar:

1. valide a versão definida no `package.json`;
2. faça o commit da release;
3. crie uma tag com o mesmo número prefixado por `v`;
4. em um ambiente Windows x64, forneça `GH_TOKEN` somente como variável de ambiente ou segredo do CI;
5. execute `npm run release:win`.

O comando executa as validações, prepara o Native Host, gera os artefatos e os envia para uma release em estado **draft**. Revise o instalador, o blockmap e o `latest.yml` no GitHub antes de publicar a release manualmente.

Nunca grave o token no repositório, no `package.json` ou em arquivos `.env`.
