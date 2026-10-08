import { randomUUID } from 'node:crypto';
import { run, one, transaction, now } from './db';
import { hashPassword } from './security';
import { today, dayAfter } from '@/domain/rules';
export function seed() {
  if (one('SELECT id FROM users LIMIT 1')) {
    console.log('Banco já possui usuários. Nenhum dado foi alterado.');
    return;
  }
  transaction(() => {
    const password = hashPassword('Demo@12345');
    const accounts = [
      ['u-coord', 'Helena Costa', 'coordenacao', 'COORDENACAO', ''],
      ['u-recep', 'Carla Ribeiro', 'recepcao', 'RECEPCAO', ''],
      ['u-saude', 'Ana Beatriz Lima', 'saude', 'PROFISSIONAL', ''],
      ['u-saude2', 'Rafael Mendes', 'medico', 'PROFISSIONAL', ''],
      ['u-estoque', 'Pedro Santos', 'estoque', 'ESTOQUE', ''],
      ['u-acs', 'João Oliveira', 'acs', 'ACS', 'Área 01'],
      ['u-acs2', 'Luiza Fernandes', 'acs2', 'ACS', 'Área 02'],
    ];
    for (const [key, name, email, role, area] of accounts)
      run(
        'INSERT INTO users VALUES(?,?,?,?,?,?,NULL)',
        key,
        name,
        `${email}@ubs.demo`,
        password,
        role,
        area,
      );
    const patients = [
      [
        'p-1',
        'Maria das Graças Silva',
        '1958-04-12',
        'Centro',
        'Área 01',
        'u-acs',
        'Hipertensão • acompanhamento trimestral',
      ],
      [
        'p-2',
        'José Antônio Costa',
        '1972-09-21',
        'Centro',
        'Área 01',
        'u-acs',
        'Diabetes • acompanhamento mensal',
      ],
      ['p-3', 'Ana Clara Souza', '1995-03-08', 'Jardim Primavera', 'Área 02', 'u-acs2', ''],
      ['p-4', 'Francisco Pereira', '1960-11-19', 'Centro', 'Área 01', 'u-acs', 'Hipertensão'],
      ['p-5', 'Beatriz Almeida', '2001-05-27', 'Jardim Primavera', 'Área 02', 'u-acs2', ''],
      ['p-6', 'Antônia Rodrigues', '1983-02-10', 'Centro', 'Área 01', 'u-acs', 'Diabetes'],
      ['p-7', 'Lucas Ferreira', '2010-07-14', 'Jardim Primavera', 'Área 02', 'u-acs2', ''],
      ['p-8', 'Raimunda Nascimento', '1949-12-03', 'Centro', 'Área 01', 'u-acs', 'Hipertensão'],
    ];
    for (const [key, name, birth, neighborhood, area, acs, conditions] of patients)
      run(
        'INSERT INTO patients VALUES(?,?,?,?,?,?,?,?,?,?)',
        key,
        name,
        `DEMO-${key.toUpperCase()}`,
        birth,
        '(83) 90000-0000',
        neighborhood,
        area,
        acs,
        conditions,
        now(),
      );
    run(
      'INSERT INTO users VALUES(?,?,?,?,?,?,?)',
      'u-paciente',
      'Maria das Graças Silva',
      'paciente@ubs.demo',
      password,
      'PACIENTE',
      'Área 01',
      'p-1',
    );
    run(
      'INSERT INTO services VALUES(?,?),(?,?),(?,?)',
      's-1',
      'Consulta médica',
      's-2',
      'Enfermagem',
      's-3',
      'Saúde da criança',
    );
    for (let offset = 0; offset < 5; offset++)
      for (let n = 1; n <= 2; n++)
        run(
          'INSERT INTO slots VALUES(?,?,?,?,?,?,?)',
          `slot-${offset}-${n}`,
          `s-${n}`,
          n === 1 ? 'u-saude2' : 'u-saude',
          dayAfter(offset),
          n === 1 ? 'Manhã' : 'Tarde',
          n === 1 ? '08:00' : '13:00',
          12,
        );
    const statuses = [
      'AGUARDANDO',
      'EM_ATENDIMENTO',
      'RESERVADA',
      'AGUARDANDO',
      'CONCLUIDA',
      'RESERVADA',
      'AUSENTE',
      'AGUARDANDO',
    ];
    for (let n = 1; n <= 8; n++)
      run(
        'INSERT INTO tickets(id,patient_id,slot_id,status,priority,checked_in_at,created_at) VALUES(?,?,?,?,?,?,?)',
        `t-${n}`,
        `p-${n}`,
        n <= 4 ? 'slot-0-1' : 'slot-0-2',
        statuses[n - 1],
        n === 1 || n === 8 ? 1 : 0,
        ['AGUARDANDO', 'EM_ATENDIMENTO', 'CONCLUIDA', 'AUSENTE'].includes(statuses[n - 1])
          ? `${today()}T${n === 8 ? '16' : '10'}:0${n}:00.000Z`
          : null,
        now(),
      );
    run(
      'INSERT INTO tickets(id,patient_id,slot_id,status,priority,created_at) VALUES(?,?,?,?,?,?)',
      't-9',
      'p-3',
      'slot-1-1',
      'RESERVADA',
      0,
      now(),
    );
    const items = [
      ['i-1', 'Losartana 50 mg', 'MEDICAMENTO', 'comprimidos', 100, 30],
      ['i-2', 'Metformina 500 mg', 'MEDICAMENTO', 'comprimidos', 80, 30],
      ['i-3', 'Vacina influenza (demo)', 'VACINA', 'doses', 30, 30],
      ['i-4', 'Vacina hepatite B (demo)', 'VACINA', 'doses', 20, 30],
      ['i-5', 'Paracetamol 500 mg', 'MEDICAMENTO', 'comprimidos', 50, 30],
    ] as const;
    for (const row of items) run('INSERT INTO items VALUES(?,?,?,?,?,?)', ...row);
    const lots = [
      ['l-1', 'i-1', 'LOS-2026-A', dayAfter(180), 320, 0],
      ['l-2', 'i-2', 'MET-2026-A', dayAfter(120), 42, 0],
      ['l-3', 'i-3', 'INF-2026-A', dayAfter(20), 86, 0],
      ['l-4', 'i-4', 'HEP-2026-A', dayAfter(240), 55, 0],
      ['l-5', 'i-5', 'PAR-2025-B', dayAfter(-7), 25, 0],
    ] as const;
    for (const row of lots) {
      run('INSERT INTO lots VALUES(?,?,?,?,?,?)', ...row);
      run(
        'INSERT INTO movements VALUES(?,?,?,?,?,?)',
        randomUUID(),
        row[0],
        row[4],
        'Saldo inicial de demonstração',
        'u-estoque',
        now(),
      );
    }
    run(
      'INSERT INTO campaigns VALUES(?,?,?,?,?,?,?)',
      'c-1',
      'Campanha de influenza',
      'i-3',
      dayAfter(-15),
      dayAfter(45),
      'Público definido pela equipe da UBS',
      1,
    );
    run(
      'INSERT INTO campaign_targets VALUES(?,?,?),(?,?,?)',
      'c-1',
      'Centro',
      120,
      'c-1',
      'Jardim Primavera',
      80,
    );
    for (let n = 1; n <= 4; n++) {
      run(
        'INSERT INTO doses VALUES(?,?,?,?,?,?,?,?)',
        `d-${n}`,
        `p-${n}`,
        'l-3',
        'c-1',
        1,
        now(),
        'u-saude',
        randomUUID(),
      );
      run('UPDATE lots SET quantity=quantity-1 WHERE id=?', 'l-3');
      run(
        'INSERT INTO movements VALUES(?,?,?,?,?,?)',
        randomUUID(),
        'l-3',
        -1,
        `Aplicação de demonstração d-${n}`,
        'u-saude',
        now(),
      );
    }
    run(
      'INSERT INTO pending_doses VALUES(?,?,?,?,?,?)',
      'pd-1',
      'p-1',
      'i-4',
      dayAfter(15),
      'Retorno registrado pelo profissional (exemplo)',
      0,
    );
    run(
      'INSERT INTO visits VALUES(?,?,?,?,?,?,?)',
      'v-1',
      'p-1',
      'u-acs',
      today(),
      'PLANEJADA',
      '',
      'Conferir data de retorno à unidade',
    );
    run(
      'INSERT INTO visits VALUES(?,?,?,?,?,?,?)',
      'v-2',
      'p-2',
      'u-acs',
      dayAfter(-1),
      'REALIZADA',
      'Paciente visitado. Orientado a procurar a equipe para acompanhamento.',
      'Confirmar próximo retorno',
    );
    run(
      'INSERT INTO visits VALUES(?,?,?,?,?,?,?)',
      'v-3',
      'p-4',
      'u-acs',
      dayAfter(-2),
      'SEM_CONTATO',
      'Paciente não estava no endereço.',
      'Reagendar visita',
    );
    run(
      'INSERT INTO visits VALUES(?,?,?,?,?,?,?)',
      'v-4',
      'p-3',
      'u-acs2',
      dayAfter(2),
      'PLANEJADA',
      '',
      '',
    );
    run(
      'INSERT INTO audit VALUES(?,?,?,?,?,?)',
      randomUUID(),
      'u-coord',
      'Base de demonstração criada',
      'demo',
      '{}',
      now(),
    );
  });
  console.log('Base fictícia criada. Login: coordenacao@ubs.demo | Senha: Demo@12345');
}
