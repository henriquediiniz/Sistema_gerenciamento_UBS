# Decisões arquiteturais — versão 0.1

## Contexto

O documento acadêmico ainda está em desenvolvimento. A escolha é entregar fluxos verticais funcionais de todos os módulos, para uma UBS com dados fictícios, preservando espaço para mudanças.

## Decisões

### 1. Monólito modular em Next.js

React e API no mesmo projeto simplificam execução, compartilhamento de tipos e autenticação por cookie. Os módulos de aplicação não dependem de Next.js; uma futura API separada pode reutilizar os casos de uso. Microserviços, filas distribuídas, CQRS e contêineres obrigatórios acrescentariam manutenção sem benefício demonstrado para esta versão.

### 2. SQLite nativo do Node.js 24

Sem serviço externo, binários adicionais de banco ou credenciais de infraestrutura. Banco relacional em disco com WAL, chaves estrangeiras, unicidade e restrições `CHECK`. Escritas de domínio executam `BEGIN IMMEDIATE`, com timeout de cinco segundos: a contagem de vagas e a gravação da ficha são indivisíveis; a dose, a baixa e a auditoria também.

SQLite síncrono bloqueia o event loop durante consultas e não é escolha definitiva para múltiplas instâncias ou grande volume. PostgreSQL é o caminho previsto quando houver requisitos de escala. Essa migração exige adaptar SQL, transações e migrações; não é uma troca automática de configuração.

### 3. Separação por responsabilidades

`domain` contém contratos e validações; `server/modules` aplica regras por contexto; `db` encapsula persistência/transações; `queries` concentra projeções de leitura com filtros de acesso. A UI recebe DTOs serializáveis. Registros de `node:sqlite` são convertidos a objetos comuns para a passagem servidor-cliente do React.

Não criamos interfaces genéricas de repositório sem um segundo adaptador real. A fronteira SQL é pequena e explícita; evita abstrações que apenas repetiriam chamadas do banco. A primeira migração é idempotente e registrada em `schema_migrations`; novas mudanças de esquema precisam de migrações versionadas reais, sem editar retrospectivamente uma base existente.

### 4. API de comandos e leitura consolidada

`GET /api/snapshot` retorna somente dados autorizados. `POST /api/{recurso}` valida e despacha a operação. Códigos: 400 validação, 401 sessão, 403 permissão/origem, 404 inexistente, 409 conflito e 429 limite de login. Esta API de comandos é interna, não um contrato REST público estabilizado.

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

Senhas scrypt com salt; sessões aleatórias revogáveis e persistentes; segredo de sessão armazenado em hash; cookies HttpOnly; origem validada no POST. Dez falhas por conta em quinze minutos bloqueiam novas tentativas nesse intervalo. O controle precisa ser ampliado para abuso distribuído antes de exposição pública. Não registramos senhas em auditoria nem as retornamos ao frontend.

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
- A documentação embarcada na versão instalada do Next.js também foi verificada para Route Handlers e NextRequest.
