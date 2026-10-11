# Decisões arquiteturais — versão 0.1

## Contexto

O documento acadêmico ainda está em desenvolvimento. A escolha é entregar fluxos verticais funcionais de todos os módulos, para uma UBS com dados fictícios, preservando espaço para mudanças.

## Decisões

### 1. Monólito modular em Next.js

React e API no mesmo projeto simplificam execução, compartilhamento de tipos e autenticação por cookie. Os módulos de aplicação não dependem de Next.js; uma futura API separada pode reutilizar os casos de uso. Microserviços, filas distribuídas, CQRS e contêineres obrigatórios acrescentariam manutenção sem benefício demonstrado para esta versão.

### 2. SQLite local e Turso/libSQL na Vercel

No desenvolvimento, o SQLite nativo do Node.js 24 mantém a execução sem credenciais externas. Na Vercel, `TURSO_DATABASE_URL` seleciona o cliente `@libsql/client` e `TURSO_AUTH_TOKEN` autentica o servidor. Arquivo SQLite local não oferece persistência compartilhada entre funções; a aplicação recusa esse modo na Vercel.

Os dois adaptadores compartilham SQL parametrizado, esquema relacional, chaves estrangeiras e restrições. Todos os casos de uso aguardam consultas e transações. No SQLite nativo, `BEGIN IMMEDIATE` e uma fila por conexão evitam intercalar requisições durante uma transação assíncrona. No cliente remoto, cada transação de escrita tem seu próprio contexto via `AsyncLocalStorage`, com commit, rollback e fechamento. O modo libSQL em arquivo também serializa o acesso à conexão local. A fila local não substitui a coordenação de escritas pelo banco remoto entre instâncias.

Reserva e contagem de vagas, dose e baixa de estoque, alterações e auditoria permanecem atômicas. O seed remoto usa um lote transacional, evitando uma longa transação interativa com uma ida à rede por registro. Não há seed automático no deploy ou login.

O SQLite nativo ainda bloqueia o event loop durante cada consulta. A rede acrescenta latência no modo remoto; não foi realizado teste de carga em Turso. PostgreSQL continua uma opção futura, exigindo adaptação explícita de SQL, transações e migrações.

### 3. Separação por responsabilidades

`domain` contém contratos e validações; `server/modules` aplica regras por contexto; `db` encapsula persistência/transações; `queries` concentra projeções de leitura com filtros de acesso. A UI recebe DTOs serializáveis. Registros de `node:sqlite` são convertidos a objetos comuns para a passagem servidor-cliente do React.

Os adaptadores implementam uma fronteira pequena de consultas e transações assíncronas. Os módulos não acessam diretamente nenhum cliente de banco. A primeira migração é idempotente e registrada em `schema_migrations`; novas mudanças de esquema precisam de migrações versionadas reais, sem editar retrospectivamente uma base existente.

### 4. API de comandos e leitura consolidada

`GET /api/snapshot` retorna somente dados autorizados. `POST /api/{recurso}` valida e despacha a operação. Códigos: 400 validação, 401 sessão, 403 permissão/origem, 404 inexistente, 409 conflito 429 limite de login e 503 configuração ausente do banco. Esta API de comandos é interna, não um contrato REST público estabilizado.

Leitura consolidada reduz chamadas no protótipo. Próxima evolução: consultas paginadas por módulo, invalidar somente dados alterados, componentes separados por tela e contratos documentados/OpenAPI. A atualização entre navegadores é manual pelo botão Atualizar; não há WebSocket/polling.

### 5. Autorização

| Perfil                | Capacidades da versão inicial                                           |
| --------------------- | ----------------------------------------------------------------------- |
| Coordenação           | Todos os módulos e gestão                                               |
| Recepção              | Cadastro de pacientes, emissão/cancelamento, presença, fila             |
| Profissional de saúde | Leitura de pacientes, chamada/conclusão, vacinação e condições crônicas |
| Estoque               | Itens, lotes, entradas, saídas, ajustes e bloqueios                     |
| ACS                   | Pacientes da área, visitas próprias e condições previamente registradas |
| Paciente              | Próprio cadastro, fichas, vacinas e visitas                             |

Autocadastro não permite escolher perfil privilegiado. A área inicial informada pelo paciente é declaratória; a equipe deve validar e vincular ACS. Alterações posteriores de área/ACS exigem equipe. Coordenação pode registrar dados clínicos no protótipo para facilitar demonstração; é uma decisão provisória a revisar com a unidade.

Senhas scrypt com salt; sessões aleatórias revogáveis e persistentes; segredo de sessão armazenado em hash; cookies HttpOnly e sempre Secure na Vercel; origem validada no POST com HTTPS do deploy ou APP_ORIGIN explícita. Dez falhas por conta em quinze minutos bloqueiam novas tentativas nesse intervalo. O controle precisa ser ampliado para abuso distribuído antes de exposição pública. Não registramos senhas em auditoria nem as retornamos ao frontend.

