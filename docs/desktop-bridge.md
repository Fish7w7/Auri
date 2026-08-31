# Desktop Bridge

O Auri Desktop expõe, somente após o `AppContext` estar pronto, um Named Pipe local autenticado. Produção usa `auri-desktop-v1-<escopo>` e desenvolvimento usa `auri-desktop-dev-v1-<escopo>`; o escopo é um hash local e não contém o nome cru do usuário.

Cada frame possui um prefixo unsigned de 4 bytes little-endian seguido por JSON UTF-8, limitado por `MAX_PROTOCOL_MESSAGE_BYTES` do `@auri/protocol`. O servidor envia um nonce novo e exige HMAC-SHA256 de `auri-bridge-v1:<serverNonce>:<clientNonce>` com o secret de 256 bits persistido em `userData/native-bridge/secret`. O secret nunca é enviado pelo pipe.

Depois do handshake, a conexão aceita múltiplos `ProtocolRequest` v1. O pipe não é uma API pública para terceiros; ele é o transporte local previsto para o futuro Auri Native Host. Node não oferece uma ACL Windows explícita e portátil para Named Pipes, portanto a Fase A combina endpoint por usuário/perfil com secret e HMAC.
