# Auri

O **Auri** é um aplicativo para Windows para organizar manhwas, mangás, webtoons, novels e outras obras seriadas em uma biblioteca local.

Acompanhe seu progresso, organize obras, reúna suas fontes de leitura e retome rapidamente de onde parou — sem precisar criar uma conta.

Ele foi pensado para quem acompanha obras em diferentes sites e quer manter títulos, capítulos, notas e links reunidos em uma biblioteca própria.

> **Local-first:** sua biblioteca, progresso, notas e preferências ficam no seu computador.

[Baixar Auri](https://github.com/Fish7w7/Auri/releases)

## O que você pode fazer

- organizar obras como **Lendo**, **Quero ler**, **Pausado**, **Esperando**, **Finalizado** ou **Abandonado**;
- atualizar o capítulo atual, desfazer uma alteração e consultar o histórico de progresso;
- retomar leituras recentes diretamente pela Home;
- pesquisar por título, nome alternativo, autor, criador ou fonte, além de combinar filtros e ordenações;
- usar favoritos, tags e coleções para organizar a biblioteca;
- cadastrar várias fontes para uma obra e escolher uma como preferida;
- adicionar notas e usar capas obtidas da web ou imagens do computador;
- selecionar várias obras para ações em lote;
- mover itens para a Lixeira, restaurá-los e usar atalhos nas ações frequentes.

## Auri no navegador

A **Auri Extension** conecta páginas de leitura ao Auri Desktop por comunicação local em navegadores Chromium compatíveis. Ela pode:

- reconhecer uma obra e mostrar seu progresso;
- abrir a obra no Auri;
- adicionar uma obra ou uma nova fonte;
- atualizar o capítulo atual.

A extensão é opcional e instalada separadamente. O Auri Desktop continua funcionando normalmente sem ela, e a integração não depende de conta ou nuvem. As funções exigem a Auri Extension e o Auri Desktop 1.10.0 ou uma versão posterior compatível.

Quando a página corresponde a uma obra ou fonte cadastrada, a extensão apresenta as informações da biblioteca e as ações disponíveis. Para conteúdo ainda não cadastrado, ela inicia o fluxo no Desktop para que você revise os dados antes de salvar.

Toda a comunicação dessa integração acontece no próprio computador entre o navegador e o aplicativo.

## Adicione obras do seu jeito

O Auri oferece três caminhos:

1. **AniList:** procure pelo título, confira o resultado e escolha os dados que deseja importar.
2. **URL:** cole o endereço da página onde você lê e revise as informações que o site disponibiliza.
3. **Manual:** informe apenas o título para começar ou preencha todos os detalhes que quiser.

Nenhum resultado externo é salvo sem sua confirmação. Quando uma busca ou um site fornece apenas dados parciais, o Auri mantém a revisão sob seu controle para que você possa completar ou corrigir as informações.

## Seus dados ficam com você

O Auri mantém a biblioteca no seu computador:

- não é necessário criar uma conta;
- os dados armazenados da biblioteca continuam acessíveis offline;
- o AniList só é consultado quando você solicita uma busca ou atualização de metadados;
- não há sincronização automática com serviços em nuvem;
- capas já armazenadas e imagens personalizadas continuam disponíveis sem conexão.

Em **Configurações → Backup e dados**, você pode:

- criar backups completos no formato `.auri-backup` e restaurar backups legados `.lumi-backup`;
- configurar backups automáticos;
- exportar a biblioteca em JSON ou gerar um resumo em CSV;
- importar uma biblioteca com uma prévia das alterações.

Esses recursos ajudam a proteger a biblioteca, revisar uma importação antes de aplicá-la e levar os dados para outra instalação quando necessário.

## Instalação

O Auri está disponível para **Windows x64**.

1. Acesse [Releases do Auri](https://github.com/Fish7w7/Auri/releases).
2. Baixe `Auri-Setup-<versão>-x64.exe` na versão desejada.
3. Execute o instalador e siga as instruções.

O instalador ainda não possui assinatura digital, portanto o Windows SmartScreen pode exibir um aviso. Antes de continuar, confirme que o arquivo veio do GitHub oficial do Auri; não é necessário desativar as proteções do Windows.

## Primeiros passos

1. Abra **Biblioteca** e selecione **Adicionar obra**.
2. Escolha AniList, URL ou cadastro manual.
3. Defina o status e o capítulo atual.
4. Adicione a fonte onde você lê para voltar a ela rapidamente.
5. Use a Home para retomar suas leituras.
6. Em **Configurações → Backup e dados**, crie sua primeira cópia de segurança.

As opções de aparência, biblioteca, atualizações, atalhos e manutenção também ficam em **Configurações**.

## Limitações atuais

- a distribuição oficial está disponível apenas para Windows x64;
- não há sincronização entre dispositivos;
- o AniList pode não reconhecer alguns títulos em português; nesses casos, tente o título em inglês, romanizado ou original;
- sites que carregam dados por JavaScript podem fornecer poucas informações no cadastro por URL.

## Desenvolvimento

O Auri usa Electron, React, TypeScript e SQLite. Para executar o projeto, é necessário ter **Node.js 22.12 ou mais recente**.

```bash
npm install
npm run dev
```

Comandos úteis:

```bash
npm test                  # executa os testes
npm run typecheck         # verifica os tipos
npm run build:app         # compila o aplicativo
npm run build:native-host # gera o Native Host
npm run dist              # gera o instalador sem publicar
```

Os testes usam dados temporários e não acessam a biblioteca real do usuário. Para simular o updater ou preparar uma publicação, consulte a documentação de desenvolvimento.

## Documentação

Guias de arquitetura, desenvolvimento e releases estão no [índice de documentação](docs/README.md).