## Regras provisórias

- Fuso: `America/Fortaleza`; datas de nascimento e validade são datas civis.
- Manhã e tarde; a gestão define o horário inicial e a capacidade. Reserva/cancelamento somente antes do início.
- Cada sessão de serviço/profissional possui sua fila e no máximo uma ficha em atendimento.
- Prioridade binária validada (regular/prioritária), seguida de instante de presença e número de ficha. Nenhum diagnóstico ou classificação clínica automática.
- Estados: reservada → aguardando → em atendimento → concluída/ausente. Ausente → aguardando com nova chegada. Reservada → cancelada antes do período.
- Fichas concluídas continuam consumindo a capacidade do período. Ausentes não liberam vagas automaticamente. Canceladas liberam.
- Estoque utilizável exclui lotes bloqueados/vencidos; validade inclui o próprio dia. Estoque negativo é proibido. Ajuste é um delta com direção e motivo, não substituição do saldo.
- Perdas/ajustes podem reduzir lotes vencidos para permitir descarte. Saídas de uso não podem utilizar esses lotes.
- Doses exigem confirmação profissional do público-alvo. Não inferimos elegibilidade por diagnóstico ou idade.
- Campanha define uma vacina e um total de doses numeradas 1..N. Cobertura conta pessoas únicas com N doses distintas da campanha por bairro atual do cadastro. Mudança de bairro pode alterar o relatório retrospectivo; evolução prevista: guardar território na aplicação.
- Sem população válida, não há percentual. O indicador não limita artificialmente o percentual a 100%; somente a barra visual tem esse limite.
- Doses previstas são pendências profissionais manuais; encerrá-las não registra aplicação nem movimenta estoque.
- Visita sem contato é tentativa, não visita realizada. Conclusões no futuro são rejeitadas.
- Histórico clínico completo e correções de aplicação não foram implementados. Não há exclusão de aplicações para evitar apagar a trilha histórica.

## Operação e próximos passos

1. Validar fluxos, prioridades, cancelamento e acesso da coordenação com a UBS.
2. Evoluir schema/migrações, edição/inativação de profissionais e serviços e identidade dos pacientes.
3. Paginação, busca no servidor, políticas de retenção, métricas e revisão de segurança.
4. Automação de backups com restauração testada, HTTPS e configuração de produção.
5. Ensaiar concorrência e latência com carga representativa antes de decidir migrar para PostgreSQL.

O script de integração usa duas reservas simultâneas para uma vaga e dois reenvios simultâneos da mesma aplicação. Isso valida os conflitos desses fluxos; não substitui teste de carga do RNF05.

## Referências técnicas consultadas

- [Next.js: cookies e sessões](https://nextjs.org/docs/app/api-reference/functions/cookies).
- [Node.js 24: SQLite e backup](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html).
- [Turso/libSQL: cliente TypeScript e transações](https://docs.turso.tech/sdk/ts/reference).
- [Vercel: limitações de SQLite local](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).
- A documentação embarcada na versão instalada do Next.js também foi verificada para Route Handlers e NextRequest.

## API do paciente v1

O transporte móvel fica em `app/api/v1/[...path]` e `server/patient-api`. Route Handler fino, contratos Zod explícitos, consultas paginadas com DTOs mínimos e serviços de domínio compartilhados mantêm o backend único. A lista de operações e os esquemas também geram OpenAPI; `npm run api:check` detecta divergência do arquivo distribuído.

Sessões móveis opacas usam `patient_sessions`, expiração absoluta de oito horas e somente hash no banco. O transporte exige Bearer; não há fallback para cookies, refresh token nem dependência de Origin para clientes nativos. Quando Origin existe, ainda é validada. A autenticação de senha e a limitação de tentativas são compartilhadas com o site, sem emitir sessão móvel para funcionários. Permissões continuam verificadas a cada chamada.

O paciente sempre deriva da sessão; consultas e mutações não aceitam `patient_id` do cliente. IDs de fichas alheias produzem 404. Edição do cadastro sincroniza o nome da conta e mantém vínculos da equipe. Autocadastro móvel inicia com área “A definir”. Anotações internas e diagnósticos não são incluídos nos DTOs móveis.

A migração aditiva 2 cria sessões móveis, índices das consultas próprias e `reservation_requests`. A chave UUID de reserva é isolada por usuário e registrada na mesma transação da ficha. Reenvios devolvem a mesma ficha, inclusive após cancelamento; uma nova intenção exige nova chave. Cancelamento repetido é seguro, inclusive sob concorrência. Migração não altera usuários, senhas, fichas ou sessões web existentes.

Paginação por deslocamento foi escolhida pela simplicidade do protótipo; coleções mutáveis podem deslocar itens entre páginas. Não há total nem promessa de snapshot consistente entre chamadas. Se volume/concorrência crescerem, evoluir para cursores estáveis, sem alterar silenciosamente o contrato v1.
