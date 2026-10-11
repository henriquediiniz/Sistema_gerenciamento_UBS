# UBS Conecta

Protótipo acadêmico funcional para **uma UBS**, baseado no documento inicial `APS-Sistema-UBS.pdf`. Frontend React e backend Node.js integrados em Next.js, com TypeScript e persistência SQLite. Todos os registros iniciais são fictícios.

## Rodar localmente

Requer **Node.js 24 ou superior** e npm.

```bash
npm ci
npm run db:seed
npm run dev
```

Abra **http://127.0.0.1:3000**. O banco é criado em `data/ubs.sqlite`; os dados permanecem após reiniciar o servidor. A carga de demonstração não sobrescreve uma base que já tenha usuários. As datas iniciais são relativas ao dia em que o seed é executado.

A configuração padrão não exige `.env`. Para personalizar, copie `.env.example` para `.env`. Os scripts de banco podem receber `DATABASE_PATH` pelo ambiente; o Next.js também lê `.env` automaticamente.

| Perfil                | E-mail               | Senha de demonstração |
| --------------------- | -------------------- | --------------------- |
| Coordenação           | coordenacao@ubs.demo | Demo@12345            |
| Recepção              | recepcao@ubs.demo    | Demo@12345            |
| Profissional de saúde | saude@ubs.demo       | Demo@12345            |
| Estoque               | estoque@ubs.demo     | Demo@12345            |
| ACS da Área 01        | acs@ubs.demo         | Demo@12345            |
| ACS da Área 02        | acs2@ubs.demo        | Demo@12345            |
| Paciente (Maria)      | paciente@ubs.demo    | Demo@12345            |

A tela de login permite preencher as contas de demonstração com um clique. O autocadastro cria uma conta com perfil paciente. Novos profissionais são cadastrados pela coordenação.

## Publicar na Vercel

A Vercel precisa de um banco remoto para persistir usuários, sessões e registros. Esta versão suporta **Turso/libSQL**, mantendo o SQLite local como padrão no desenvolvimento. Configure `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN`, inicialize os dados fictícios e faça um novo deploy conforme o [guia de publicação](docs/deploy-vercel.md). Sem banco configurado, a API informa o problema com HTTP 503.

## Aplicativo do paciente (Kotlin)

A API versionada em `/api/v1` permite ao aplicativo usar o mesmo banco e as mesmas regras do site. Inclui cadastro, login Bearer, perfil, serviços/vagas, reserva/cancelamento de fichas, vacinação e visitas próprias. Sessões móveis são independentes dos cookies do site.

Entregue ao desenvolvedor Android o [guia de integração](docs/mobile/README.md), o [contrato OpenAPI](docs/mobile/openapi.json) e o [exemplo Kotlin/Retrofit](docs/mobile/UbsPatientApi.kt). O contrato também está disponível em `/api/v1/openapi.json`. O projeto fornece o backend e o exemplo de cliente; não contém as telas nem o APK Android.

## O que experimentar

1. **Coordenação:** conheça o painel, cadastre profissionais e serviços, disponibilize vagas para amanhã.
2. **Paciente:** reserve uma ficha em período futuro e confira sua situação. Cancele antes do início para liberar a vaga.
3. **Recepção:** nas fichas de hoje, confirme presença e prioridade. Na fila, conclua a ficha em atendimento e chame o próximo paciente da respectiva sessão. Registre ausência e retorno.
4. **Estoque:** cadastre itens e lotes; registre entradas, saídas, perdas e ajustes. Tente retirar mais que o saldo ou usar um lote vencido para ver a validação.
5. **Saúde:** registre uma aplicação e confira o histórico e a redução do lote. Registre doses previstas e condições de acompanhamento.
6. **ACS:** registre o resultado de uma visita. O ACS da Área 01 não acessa os pacientes da Área 02.
7. **Coordenação:** consulte cobertura por bairro, resumo com filtro de datas, exportação CSV e histórico de alterações.

**Atenção ao calendário:** fichas e confirmação de presença usam a data atual em `America/Fortaleza`. O seed inclui exemplos de hoje e vagas para os próximos quatro dias. Após esse intervalo, disponibilize novas vagas na gestão.

## Arquitetura

