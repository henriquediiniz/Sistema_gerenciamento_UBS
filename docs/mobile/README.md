# Integração Android/Kotlin — API do paciente v1

O aplicativo Kotlin usa o mesmo backend e banco do site. Este pacote entrega a API, o contrato e um exemplo de cliente; as telas Android e o APK ficam com o projeto Kotlin.

## Começar

- Base após o deploy desta versão: `https://sistema-gerenciamento-ubs.vercel.app/api/v1/` (mantenha a barra final no Retrofit).
- Contrato online após o deploy: `GET /api/v1/openapi.json`, sem autenticação.
- Contrato para importar no Postman/Insomnia ou gerador de cliente: [openapi.json](openapi.json).
- Interface Retrofit, DTOs e fábrica do cliente: [UbsPatientApi.kt](UbsPatientApi.kt).
- Conta fictícia: `paciente@ubs.demo` / `Demo@12345`. A coordenação e demais perfis recebem 403 nesta API.

O app **não recebe** `TURSO_AUTH_TOKEN`, arquivos `.env`, senha do banco ou credenciais da Vercel. Ele precisa apenas da URL pública e da sessão do paciente. Não use as rotas antigas `/api/login` e `/api/snapshot`: elas pertencem ao site e usam cookies.

## Fluxo de implementação das telas

1. Cadastro: `POST auth/register`; em caso de 201, encaminhe ao login. Cadastro não abre sessão automaticamente.
2. Login: `POST auth/login`; guarde `access_token` e `expires_at`. Depois consulte `GET me`.
3. Serviços e vagas: `GET services` → `GET slots?service_id=...`.
4. Reserva: gere uma UUID, preserve-a junto da vaga selecionada e envie `POST reservations` com `Idempotency-Key`. Exiba a ficha retornada.
5. Minhas fichas: `GET tickets`; detalhe em `GET tickets/{id}`. Use `can_cancel` para mostrar a ação de cancelar; o servidor valida novamente ao receber a ação.
6. Vacinas e acompanhamento: as três consultas da tabela abaixo.
7. Saída: `POST auth/logout` com `{}`; após 204, remova o token e os dados privados em memória/cache. Se não houver conexão, informe que a revogação remota não foi confirmada; o token ainda pode valer até expirar.

| Método | Caminho relativo          | Entrada/resultado                                                   |
| ------ | ------------------------- | ------------------------------------------------------------------- |
| POST   | `auth/register`           | Dados cadastrais → `data.id` da conta; 201                          |
| POST   | `auth/login`              | E-mail e senha → token, validade e usuário                          |
| POST   | `auth/logout`             | `{}` → 204, sem corpo; seguro repetir                               |
| GET    | `me`                      | `data.user` e `data.patient`                                        |
| PATCH  | `me`                      | Campos editáveis enviados parcialmente → cadastro atualizado        |
| GET    | `services`                | Lista paginada de serviços                                          |
| GET    | `slots`                   | Lista paginada de vagas futuras disponíveis                         |
| POST   | `reservations`            | `{ "slot_id": "..." }` + `Idempotency-Key` → ficha; 201             |
| GET    | `tickets`                 | Lista paginada das próprias fichas                                  |
| GET    | `tickets/{id}`            | Uma ficha própria                                                   |
| POST   | `tickets/{id}/cancel`     | `{}` → ficha cancelada                                              |
| GET    | `me/vaccinations`         | Histórico próprio: vacina, dose, data, lote, profissional, campanha |
| GET    | `me/pending-vaccinations` | Doses previstas: vacina, data prevista e indicador `done`           |
| GET    | `me/visits`               | Visitas próprias: data, situação e nome do ACS                      |

## Autenticação

```http
POST /api/v1/auth/login
Content-Type: application/json

{"email":"paciente@ubs.demo","password":"Demo@12345"}
```

```json
{
  "data": {
    "access_token": "TOKEN_OPACO_RETORNADO_PELO_SERVIDOR",
    "token_type": "Bearer",
    "expires_in": 28800,
    "expires_at": "2026-10-11T23:00:00.000Z",
    "user": {
      "id": "u-paciente",
      "name": "Maria das Graças Silva",
      "email": "paciente@ubs.demo",
      "role": "PACIENTE"
    }
  }
}
```

A validade de oito horas é absoluta: consultar a API não a renova. Não há refresh token nesta versão. Em 401 numa consulta autenticada, remova a sessão e mostre o login; um 401 no próprio login significa credenciais incorretas. O token é opaco, não JWT; não tente decodificá-lo. O backend guarda somente seu hash. Cada login cria uma sessão independente; sair no app não desconecta o site nem outro aparelho.

Nas rotas protegidas:

```http
Authorization: Bearer TOKEN_OPACO_RETORNADO_PELO_SERVIDOR
```

O Kotlin nativo não precisa enviar `Origin` nem usar cookies. Se um cliente enviar `Origin`, ele precisa corresponder ao domínio configurado do servidor. Não foi liberado CORS genérico para páginas de terceiros. Todas as respostas v1 levam `Cache-Control: no-store`.

