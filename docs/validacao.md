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
