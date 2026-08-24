# Auri

O **Auri** é um aplicativo para Windows que ajuda você a organizar manhwas, mangás, webtoons, novels e outras obras seriadas em um só lugar.

Registre o que está lendo, salve o capítulo em que parou, reúna seus sites preferidos e encontre rapidamente a próxima obra que quer continuar. A biblioteca funciona localmente e não exige conta.

## O que você pode fazer

* organizar obras por status, como **Lendo**, **Quero ler**, **Pausado**, **Esperando**, **Finalizado** e **Abandonado**;
* atualizar o capítulo atual e desfazer uma alteração de progresso;
* continuar leituras recentes diretamente pela Home;
* pesquisar por título, nome alternativo ou autor;
* usar filtros, ordenação, favoritos, tags e coleções;
* guardar notas, o ponto exato onde parou e o histórico de leitura;
* cadastrar vários sites para a mesma obra e escolher uma fonte preferida;
* usar capas obtidas da web ou escolher uma imagem do computador;
* mover itens para a Lixeira e restaurá-los quando necessário;
* selecionar várias obras e realizar ações em lote;
* usar atalhos de teclado para as ações mais frequentes.

## Adicione obras do seu jeito

O Auri oferece três caminhos:

1. **Buscar no AniList:** procure a obra, confira os dados encontrados e escolha o que deseja importar.
2. **Adicionar por URL:** cole o endereço da página onde você lê e revise as informações detectadas.
3. **Adicionar manualmente:** informe somente o título ou preencha quantos detalhes quiser.

Nenhum resultado externo é salvo sem a sua confirmação. Se um site não disponibilizar informações confiáveis, o Auri apresenta os dados parciais para que você possa completá-los manualmente.

## Seus dados ficam com você

O Auri é **local-first**: sua biblioteca, progresso, notas e preferências ficam no seu computador.

* não é necessário criar uma conta;
* a Biblioteca não depende de internet para funcionar;
* o AniList só é consultado quando você inicia uma busca ou atualização de metadados;
* não há sincronização automática da sua biblioteca com serviços externos;
* capas já armazenadas e imagens personalizadas continuam disponíveis offline.

Para proteger ou transportar seus dados, o aplicativo permite:

- criar backups completos no formato `.auri-backup` e restaurar também backups legados do Lumi no formato `.lumi-backup`;
- configurar backups automáticos;
- exportar a biblioteca em JSON;
- gerar um resumo em CSV;
- importar novamente uma biblioteca com uma prévia das alterações.

## Instalação no Windows

O Auri está disponível para **Windows 64 bits**.

1. Acesse a página de [Releases do Auri](https://github.com/Fish7w7/Auri/releases).
2. Baixe o arquivo `Auri-Setup-<versão>-x64.exe` da versão desejada.
3. Execute o instalador e siga as instruções.

O instalador ainda não possui assinatura digital. Por isso, o Windows SmartScreen pode exibir um aviso. Antes de continuar, confirme que o arquivo foi baixado da página oficial acima. Não é necessário desativar as proteções do Windows.

## Primeiros passos

1. Abra **Biblioteca** e selecione **Adicionar obra**.
2. Escolha busca no AniList, cadastro por URL ou cadastro manual.
3. Defina o status e o capítulo atual.
4. Adicione o site onde você lê para voltar a ele rapidamente.
5. Consulte a Home para retomar suas leituras.
6. Em **Configurações → Backup**, crie sua primeira cópia de segurança.

As opções de aparência, biblioteca, atualizações, atalhos e manutenção também ficam em **Configurações**.

## Limitações atuais

* há distribuição oficial apenas para Windows x64;
* não existe sincronização entre computadores ou celulares;
* a busca do AniList pode não reconhecer alguns títulos em português — nesses casos, tente o título em inglês, romanizado ou original;
* alguns sites carregam informações somente por JavaScript e podem fornecer poucos dados ao cadastro por URL.

## Desenvolvimento

Esta seção é destinada a quem deseja executar ou contribuir com o projeto.

O Auri usa Electron, React, TypeScript e SQLite. É necessário ter **Node.js 22.12 ou mais recente**.

```bash
npm install
npm run dev
```

Comandos principais:

```bash
npm test          # executa os testes
npm run typecheck # verifica os tipos
npm run build     # valida e compila o aplicativo
npm run dist      # gera o instalador Windows sem publicar
```

Os testes e smokes usam dados temporários e não acessam a biblioteca real do usuário.

<details>
<summary>Detalhes técnicos e publicação para mantenedores</summary>

O Renderer é isolado do Node e acessa as operações permitidas por uma API tipada no Preload. O processo Main valida as entradas, aplica as regras de domínio e persiste os dados em SQLite. No Windows, os dados do aplicativo ficam em `%APPDATA%\Auri`. Backups legados `.lumi-backup` podem ser restaurados manualmente após a instalação limpa.

O `package.json` é a fonte da versão. `npm run dist` e `npm run dist:dir` nunca publicam artefatos.

Para preparar uma release, valide a versão, faça o commit e crie uma tag com o mesmo número prefixado por `v`. Em um ambiente Windows x64, forneça `GH_TOKEN` somente como variável de ambiente ou segredo do CI e execute:

```bash
npm run release:win
```

Esse comando envia o instalador, o blockmap e o `latest.yml` para uma release em estado **draft**. Revise tudo no GitHub e publique a release manualmente. Nunca grave o token no repositório, no `package.json` ou em arquivos `.env`.

</details>
