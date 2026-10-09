# Publicação de testes na Vercel

A versão original persistia tudo em `data/ubs.sqlite`. Esse arquivo fica fora do Git e não é um banco persistente compartilhado nas funções da Vercel. Login e cadastro dependem do banco; publicar somente o frontend e a API não disponibiliza os usuários de demonstração.

Agora a aplicação mantém SQLite local no desenvolvimento e usa **Turso com engine libSQL** quando `TURSO_DATABASE_URL` está definida. O cliente usado é `@libsql/client`; escolha um banco compatível com libSQL, não a nova engine Turso que requer outro SDK.

## 1. Preparar o banco

Crie um banco Turso/libSQL e obtenha a URL e um token com permissão de escrita. No computador, crie `.env.turso.local` na raiz do projeto:

```dotenv
TURSO_DATABASE_URL=libsql://seu-banco.turso.io
TURSO_AUTH_TOKEN=seu-token
```

Esse arquivo está ignorado pelo Git. Não envie o token por mensagens nem o coloque no código. Os comandos abaixo carregam esse arquivo explicitamente e recusam banco local, evitando inicializar o arquivo errado:

```bash
npm ci
npm run db:seed:remote
npm run db:check:remote
```

O seed cria as tabelas e os dados fictícios numa transação em lote. Execute antes de liberar o autocadastro. Se já houver usuários, o seed preserva a base inteira; não adiciona contas de demonstração a uma base existente. A verificação mostra conexão e quantidades de usuários/coordenadores, sem imprimir credenciais. Ela inicializa o esquema se ainda não existir, mas não cria usuários.

Os dados do arquivo SQLite local não são enviados automaticamente ao banco remoto. Esta publicação começa com uma base de demonstração independente.

## 2. Configurar a Vercel

Em **Project → Settings → Environment Variables**, adicione ao ambiente **Production**:

| Variável             | Valor                                          |
| -------------------- | ---------------------------------------------- |
| `TURSO_DATABASE_URL` | URL do banco criado                            |
| `TURSO_AUTH_TOKEN`   | Token de escrita do banco                      |
| `APP_ORIGIN`         | `https://sistema-gerenciamento-ubs.vercel.app` |

Não use o prefixo `NEXT_PUBLIC_`: o token pertence exclusivamente ao servidor. Na Vercel, o cookie de sessão sempre recebe `Secure` e a origem pública usa HTTPS. `APP_ORIGIN` é opcional: sem ela, a aplicação usa o host da requisição. Se habilitar Preview, prefira um banco separado e omita `APP_ORIGIN` nesse ambiente ou configure o domínio exato do preview. Usar o domínio de produção no preview causa erro de origem.

Configuração do projeto:

- Framework: **Next.js**.
- Node.js: **24.x**.
- Install Command: `npm ci`.
- Build Command: `npm run build`.
- Root Directory: raiz deste repositório.

Não configure `DATABASE_PATH=/tmp/...`: arquivos temporários não resolvem a persistência. Não há seed automático durante build ou login.

## 3. Publicar e conferir

Depois de salvar as variáveis, faça **Redeploy** da versão com suporte a Turso. Mudanças de variáveis só valem em novos deployments.

1. Entre com `coordenacao@ubs.demo` / `Demo@12345`.
2. Confirme a abertura do painel e das listas.
3. Saia e faça um autocadastro com dados fictícios inéditos.
4. Saia novamente e entre com a conta criada.
5. Atualize a página e confirme a persistência dos dados e da sessão.

Se a configuração estiver ausente, a API retorna HTTP 503 com a variável a configurar. Se houver falha de conexão, confira `npm run db:check:remote` e os logs da função na Vercel. Os logs da aplicação mostram somente nome e código do erro, não SQL ou tokens.

`npm run db:backup` atende somente SQLite local. Para o banco remoto, use exportação e backups do provedor. As contas compartilhadas e os dados fictícios são para demonstração; os demais limites do protótipo continuam descritos no README.

## Referências

- [Vercel: suporte a SQLite](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).
- [Vercel: variáveis de ambiente](https://vercel.com/docs/environment-variables).
- [Turso: referência TypeScript/libSQL](https://docs.turso.tech/sdk/ts/reference).