## Cadastro e edição

```json
{
  "name": "Paciente Demonstração",
  "document": "DEMO-ANDROID-001",
  "birth_date": "2000-01-01",
  "phone": "",
  "neighborhood": "Centro",
  "email": "android-exemplo@ubs.demo",
  "password": "Demo@12345"
}
```

`document` é o identificador único usado no protótipo, sem validação de CPF/CNS. Use dados fictícios. `phone` é opcional no cadastro; a senha exige 8 a 128 caracteres. Data de nascimento futura é rejeitada. E-mail/documento repetidos retornam 409, sem criar cadastro parcial. Contas já existentes são usadas pelo mesmo login; não há associação automática de uma conta nova a um prontuário já cadastrado.

O autocadastro móvel define a área como **A definir**, sem ACS; a equipe deve validar o território no site. O paciente não escolhe papel, área ou ACS. O `PATCH me` aceita `name`, `document`, `birth_date`, `phone` e `neighborhood`; envie somente o que mudou. Corpo vazio, valores `null` e campos extras são rejeitados. Para apagar telefone, envie `"phone": ""`. Nome atualizado aparece também na conta do site. Não há troca de senha/e-mail nem recuperação de acesso nesta versão.

## Paginação, filtros e horários

Todas as listas usam `page` (padrão 1, até 10000) e `page_size` (padrão 20, até 100):

```json
{
  "data": [{ "id": "s-1", "name": "Consulta médica" }],
  "pagination": { "page": 1, "page_size": 20, "has_more": false }
}
```

Avance enquanto `has_more` for verdadeiro. A paginação é por deslocamento; mudanças simultâneas podem deslocar itens entre páginas. Ao atualizar a tela, reinicie na página 1 e deduplique por `id`. Não há total nem snapshot congelado de todas as páginas.

- `slots`: filtros `service_id`, `date_from` e `date_to` (`YYYY-MM-DD`). Padrão: hoje até hoje + 30 dias. Se buscar um período mais distante, informe ambas as datas. Só retorna períodos ainda não iniciados com capacidade livre. A disponibilidade é informativa; outra pessoa pode reservar antes de você.
- `tickets`: filtro opcional `status`. Ordem: data/horário decrescentes e número decrescente. Só retorna fichas do paciente autenticado.
- `services`: ordem por nome/id. Vacinas: data de aplicação decrescente. Doses previstas: abertas primeiro e data crescente. Visitas: data decrescente. IDs desempatam as listas.
- Campos desconhecidos e parâmetros repetidos são rejeitados. Nunca envie `patient_id` para escolher de quem consultar/reservar: o servidor obtém o paciente da sessão.
- Datas civis e `starts_at` usam `America/Fortaleza` (UTC−03:00). Instantes como `created_at`, `applied_at` e `expires_at` estão em ISO 8601 UTC com `Z`. Não converta aniversário em instante UTC; trate como data civil.

## Reservas e tentativas após falha de rede

```http
POST /api/v1/reservations
Authorization: Bearer TOKEN
Content-Type: application/json
Idempotency-Key: 3e7039a4-abfc-45ea-81c2-d959da104a83

{"slot_id":"ID_OBTIDO_EM_SLOTS"}
```

Gere a chave com `UUID.randomUUID().toString()` **uma vez por intenção de reserva**, antes da chamada. Não gere outra em cada retry. Repetir a mesma chave, paciente e vaga retorna a mesma ficha (inclusive se já cancelada), com status 201; não repete a auditoria nem consome outra vaga. Reutilizar a chave em outra vaga retorna 409. Depois de cancelar, uma nova reserva exige outra chave. A chave é isolada por conta e persistida no banco, sobrevivendo a reinícios da API.

Desabilite o botão enquanto envia, mas não dependa disso como proteção contra duplicidade. Se houver timeout, consulte minhas fichas ou repita com a mesma chave. Não repita automaticamente erros 400/403/409; mostre a mensagem e atualize os dados necessários.

Estados possíveis: `RESERVADA`, `AGUARDANDO`, `EM_ATENDIMENTO`, `CONCLUIDA`, `AUSENTE`, `CANCELADA`. Confirmação de presença, prioridade e condução da fila permanecem com a equipe. O paciente cancela somente fichas reservadas antes do início. Não expomos nomes de outras pessoas, posição garantida nem estimativa de espera.

Acompanhamento é por consulta: recarregue ao abrir/retomar a tela e no gesto de atualizar. Não há push, WebSocket, fila offline ou sincronização em segundo plano implementados.