Monólito modular: uma aplicação e um banco, com responsabilidades separadas. O frontend não importa banco, senhas ou módulos do servidor.

```text
src/app/                  Rotas, páginas servidor, HTTP e estilos
src/components/           Interface React, formulários e telas
src/domain/               Modelos, esquemas Zod e regras compartilhadas
src/server/modules/       Casos de uso por módulo
src/server/db.ts          Adaptadores SQLite/libSQL e transações assíncronas
src/server/schema.ts      Esquema relacional compartilhado
src/server/security.ts    Senhas, sessões e autorização
src/server/queries.ts     Leituras filtradas por perfil e território
src/server/commands.ts    Despacho dos comandos para os módulos
scripts/                  Seed, backup e verificação HTTP
 tests/                   Testes de regras de negócio
```

- **Camada de aplicação / serviços:** regras fora dos componentes e do transporte HTTP.
- **Validação na entrada:** Zod e regras de autorização executadas no servidor.
- **Máquina de estados explícita:** transições válidas de fichas e presença.
- **Transações:** reserva, cancelamento, movimentação, aplicação e auditoria são consistentes. `BEGIN IMMEDIATE` serializa escritas concorrentes no SQLite.
- **Idempotência:** chave única por aplicação; reenvio não duplica histórico nem baixa de estoque. O formulário preserva a chave em tentativas subsequentes.
- **Autorização por perfil e escopo:** verificações nos comandos e filtros nas consultas. Esconder botões não é a proteção de acesso.
- **SQL parametrizado:** sem dependência de ORM no protótipo; integridade com chaves estrangeiras, índices únicos e restrições de saldo.
- **Sessões opacas:** cookie HttpOnly, SameSite=Lax, expiração de oito horas, token armazenado como hash, senha com scrypt e salt, limitação de tentativas de login e checagem de origem.

As decisões, regras provisórias e limitações estão em [docs/arquitetura.md](docs/arquitetura.md). A cobertura do documento está em [docs/requisitos.md](docs/requisitos.md).

## Verificações

```bash
npm run typecheck
npm test
npm run build
npm run test:integration
```

Os testes de domínio usam um banco em memória isolado. A integração HTTP usa um banco temporário próprio, inicia o build de produção em `127.0.0.1:3101` e encerra o processo ao terminar. Use `TEST_PORT=3102` se necessário. Os testes descartam credenciais remotas herdadas; o banco de demonstração não é alterado.

Para validar também o adaptador libSQL com um arquivo temporário (bash):

```bash
TEST_DATABASE_DRIVER=libsql npm test
TEST_DATABASE_DRIVER=libsql npm run test:integration
```

Esses testes verificam o cliente libSQL e as regras, mas não simulam a rede ou a infraestrutura Turso/Vercel.

```bash
npm run format:check
npm run format
```

Para executar o build de produção local:

```bash
npm run build
npm start
```

## Backup

```bash
npm run db:backup
```

O comando usa a API de backup online do SQLite e cria uma cópia consistente em `backups/`. **Não há agendamento diário automático** nesta versão. Para restaurar, pare a aplicação, preserve o banco atual e seus arquivos `-wal` / `-shm` em uma pasta separada e coloque a cópia escolhida em `data/ubs.sqlite`. Nunca substitua o arquivo com o servidor em execução. Teste primeiro em um caminho alternativo com `DATABASE_PATH`.

Com Turso configurado, utilize os recursos de exportação e backup do provedor; o comando local recusa executar contra banco remoto.

## Limites desta entrega

É um protótipo para validação de fluxos com dados fictícios, **não uma implantação para dados reais de pacientes**. Não inclui recuperação de senha, verificação de identidade, integrações SUS, SMS/e-mail, triagem clínica, prontuário completo, várias UBS, sincronização offline ou permissões configuráveis por usuário. Relatórios e telas usam consultas pequenas sem paginação; histórico de movimentos exibe até 200 registros e auditoria até 40. Não foi executado o ensaio de 50 usuários / p95 de 3 segundos.

HTTPS, backup diário automatizado, teste operacional de restauração, política de acesso e revisão de proteção de dados precisam ser tratados antes de qualquer uso real. Para HTTPS, configure `APP_ORIGIN` e `COOKIE_SECURE=true` atrás de um proxy. A aplicação inicia apenas na interface local por padrão.
