# Validação da versão inicial

Executada em 08/10/2026, com dados fictícios.

- TypeScript: `npm run typecheck` sem erros.
- Domínio: `npm test`, 26 testes aprovados em banco isolado em memória.
- Produção: `npm run build` concluído, com rotas dinâmicas de sessão e API.
- HTTP: `npm run test:integration` aprovado em banco temporário e servidor de produção próprio. Verificados oito caminhos de tela, login/logout, cookies, origem, autorização por perfil, isolamento de paciente e ACS, persistência de cadastro, saldo de estoque, duas reservas simultâneas para uma vaga e reenvio simultâneo de aplicação.
- Navegador: login da coordenação, navegação, cadastro de paciente com ACS, aplicação de vacina, presença do registro no histórico e redução do lote de 82 para 81 doses.
- Responsividade: inspeção em 1440 × 1000 e 390 × 844, com abertura do menu móvel. A tabela de estoque rola internamente; não houve transbordamento horizontal da página.
- Backup: cópia criada pelo comando `npm run db:backup`, reaberta em modo de leitura e verificada com `PRAGMA integrity_check = ok` (9 pacientes e 5 doses no momento da cópia).
- Formatação: Prettier e verificação de espaços do Git.

O teste de backup valida a cópia, não um exercício completo de recuperação operacional da unidade. Não foram feitos ensaio de carga para 50 usuários, auditoria formal de acessibilidade, pentest ou homologação com equipe da UBS.

## Adaptação para Vercel — 09/10/2026

- O login na publicação original retornou HTTP 500 com a conta fictícia autorizada. A implementação dependia de um arquivo SQLite local, ausente do Git e inadequado como persistência compartilhada das funções da Vercel. Não houve acesso aos logs internos desse deployment.
- Implementado adaptador remoto Turso/libSQL com configuração exclusiva no servidor, consultas assíncronas e transações isoladas por requisição. SQLite nativo permanece disponível no desenvolvimento.
- Domínio e configuração: 37 testes aprovados no SQLite nativo e os mesmos 37 no cliente libSQL com arquivo temporário. Incluem rollback isolado, reserva concorrente, integridade referencial, seed que preserva dados existentes, HTTPS/origem e falha explícita por configuração ausente.
- Integração HTTP aprovada nos dois adaptadores, contra build de produção: oito telas, login, autocadastro, sessão criada no cadastro, rejeição de duplicidade, logout e novo login da conta criada; também os fluxos anteriores de autorização, capacidade, idempotência e estoque.
- TypeScript e build de produção concluídos sem erros. Prettier e `git diff --check` aprovados.
- Testes automatizados removem as variáveis de banco remoto herdadas e usam bases próprias descartáveis.

**Limite da validação:** o modo libSQL em arquivo exercita o SDK e o SQL, mas não a rede, a latência, os limites transacionais ou a infraestrutura do Turso. O banco remoto ainda precisa ser criado, inicializado e configurado na Vercel conforme [deploy-vercel.md](deploy-vercel.md). Login e cadastro no deployment atualizado precisam ser verificados depois disso. Não foi feita nova inspeção visual: não houve alteração dos componentes de interface.