## Erros

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Confira os campos enviados.",
    "fields": [{ "path": "email", "message": "Invalid email address" }]
  }
}
```

`fields` só aparece quando aplicável; o caminho pode ser vazio para validação do objeto/cabeçalho. Use HTTP + `code` para decidir o fluxo, sem comparar textos de mensagens.

| HTTP | Código                               | Tratamento                                                              |
| ---- | ------------------------------------ | ----------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR` / `BUSINESS_RULE` | Corrigir campos ou respeitar regra informada                            |
| 401  | `UNAUTHORIZED`                       | Login inválido ou sessão ausente/expirada; autenticar novamente         |
| 403  | `FORBIDDEN`                          | Perfil não paciente ou origem inválida                                  |
| 404  | `NOT_FOUND`                          | Rota/ficha inexistente ou pertencente a outra pessoa                    |
| 405  | `METHOD_NOT_ALLOWED`                 | Conferir método; cabeçalho `Allow` lista os aceitos                     |
| 409  | `CONFLICT`                           | Cadastro duplicado, ficha ativa, vaga esgotada ou chave reutilizada     |
| 413  | `PAYLOAD_TOO_LARGE`                  | Limite do corpo: 64 KiB                                                 |
| 415  | `UNSUPPORTED_MEDIA_TYPE`             | Enviar `Content-Type: application/json`                                 |
| 429  | `RATE_LIMITED`                       | Dez falhas por e-mail em quinze minutos; aguardar                       |
| 500  | `INTERNAL_ERROR`                     | Informar falha sem descartar a intenção de reserva                      |
| 503  | `SERVICE_UNAVAILABLE`                | Configuração do banco pendente; responsável pelo backend deve verificar |

## Uso do exemplo Kotlin

O arquivo `.kt` usa Retrofit, OkHttp e `kotlinx.serialization`, com o conversor oficial `com.squareup.retrofit2:converter-kotlinx-serialization`. O projeto Android precisa do plugin Kotlin Serialization, dessas dependências em versões compatíveis e da permissão `android.permission.INTERNET`. O exemplo não inclui Gradle, telas, navegação ou armazenamento persistente; integre ao projeto Android existente.

```kotlin
val token = java.util.concurrent.atomic.AtomicReference<String?>(null)
val api = createPatientApi { token.get() }

// Dentro de coroutine, com tratamento de IOException na camada de repositório:
val login = api.login(LoginInput("paciente@ubs.demo", "Demo@12345"))
if (login.isSuccessful) {
    token.set(requireNotNull(login.body()).data.accessToken)
    val profile = api.me()
    // Entregar profile.body()?.data ao ViewModel; tratar erros HTTP.
}

// Preserve esta chave se precisar repetir a MESMA intenção:
val requestKey = java.util.UUID.randomUUID().toString()
// api.reserve(requestKey, ReservationInput(slotId))
```

O exemplo mantém a sessão em memória e exige novo login ao encerrar o processo. Para persistir a sessão, implemente uma camada de armazenamento cifrado com chave protegida pelo Android Keystore; não guarde senha nem token em logs, URLs ou arquivo em texto puro. O Keystore guarda a chave criptográfica, não o JSON da sessão. Não habilite logs de corpo/cabeçalho para autenticação. O provider do token no interceptor precisa ser rápido e seguro entre threads.

Respostas usam `Response<T>`: verifique `isSuccessful`, trate `errorBody()` com `ApiErrorBody` e diferencie falhas HTTP de `IOException` (rede/timeout). `ignoreUnknownKeys` permite novos campos de resposta. Ao enviar `ProfileInput`, o exemplo omite propriedades não preenchidas usando `encodeDefaults = false`; não as envie como `null`.

## Desenvolvimento e validação

```bash
npm ci
npm run db:seed
npm run dev
```

O Android Emulator padrão acessa a máquina de desenvolvimento em `10.0.2.2`; ajuste a base e a condição do host no cliente de exemplo para esse ambiente. Use HTTP somente na configuração de debug. Em aparelho físico, prefira o endereço HTTPS publicado; o servidor local escuta loopback por padrão.

```bash
npm run api:export
npm run api:check
npm test
TEST_DATABASE_DRIVER=libsql npm test
npm run build
npm run test:integration
TEST_DATABASE_DRIVER=libsql npm run test:integration
```

O contrato JSON é gerado a partir dos esquemas e da lista de rotas em `src/server/patient-api/`. Não edite o JSON manualmente; regenere e versione junto de alterações de contrato. Mudanças incompatíveis exigem nova versão da API. Os testes usam bancos temporários e não alteram o Turso publicado.

## Escopo desta entrega

Sem receitas, resultado de exames, chat, recuperação de senha, verificação de identidade, notificações ou funcionamento offline. Doses previstas são registros manuais profissionais, sem promessa de agendamento. Visitas não incluem `result`/`pending`; o app também não recebe diagnósticos, auditoria ou anotações clínicas livres. A definição de textos clínicos visíveis ao paciente deve ocorrer em uma evolução explícita do contrato.

O Kotlin fornecido é um exemplo de integração; não foi compilado como APK neste repositório. A API é validada por testes de domínio e HTTP no build real do Next.js, incluindo registros criados no app e consultados pelo site.

## Referências

- [OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.0.html).
- [Retrofit](https://square.github.io/retrofit/).
- [Android Keystore](https://developer.android.com/privacy-and-security/keystore).
- [Rede no Android Emulator](https://developer.android.com/studio/run/emulator-networking).
