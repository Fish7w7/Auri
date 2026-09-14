# Processo principal

O processo principal do Auri usa um entrypoint mínimo. `src/main/index.ts` configura o ambiente antes de qualquer acesso a dados e registra o ciclo de vida da aplicação; criação de serviços, janela, IPC e bridge acontece depois de `app.whenReady()`.

## Ordem de inicialização

1. `configureMainProcessEnvironment` identifica argumentos de execução, define a identidade do aplicativo e separa `%APPDATA%\Auri-Dev` de `%APPDATA%\Auri`. Runners automatizados recebem um `userData` temporário depois dessa separação.
2. `registerApplicationLifecycle` adquire o lock de instância única e registra uma vez os listeners de segunda instância, ativação, encerramento e fechamento de janelas.
3. `MainProcessRuntime.start` cria o `AppContext`, registra IPC, inicia tarefas em segundo plano e cria o controlador da janela principal.
4. Em execução normal, `startDesktopBridge` compõe os handlers do Protocol, carrega a identidade local e inicia o Named Pipe autenticado.
5. Em execuções de smoke, os runners são carregados dinamicamente e não participam do caminho normal de produção.

## Responsabilidades

- `application/environment.ts`: argumentos e configuração obrigatória antes do acesso a paths dependentes do Electron.
- `application/lifecycle.ts`: listeners globais do `app` e lock de instância única.
- `application/bootstrap.ts`: ownership de `AppContext`, IPC, janela e Desktop Bridge durante uma execução.
- `application/background-tasks.ts`: disparo do backup automático e da verificação do updater.
- `application/startup-recovery.ts`: diálogos de recuperação de banco, schema e atualização compatível.
- `windows/main-window-controller.ts`: posse da `BrowserWindow` e associação com close-to-tray.
- `windows/create-main-window.ts`: opções seguras da janela, preload e carregamento do renderer.
- `windows/window-activation.ts`: restauração, foco e fallback de foreground no Windows.
- `windows/window-tray-controller.ts`: hide, close-to-tray, menu e quit.
- `bridge/desktop-bridge.ts`: composição e lifecycle do `ProtocolDispatcher` e `NamedPipeBridgeServer`.
- `smoke/`: fixtures e automações executadas somente pelos argumentos de teste correspondentes.

## Ownership e encerramento

`MainProcessRuntime` possui uma única referência para cada recurso de runtime. No `before-quit`, ele fecha o bridge, marca o controlador de tray como encerrando, remove os handlers IPC, descarta o `AppContext` e destrói o tray. O método é idempotente para evitar cleanup duplicado.

A segunda instância nunca cria outra janela. Argumentos de inicialização silenciosa do Native Bridge não ativam a interface; uma abertura comum restaura a janela existente. O fluxo interativo `desktop.openAddWork` continua usando a ativação reforçada do Windows, enquanto notificações silenciosas não solicitam foco.

## Limites preservados

O bootstrap não altera contratos de IPC, Protocol, Native Host, schema ou formatos persistidos. O Desktop Bridge mantém framing, autenticação e capabilities nos módulos existentes. Updater e backup continuam serviços do `AppContext`; o bootstrap apenas dispara as tarefas que já pertenciam ao startup.
