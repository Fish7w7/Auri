# Build e publicação

O `package.json` é a fonte da versão do Auri. Os comandos `npm run dist` e `npm run dist:dir` geram artefatos locais e nunca os publicam.

## Native Host de produção

As origins oficiais Edge + Embedded estão fixadas na configuração versionada da 1.12.0. Não configure IDs Chrome/Brave de loja. Veja [Production Native Messaging](../architecture/desktop-bridge.md#production-native-messaging) e [pacote Embedded](browser-extension.md) para validação dos inputs, extraResources e segurança.

## Validação local da 1.12.0

Prepare os inputs com `npm run prepare:browser-extension`, execute os testes focados das áreas alteradas, depois `npm run typecheck`, `npm run build:app` e `npm run build:native-host`. Por último execute `npm run dist` uma vez. O hook beforePack repete a validação fechada dos inputs e materializa o include NSIS oficial. Inspecione o Setup sem executá-lo; valide arquivos Embedded/Native Host, hashes, blockmap, latest.yml, compatibility e assinaturas antes de considerar publicação. Não é necessário instalar, registrar o Native Host ou alterar dados locais para essa validação.

## Publicação

Antes de publicar:

1. valide a versão definida no `package.json`;
2. faça o commit da release;
3. crie uma tag com o mesmo número prefixado por `v`;
4. em um ambiente Windows x64, forneça `GH_TOKEN` somente como variável de ambiente ou segredo do CI;
5. execute `npm run release:win`.

O comando executa as validações, prepara o Native Host, gera os artefatos e os envia para uma release em estado **draft**. Revise o instalador, o blockmap e o `latest.yml` no GitHub antes de publicar a release manualmente.

Nunca grave o token no repositório, no `package.json` ou em arquivos `.env`.
