'use client';
import { useState } from 'react';
import {
  Search,
  Plus,
  ArrowRight,
  Check,
  Phone,
  Download,
  LockKeyhole,
  ChevronRight,
} from 'lucide-react';
import { roleLabels } from '@/domain/model';
import { Badge, Card, Empty, formatDate, initials } from './ui';
import { forms } from './forms';
import type { PanelProps } from './workspace';
function SearchBox({
  value,
  onChange,
  placeholder = 'Buscar por nome…',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="search">
      <Search size={17} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
function Tabs({
  values,
  value,
  set,
}: {
  values: { key: string; label: string; count?: number }[];
  value: string;
  set: (value: string) => void;
}) {
  return (
    <div className="tabs" role="group" aria-label="Filtro de visualização">
      {values.map((v) => (
        <button
          key={v.key}
          className={value === v.key ? 'selected' : ''}
          onClick={() => set(v.key)}
          aria-pressed={value === v.key}
        >
          {v.label}
          {v.count !== undefined && <span>{v.count}</span>}
        </button>
      ))}
    </div>
  );
}
export function Patients({ data: d, open }: PanelProps) {
  const [search, setSearch] = useState(''),
    f = forms(d),
    editable = ['COORDENACAO', 'RECEPCAO', 'PACIENTE'].includes(d.user.role),
    clinical = ['COORDENACAO', 'PROFISSIONAL'].includes(d.user.role);
  const patients = d.patients.filter((p) =>
    `${p.name} ${p.document} ${p.neighborhood}`
      .toLocaleLowerCase('pt-BR')
      .includes(search.toLocaleLowerCase('pt-BR')),
  );
  return (
    <Card
      title={d.user.role === 'PACIENTE' ? 'Meu cadastro' : 'Pessoas cadastradas'}
      subtitle={`${d.patients.length} registros disponíveis para seu perfil`}
      action={
        <SearchBox value={search} onChange={setSearch} placeholder="Nome, documento ou bairro…" />
      }
    >
      {patients.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Contato</th>
                <th>Território</th>
                <th>Acompanhamento</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="person">
                      <span className="avatar">{initials(p.name)}</span>
                      <div>
                        <strong>{p.name}</strong>
                        <small>
                          {p.document} · {formatDate(p.birth_date)}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>{p.phone || 'Não informado'}</td>
                  <td>
                    {p.neighborhood}
                    <small className="cell-note">{p.area}</small>
                  </td>
                  <td>
                    {p.conditions ? (
                      <Badge tone="purple">Em acompanhamento</Badge>
                    ) : (
                      <span className="muted">—</span>
                    )}
                    {p.conditions && <small className="cell-note truncate">{p.conditions}</small>}
                  </td>
                  <td>
                    <div className="row-actions">
                      {editable && (
                        <button className="text-button" onClick={() => open(f.patient(p))}>
                          Editar
                        </button>
                      )}
                      {clinical && (
                        <button className="text-button" onClick={() => open(f.condition(p))}>
                          Acompanhar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>Nenhum paciente encontrado.</Empty>
      )}
    </Card>
  );
}
export function Appointments({ data: d, open, act, busy }: PanelProps) {
  const [tab, setTab] = useState('fichas'),
    [date, setDate] = useState(d.today),
    [service, setService] = useState(''),
    f = forms(d),
    patient = d.user.role === 'PACIENTE',
    reception = ['COORDENACAO', 'RECEPCAO'].includes(d.user.role);
  const tickets = d.tickets.filter(
    (t) =>
      (!date || t.date === date) &&
      (!service || d.slots.find((s) => s.id === t.slot_id)?.service_id === service),
  );
  const queue = tickets
    .filter((t) => ['AGUARDANDO', 'EM_ATENDIMENTO'].includes(t.status))
    .sort(
      (a, b) =>
        (a.status === 'EM_ATENDIMENTO' ? -1 : b.status === 'EM_ATENDIMENTO' ? 1 : 0) ||
        b.priority - a.priority ||
        (a.checked_in_at || '').localeCompare(b.checked_in_at || '') ||
        a.number - b.number,
    );
  const slots = d.slots.filter(
    (s) => (!date || s.date === date) && (!service || s.service_id === service),
  );
  return (
    <>
      <div className="toolbar">
        <Tabs
          value={tab}
          set={setTab}
          values={[
            { key: 'fichas', label: patient ? 'Minhas fichas' : 'Fichas', count: tickets.length },
            ...(!patient
              ? [{ key: 'fila', label: 'Fila de atendimento', count: queue.length }]
              : []),
            { key: 'vagas', label: 'Vagas disponíveis' },
          ]}
        />
        <div className="filters">
          <label>
            Data
            <input
              aria-label="Data de atendimento"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Serviço
            <select
              aria-label="Filtrar por serviço"
              value={service}
              onChange={(e) => setService(e.target.value)}
            >
              <option value="">Todos os serviços</option>
              {d.services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {tab === 'vagas' ? (
        <div className="slot-grid">
          {slots.length ? (
            slots.map((s) => (
              <Card key={s.id} title={s.service_name} subtitle={s.professional_name}>
                <div className="slot-body">
                  <p>
                    {formatDate(s.date)} · {s.period} · a partir de {s.starts_at}
                  </p>
                  <div className="capacity">
                    <strong>{s.capacity - s.reserved}</strong>
                    <span>vagas disponíveis de {s.capacity}</span>
                  </div>
                  <div className="progress-track">
                    <span style={{ width: `${Math.min((s.reserved / s.capacity) * 100, 100)}%` }} />
                  </div>
                  <small className="muted">A reserva não garante horário exato.</small>
                  {(patient || reception) && (
                    <button
                      className="button primary full"
                      disabled={
                        s.reserved >= s.capacity ||
                        new Date(`${s.date}T${s.starts_at}:00-03:00`).getTime() <= Date.now()
                      }
                      onClick={() => {
                        const spec = f.reservation();
                        spec.fields = spec.fields.map((x) =>
                          x.name === 'slot_id' ? { ...x, value: s.id } : x,
                        );
                        open(spec);
                      }}
                    >
                      Reservar vaga
                      <ArrowRight size={16} />
                    </button>
                  )}
                </div>
              </Card>
            ))
          ) : (
            <Empty>Nenhum período cadastrado para os filtros selecionados.</Empty>
          )}
        </div>
      ) : (
        <Card
          title={
            tab === 'fila'
              ? 'Fila com presença confirmada'
              : patient
                ? 'Suas fichas de atendimento'
                : 'Fichas de atendimento'
          }
          subtitle={
            tab === 'fila'
              ? 'A chamada respeita prioridade e chegada, dentro de cada período.'
              : 'Confirme a presença do paciente para incluí-lo na fila.'
          }
        >
          {(tab === 'fila' ? queue : tickets).length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ficha / paciente</th>
                    <th>Atendimento</th>
                    <th>Situação</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(tab === 'fila' ? queue : tickets).map((t) => (
                    <tr key={t.id}>
                      <td>
                        <div className="person">
                          <span className="ticket-number">{String(t.number).padStart(3, '0')}</span>
                          <div>
                            <strong>{t.patient_name}</strong>
                            <small>
                              {t.priority ? 'Prioridade validada' : 'Atendimento regular'}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        {t.service_name}
                        <small className="cell-note">
                          {formatDate(t.date)} · {t.period}
                        </small>
                      </td>
                      <td>
                        <Badge value={t.status} />
                      </td>
                      <td>
                        <div className="row-actions">
                          {t.status === 'RESERVADA' && reception && t.date === d.today && (
                            <button
                              className="button compact"
                              onClick={() => open(f.checkin(t.id))}
                            >
                              <Check size={14} />
                              Presença
                            </button>
                          )}
                          {t.status === 'RESERVADA' && (patient || reception) && (
                            <button
                              className="text-button danger"
                              disabled={busy}
                              onClick={() =>
                                open({
                                  title: 'Cancelar reserva',
                                  description:
                                    'O cancelamento libera a vaga e só é permitido antes do início do período.',
                                  resource: 'tickets',
                                  fields: [],
                                  extra: { id: t.id, action: 'cancelar' },
                                  submitLabel: 'Confirmar cancelamento',
                                })
                              }
                            >
                              Cancelar
                            </button>
                          )}
                          {t.status === 'AGUARDANDO' && !patient && (
                            <button
                              className="button compact primary"
                              disabled={busy}
                              onClick={() => act('tickets', { id: t.id, action: 'chamar' })}
                            >
                              <Phone size={14} />
                              Chamar
                            </button>
                          )}
                          {t.status === 'EM_ATENDIMENTO' && !patient && (
                            <>
                              <button
                                className="button compact primary"
                                disabled={busy}
                                onClick={() => act('tickets', { id: t.id, action: 'concluir' })}
                              >
                                Concluir
                              </button>
                              <button
                                className="text-button"
                                disabled={busy}
                                onClick={() => act('tickets', { id: t.id, action: 'ausencia' })}
                              >
                                Ausente
                              </button>
                            </>
                          )}
                          {t.status === 'AUSENTE' && reception && (
                            <button
                              className="button compact"
                              onClick={() => open(f.checkin(t.id, true))}
                            >
                              Registrar retorno
                            </button>
                          )}
                          {['CONCLUIDA', 'CANCELADA'].includes(t.status) && (
                            <span className="muted">Finalizada</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Nenhuma ficha nesta visualização.</Empty>
          )}
        </Card>
      )}
      <div className="info-strip">
        <LockKeyhole size={17} />
        {patient
          ? 'Você acessa apenas as suas fichas.'
          : 'A prioridade é validada pela equipe. Um retorno de ausência recebe nova ordem de chegada.'}
      </div>
    </>
  );
}
export function Inventory({ data: d, open }: PanelProps) {
  const [tab, setTab] = useState('lotes'),
    [search, setSearch] = useState(''),
    f = forms(d),
    low = d.items.filter((i) => i.usable <= i.minimum);
  const lots = d.lots.filter((l) =>
    `${l.item_name} ${l.code}`.toLowerCase().includes(search.toLowerCase()),
  );
  function status(l: (typeof d.lots)[number]) {
    if (l.blocked) return <Badge tone="red">Bloqueado</Badge>;
    if (l.expires_at < d.today) return <Badge tone="red">Vencido</Badge>;
    if (new Date(l.expires_at).getTime() - new Date(d.today).getTime() <= l.alert_days * 86400000)
      return <Badge tone="amber">Validade próxima</Badge>;
    return <Badge tone="teal">Disponível</Badge>;
  }
  return (
    <>
      <div className="metric-strip">
        <div>
          <span>Itens cadastrados</span>
          <strong>{d.items.length}</strong>
        </div>
        <div>
          <span>Lotes cadastrados</span>
          <strong>{d.lots.length}</strong>
        </div>
        <div>
          <span>Itens para reposição</span>
          <strong className="amber-text">{low.length}</strong>
        </div>
        <div>
          <span>Lotes vencidos</span>
          <strong className="danger">
            {d.lots.filter((l) => l.expires_at < d.today && l.quantity > 0).length}
          </strong>
        </div>
      </div>
      {low.length > 0 && (
        <div className="notice warning">
          Reposição necessária: {low.map((i) => `${i.name} (${i.usable} ${i.unit})`).join(' · ')}
        </div>
      )}
      <div className="toolbar">
        <Tabs
          value={tab}
          set={setTab}
          values={[
            { key: 'lotes', label: 'Lotes e validade' },
            { key: 'itens', label: 'Catálogo de itens' },
            { key: 'historico', label: 'Movimentações' },
          ]}
        />
        <div className="row-actions">
          <button className="button" onClick={() => open(f.item())}>
            <Plus size={16} />
            Novo item
          </button>
          <button className="button" onClick={() => open(f.lot())}>
            <Plus size={16} />
            Novo lote
          </button>
        </div>
      </div>
      <Card
        title={
          tab === 'lotes'
            ? 'Estoque por lote'
            : tab === 'itens'
              ? 'Medicamentos e vacinas'
              : 'Histórico de movimentações'
        }
        subtitle={
          tab === 'historico'
            ? 'Últimas 200 movimentações, com motivo e responsável.'
            : 'Saldo utilizável exclui lotes vencidos e bloqueados.'
        }
        action={
          tab === 'lotes' ? (
            <SearchBox value={search} onChange={setSearch} placeholder="Buscar item ou lote…" />
          ) : undefined
        }
      >
        <div className="table-wrap">
          <table>
            {tab === 'lotes' ? (
              <>
                <thead>
                  <tr>
                    <th>Item / lote</th>
                    <th>Validade</th>
                    <th>Saldo físico</th>
                    <th>Situação</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lots.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <strong>{l.item_name}</strong>
                        <small className="cell-note">
                          Lote {l.code} · {l.kind === 'VACINA' ? 'Vacina' : 'Medicamento'}
                        </small>
                      </td>
                      <td>{formatDate(l.expires_at)}</td>
                      <td>
                        <strong>{l.quantity}</strong> {l.unit}
                      </td>
                      <td>{status(l)}</td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => open(f.block(l.id, !l.blocked))}
                        >
                          {l.blocked ? 'Desbloquear' : 'Bloquear'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </>
            ) : tab === 'itens' ? (
              <>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Tipo</th>
                    <th>Saldo utilizável</th>
                    <th>Mínimo</th>
                    <th>Alerta de validade</th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <strong>{i.name}</strong>
                      </td>
                      <td>{i.kind === 'VACINA' ? 'Vacina' : 'Medicamento'}</td>
                      <td>
                        <Badge tone={i.usable <= i.minimum ? 'amber' : 'teal'}>
                          {i.usable} {i.unit}
                        </Badge>
                      </td>
                      <td>{i.minimum}</td>
                      <td>{i.alert_days} dias</td>
                    </tr>
                  ))}
                </tbody>
              </>
            ) : (
              <>
                <thead>
                  <tr>
                    <th>Item / lote</th>
                    <th>Quantidade</th>
                    <th>Motivo</th>
                    <th>Responsável</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {d.movements.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <strong>{m.item_name}</strong>
                        <small className="cell-note">{m.lot_code}</small>
                      </td>
                      <td>
                        <Badge tone={m.delta >= 0 ? 'teal' : 'amber'}>
                          {m.delta > 0 ? '+' : ''}
                          {m.delta}
                        </Badge>
                      </td>
                      <td className="text-cell">{m.reason}</td>
                      <td>{m.user_name}</td>
                      <td>{formatDate(m.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
          </table>
        </div>
        {tab === 'lotes' && !lots.length && <Empty>Nenhum lote encontrado.</Empty>}
      </Card>
    </>
  );
}
export function Vaccination({ data: d, open, act, busy }: PanelProps) {
  const [tab, setTab] = useState('aplicacoes'),
    f = forms(d),
    staff = d.user.role !== 'PACIENTE',
    coord = d.user.role === 'COORDENACAO';
  return (
    <>
      <div className="toolbar">
        <Tabs
          value={tab}
          set={setTab}
          values={[
            { key: 'aplicacoes', label: 'Doses aplicadas', count: d.doses.length },
            {
              key: 'pendentes',
              label: 'Doses previstas',
              count: d.pendingDoses.filter((p) => !p.done).length,
            },
            { key: 'campanhas', label: 'Campanhas' },
          ]}
        />
        <div className="row-actions">
          {staff && (
            <button className="button" onClick={() => open(f.pending())}>
              Prever dose
            </button>
          )}
          {coord && (
            <button className="button" onClick={() => open(f.campaign())}>
              <Plus size={16} />
              Nova campanha
            </button>
          )}
        </div>
      </div>
      {tab === 'campanhas' ? (
        <>
          <div className="section-mini-heading">
            <span>Critério: pessoas únicas com todas as doses exigidas na campanha.</span>
            {coord && (
              <button className="text-button" onClick={() => open(f.target())}>
                Definir população por bairro <Plus size={15} />
              </button>
            )}
          </div>
          <div className="slot-grid">
            {d.campaigns.map((c) => (
              <Card key={c.id} title={c.name} subtitle={c.item_name}>
                <div className="campaign-body">
                  <Badge tone={c.starts_at <= d.today && c.ends_at >= d.today ? 'teal' : 'amber'}>
                    {c.starts_at <= d.today && c.ends_at >= d.today
                      ? 'Em andamento'
                      : 'Fora do período'}
                  </Badge>
                  <p>{c.audience}</p>
                  <small className="muted">
                    {formatDate(c.starts_at)} a {formatDate(c.ends_at)} · {c.required_doses} dose(s)
                  </small>
                  {d.coverage
                    .filter((v) => v.campaign_id === c.id)
                    .map((v) => (
                      <div className="coverage" key={v.neighborhood}>
                        <div>
                          <strong>{v.neighborhood}</strong>
                          <span>
                            {v.population > 0
                              ? `${((v.people / v.population) * 100).toFixed(1)}%`
                              : 'Sem referência'}
                          </span>
                        </div>
                        <div className="progress-track">
                          <span
                            style={{
                              width: `${v.population > 0 ? Math.min((v.people / v.population) * 100, 100) : 0}%`,
                            }}
                          />
                        </div>
                        <small>
                          {v.people} pessoas com critério completo / {v.population} pessoas no
                          público-alvo
                        </small>
                      </div>
                    ))}
                </div>
              </Card>
            ))}
          </div>
          {!d.campaigns.length && <Empty>Nenhuma campanha cadastrada.</Empty>}
        </>
      ) : (
        <Card
          title={tab === 'aplicacoes' ? 'Histórico de vacinação' : 'Planejamento e pendências'}
          subtitle={
            tab === 'aplicacoes'
              ? 'Aplicações integradas ao estoque por lote.'
              : 'Doses previstas são definidas e encerradas pelo profissional responsável.'
          }
        >
          {tab === 'aplicacoes' ? (
            d.doses.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Paciente</th>
                      <th>Vacina / lote</th>
                      <th>Dose</th>
                      <th>Data</th>
                      <th>Profissional</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.doses.map((v) => (
                      <tr key={v.id}>
                        <td>
                          <strong>{v.patient_name}</strong>
                        </td>
                        <td>
                          {v.item_name}
                          <small className="cell-note">Lote {v.lot_code}</small>
                        </td>
                        <td>
                          <Badge tone="blue">{v.dose}ª dose</Badge>
                        </td>
                        <td>{formatDate(v.applied_at)}</td>
                        <td>{v.user_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>Nenhuma aplicação registrada.</Empty>
            )
          ) : d.pendingDoses.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Paciente / vacina</th>
                    <th>Data prevista</th>
                    <th>Orientação</th>
                    <th>Situação</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {d.pendingDoses.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <strong>{v.patient_name}</strong>
                        <small className="cell-note">{v.item_name}</small>
                      </td>
                      <td>{formatDate(v.due_date)}</td>
                      <td className="text-cell">{v.note}</td>
                      <td>
                        <Badge tone={v.done ? 'teal' : 'amber'}>
                          {v.done ? 'Encerrada' : 'Pendente'}
                        </Badge>
                      </td>
                      <td>
                        {staff && !v.done && (
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() =>
                              open({
                                title: 'Encerrar pendência vacinal',
                                description:
                                  'Confirme que a pendência foi resolvida. Este encerramento não registra uma aplicação nem movimenta estoque.',
                                resource: 'close-pending-dose',
                                fields: [],
                                extra: { id: v.id },
                                submitLabel: 'Confirmar encerramento',
                              })
                            }
                          >
                            Encerrar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Nenhuma dose prevista registrada.</Empty>
          )}
        </Card>
      )}
    </>
  );
}
export function Followup({ data: d, open }: PanelProps) {
  const [tab, setTab] = useState('visitas'),
    f = forms(d),
    canVisit = ['COORDENACAO', 'ACS'].includes(d.user.role),
    clinical = ['COORDENACAO', 'PROFISSIONAL'].includes(d.user.role);
  return (
    <>
      <div className="metric-strip">
        <div>
          <span>Em acompanhamento crônico</span>
          <strong>{d.patients.filter((p) => p.conditions).length}</strong>
        </div>
        <div>
          <span>Visitas planejadas</span>
          <strong>{d.visits.filter((v) => v.status === 'PLANEJADA').length}</strong>
        </div>
        <div>
          <span>Visitas realizadas</span>
          <strong>{d.visits.filter((v) => v.status === 'REALIZADA').length}</strong>
        </div>
        <div>
          <span>Tentativas sem contato</span>
          <strong>{d.visits.filter((v) => v.status === 'SEM_CONTATO').length}</strong>
        </div>
      </div>
      <div className="toolbar">
        <Tabs
          value={tab}
          set={setTab}
          values={[
            { key: 'visitas', label: 'Agenda e histórico de visitas' },
            { key: 'cronicos', label: 'Pacientes crônicos' },
          ]}
        />
        {clinical && (
          <button className="button" onClick={() => open(f.condition())}>
            <Plus size={16} />
            Registrar condição
          </button>
        )}
      </div>
      {tab === 'visitas' ? (
        <Card
          title="Visitas à comunidade"
          subtitle={
            d.user.role === 'ACS'
              ? `Pacientes da sua área autorizada: ${d.user.area}`
              : 'Uma tentativa sem contato não é contabilizada como visita realizada.'
          }
        >
          {d.visits.length ? (
            <div className="visit-list">
              {d.visits.map((v) => (
                <div className="visit-row" key={v.id}>
                  <div className="visit-date">
                    <strong>{v.date.slice(8, 10)}</strong>
                    <span>
                      {new Intl.DateTimeFormat('pt-BR', {
                        month: 'short',
                        timeZone: 'America/Fortaleza',
                      }).format(new Date(`${v.date}T12:00:00-03:00`))}
                    </span>
                  </div>
                  <div className="visit-content">
                    <div>
                      <strong>{v.patient_name}</strong>
                      <Badge value={v.status} />
                    </div>
                    <small>
                      {v.acs_name} · {formatDate(v.date)}
                    </small>
                    {v.result && <p>{v.result}</p>}
                    {v.pending && <p className="pending-note">Pendência: {v.pending}</p>}
                  </div>
                  {canVisit && (d.user.role === 'COORDENACAO' || v.acs_id === d.user.id) && (
                    <button className="text-button" onClick={() => open(f.visit(v))}>
                      {v.status === 'PLANEJADA' ? 'Registrar resultado' : 'Atualizar'}
                      <ChevronRight size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Empty>Nenhuma visita registrada.</Empty>
          )}
        </Card>
      ) : (
        <Card
          title="Condições de acompanhamento"
          subtitle="Informações registradas por profissionais autorizados."
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Território</th>
                  <th>Condições e observações</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.patients
                  .filter((p) => p.conditions)
                  .map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.name}</strong>
                      </td>
                      <td>
                        {p.neighborhood}
                        <small className="cell-note">{p.area}</small>
                      </td>
                      <td className="text-cell">{p.conditions}</td>
                      <td>
                        {clinical && (
                          <button className="text-button" onClick={() => open(f.condition(p))}>
                            Atualizar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!d.patients.some((p) => p.conditions) && <Empty>Nenhuma condição registrada.</Empty>}
        </Card>
      )}
    </>
  );
}
export function Reports({ data: d }: PanelProps) {
  const [start, setStart] = useState(''),
    [end, setEnd] = useState('');
  const within = (date: string) =>
    (!start || date.slice(0, 10) >= start) && (!end || date.slice(0, 10) <= end);
  const tickets = d.tickets.filter((t) => within(t.date)),
    doses = d.doses.filter((v) => within(v.applied_at)),
    visits = d.visits.filter((v) => within(v.date)),
    movements = d.movements.filter((v) => within(v.created_at));
  const rows = [
    ['Atendimento', 'Fichas emitidas', tickets.length],
    ['Atendimento', 'Concluídas', tickets.filter((t) => t.status === 'CONCLUIDA').length],
    ['Atendimento', 'Ausentes', tickets.filter((t) => t.status === 'AUSENTE').length],
    ['Atendimento', 'Canceladas', tickets.filter((t) => t.status === 'CANCELADA').length],
    ['Vacinação', 'Doses aplicadas', doses.length],
    ['Vacinação', 'Pessoas vacinadas', new Set(doses.map((v) => v.patient_id)).size],
    ['Acompanhamento', 'Visitas realizadas', visits.filter((v) => v.status === 'REALIZADA').length],
    [
      'Acompanhamento',
      'Tentativas sem contato',
      visits.filter((v) => v.status === 'SEM_CONTATO').length,
    ],
    ['Acompanhamento', 'Visitas planejadas', visits.filter((v) => v.status === 'PLANEJADA').length],
    ['Estoque', 'Movimentações registradas (até 200 recentes)', movements.length],
  ];
  function download() {
    const csv =
      '\uFEFF' +
      [['Módulo', 'Indicador', 'Quantidade'], ...rows]
        .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(';'))
        .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-ubs-${d.today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <div className="toolbar">
        <div className="filters">
          <label>
            De
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            Até
            <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        <button className="button primary" onClick={download}>
          <Download size={16} />
          Exportar resumo CSV
        </button>
      </div>
      {start && end && start > end && (
        <div className="notice error">A data inicial é posterior à data final.</div>
      )}
      <div className="overview-grid">
        <Card
          title="Resumo por módulo"
          subtitle="Indicadores calculados a partir dos registros do sistema."
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Módulo</th>
                  <th>Indicador</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([module, label, value]) => (
                  <tr key={label}>
                    <td>{module}</td>
                    <td>{label}</td>
                    <td>
                      <strong>{value}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card
          title="Cobertura das campanhas"
          subtitle="Acumulado da campanha, independente do filtro de datas."
        >
          <div className="campaign-body">
            {d.coverage.map((c) => (
              <div className="coverage" key={`${c.campaign_id}-${c.neighborhood}`}>
                <small>{d.campaigns.find((v) => v.id === c.campaign_id)?.name}</small>
                <div>
                  <strong>{c.neighborhood}</strong>
                  <Badge tone="teal">
                    {c.population > 0
                      ? `${((c.people / c.population) * 100).toFixed(1)}%`
                      : 'Sem referência'}
                  </Badge>
                </div>
                <div className="progress-track">
                  <span
                    style={{
                      width: `${c.population > 0 ? Math.min((c.people / c.population) * 100, 100) : 0}%`,
                    }}
                  />
                </div>
                <small>
                  {c.people} pessoas únicas com critério completo / {c.population} de referência
                </small>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card
        title="Registro de atividades"
        subtitle="Últimas 40 alterações. Responsável e data preservados no banco."
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Atividade</th>
                <th>Responsável</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {d.audit.map((a) => (
                <tr key={a.id}>
                  <td>{a.action}</td>
                  <td>{a.user_name}</td>
                  <td>
                    {formatDate(a.created_at)} ·{' '}
                    {new Date(a.created_at).toLocaleTimeString('pt-BR', {
                      timeZone: 'America/Fortaleza',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
export function Management({ data: d, open }: PanelProps) {
  const [tab, setTab] = useState('equipe'),
    f = forms(d);
  return (
    <>
      <div className="toolbar">
        <Tabs
          value={tab}
          set={setTab}
          values={[
            { key: 'equipe', label: 'Equipe e perfis' },
            { key: 'servicos', label: 'Serviços' },
            { key: 'vagas', label: 'Períodos e vagas' },
          ]}
        />
        <div className="row-actions">
          <button className="button" onClick={() => open(f.service())}>
            Novo serviço
          </button>
          <button className="button" onClick={() => open(f.professional())}>
            <Plus size={16} />
            Novo profissional
          </button>
        </div>
      </div>
      <Card
        title={
          tab === 'equipe'
            ? 'Equipe da unidade'
            : tab === 'servicos'
              ? 'Serviços disponíveis'
              : 'Agenda de vagas'
        }
        subtitle={
          tab === 'equipe'
            ? 'O perfil determina as funções autorizadas no backend.'
            : 'Configuração local para uma única UBS.'
        }
      >
        <div className="table-wrap">
          <table>
            {tab === 'equipe' ? (
              <>
                <thead>
                  <tr>
                    <th>Profissional</th>
                    <th>E-mail</th>
                    <th>Perfil</th>
                    <th>Área autorizada</th>
                  </tr>
                </thead>
                <tbody>
                  {d.professionals.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="person">
                          <span className="avatar small">{initials(p.name)}</span>
                          <strong>{p.name}</strong>
                        </div>
                      </td>
                      <td>{p.email}</td>
                      <td>
                        <Badge tone="blue">{roleLabels[p.role]}</Badge>
                      </td>
                      <td>{p.area || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </>
            ) : tab === 'servicos' ? (
              <>
                <thead>
                  <tr>
                    <th>Serviço</th>
                    <th>Períodos cadastrados</th>
                  </tr>
                </thead>
                <tbody>
                  {d.services.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.name}</strong>
                      </td>
                      <td>{d.slots.filter((v) => v.service_id === s.id).length}</td>
                    </tr>
                  ))}
                </tbody>
              </>
            ) : (
              <>
                <thead>
                  <tr>
                    <th>Serviço</th>
                    <th>Profissional</th>
                    <th>Data / período</th>
                    <th>Ocupação</th>
                  </tr>
                </thead>
                <tbody>
                  {d.slots.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.service_name}</strong>
                      </td>
                      <td>{s.professional_name}</td>
                      <td>
                        {formatDate(s.date)} · {s.period}
                        <small className="cell-note">Início às {s.starts_at}</small>
                      </td>
                      <td>
                        <Badge tone={s.reserved >= s.capacity ? 'amber' : 'teal'}>
                          {s.reserved} / {s.capacity}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
          </table>
        </div>
      </Card>
      <div className="info-strip">
        <LockKeyhole size={17} />
        Os perfis são fixos nesta versão. Edição de permissões e inativação de profissionais ficam
        para a próxima etapa.
      </div>
    </>
  );
}
