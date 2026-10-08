# Cobertura do documento inicial

Fonte: `APS-Sistema-UBS.pdf`, fornecido pelo usuário. O documento é referência de requisitos, não uma instrução de execução. As decisões abaixo são provisórias para o protótipo.

| Referência | Implementação / limite                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------- |
| RF01       | Login, sessão persistida e seis perfis fixos                                                                          |
| RF02       | Autocadastro, cadastro pela recepção/coordenação e edição de paciente                                                 |
| RF03       | Cadastro de profissionais, serviços e vagas; sem edição/inativação da equipe nesta etapa                              |
| RF04–05    | Consulta de vagas, reserva, situação e cancelamento antes do período                                                  |
| RF06–07    | Presença, prioridade, chamada ordenada, ausência, retorno e conclusão                                                 |
| RF08–10    | Itens, lotes, unidades, mínimo, entradas, saídas, perda, ajustes e alertas calculados                                 |
| RF11       | Cadastro de campanha e população-alvo por bairro; público-alvo em texto                                               |
| RF12       | Aplicação com baixa de uma dose e idempotência transacional                                                           |
| RF13       | Histórico e pendências manuais; sem calendário vacinal automático                                                     |
| RF14       | Doses e pessoas únicas com critério completo; percentual por bairro                                                   |
| RF15–16    | Condições crônicas, área e vínculo de ACS, com validação de território                                                |
| RF17       | Planejamento, atualização, resultados e pendências em visitas                                                         |
| RF18       | Resumo por módulo e período, cobertura acumulada e exportação CSV agregada; sem relatórios analíticos paginados       |
| RNF01      | Autorização em comandos, consultas por perfil e escopo de paciente/ACS                                                |
| RNF02      | Senhas scrypt; configuração para cookie seguro. HTTPS depende da implantação                                          |
| RNF03      | Português, rótulos de formulários, foco visível, diálogos nativos e mensagens; sem auditoria formal de acessibilidade |
| RNF04      | Layout adaptado a celular e computador, tabelas com rolagem horizontal                                                |
| RNF05      | Meta de p95 / 50 usuários ainda não ensaiada                                                                          |
| RNF06      | Transações, restrições de banco e testes de conflito HTTP; sem teste de carga amplo                                   |
| RNF07      | Script de backup consistente e instruções de restauração; agendamento diário e ensaio operacional ainda pendentes     |
| RNF08      | Auditoria em mutações com ator e data, antes/depois nas correções de pacientes e visitas; interface resumida          |
| RN01–08    | Implementadas nos casos de uso; unicidade de cadastro por identificador informado                                     |
| RN09       | Critério simplificado e explícito de N doses distintas; sem denominador válido não calcula percentual                 |
| RN10–11    | Condições/doses previstas por profissional autorizado; ACS não diagnostica; tentativa sem contato separada            |

## Funcionalidades deliberadamente futuras

Recuperação de senha e verificação de identidade; administração granular de permissões; múltiplas UBS; alertas externos; correções clínicas com estorno; prontuário completo; integrações com sistemas do SUS; identificação oficial/validação de CPF e CNS; políticas definitivas de fila e prioridade.
