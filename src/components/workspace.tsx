'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  HeartPulse,
  LayoutDashboard,
  Users,
  Ticket,
  Package,
  Syringe,
  MapPinned,
  ChartNoAxesCombined,
  Settings,
  LogOut,
  ChevronRight,
  Menu,
  X,
  RefreshCw,
  Plus,
  ArrowUpRight,
  CalendarDays,
  ShieldCheck,
} from 'lucide-react';
import {
  access,
  sections,
  sectionLabels,
  roleLabels,
  type Snapshot,
  type Section,
} from '@/domain/model';
import { Badge, Card, Empty, FormModal, formatDate, initials, type FormSpec } from './ui';
import { forms } from './forms';
import {
  Patients,
  Appointments,
  Inventory,
  Vaccination,
  Followup,
  Reports,
  Management,
} from './sections';
const icons = {
  inicio: LayoutDashboard,
  pacientes: Users,
  atendimento: Ticket,
  estoque: Package,
  vacinacao: Syringe,
  acompanhamento: MapPinned,
  relatorios: ChartNoAxesCombined,
  gestao: Settings,
};
const descriptions: Record<Section, string> = {
  inicio: 'Um olhar sobre o cuidado e a rotina da sua unidade.',
  pacientes: 'Um cadastro único para um cuidado mais próximo.',
  atendimento: 'Organize as vagas, confirme presenças e acompanhe a fila.',
  estoque: 'Medicamentos e vacinas sob controle, lote a lote.',
  vacinacao: 'Cada dose registrada, cada pessoa acompanhada.',
  acompanhamento: 'O cuidado continua além da unidade.',
  relatorios: 'Informações para acompanhar e planejar o trabalho.',
  gestao: 'Equipe, serviços e disponibilidade de atendimento.',
};
export type PanelProps = {
  data: Snapshot;
  open: (spec: FormSpec) => void;
  act: (resource: string, payload: Record<string, unknown>) => Promise<void>;
  busy: boolean;
};
export function Workspace({ initial, section }: { initial: Snapshot; section: Section }) {
  const [data, setData] = useState(initial),
    [modal, setModal] = useState<FormSpec | null>(null),
    [toast, setToast] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [menu, setMenu] = useState(false);
  useEffect(() => {
    setData(initial);
    setMenu(false);
    setToast('');
    setError('');
  }, [initial]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function reload() {
    const response = await fetch('/api/snapshot', { cache: 'no-store' });
    if (response.status === 401) {
      window.location.assign('/login');
      return;
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    setData(result);
  }
  async function mutate(resource: string, payload: Record<string, unknown>) {
    const response = await fetch(`/api/${resource}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (response.status === 401) {
      window.location.assign('/login');
      return;
    }
    if (!response.ok) throw new Error(result.error);
    await reload();
    setToast('Registro salvo com sucesso.');
  }
  async function act(resource: string, payload: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await mutate(resource, payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao concluir a operação.');
    } finally {
      setBusy(false);
    }
  }
  const f = forms(data),
    props = { data, open: setModal, act, busy };
  const quick =
    section === 'pacientes' && ['COORDENACAO', 'RECEPCAO'].includes(data.user.role)
      ? () => setModal(f.patient())
      : section === 'atendimento' && data.user.role !== 'PROFISSIONAL'
        ? () => setModal(f.reservation())
        : section === 'estoque'
          ? () => setModal(f.movement())
          : section === 'vacinacao' && data.user.role !== 'PACIENTE'
            ? () => setModal(f.dose())
            : section === 'acompanhamento' && ['COORDENACAO', 'ACS'].includes(data.user.role)
              ? () => setModal(f.visit())
              : section === 'gestao'
                ? () => setModal(f.slot())
                : null;
  const quickLabels: Partial<Record<Section, string>> = {
    pacientes: 'Novo paciente',
    atendimento: 'Emitir ficha',
    estoque: 'Movimentar estoque',
    vacinacao: 'Registrar aplicação',
    acompanhamento: 'Nova visita',
    gestao: 'Disponibilizar vagas',
  };
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <Link className="brand" href="/inicio">
          <span className="brand-mark">
            <HeartPulse size={24} />
          </span>
          <span>
            UBS<span className="brand-light">conecta</span>
          </span>
        </Link>
        <div className="unit-switch">
          <span className="unit-icon">
            <HeartPulse size={19} />
          </span>
          <div>
            <strong>UBS Jardim Esperança</strong>
            <small>Unidade de demonstração</small>
          </div>
        </div>
        <span className="nav-label">ESPAÇO DE TRABALHO</span>
        <nav aria-label="Navegação principal">
          {sections
            .filter((s) => access[s].includes(data.user.role))
            .map((s) => {
              const Icon = icons[s];
              return (
                <Link
                  key={s}
                  href={`/${s}`}
                  className={`nav-link ${section === s ? 'active' : ''}`}
                  aria-current={section === s ? 'page' : undefined}
                >
                  <Icon size={19} />
                  <span>{sectionLabels[s]}</span>
                  {section === s && <span className="active-dot" />}
                </Link>
              );
            })}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-note">
            <ShieldCheck size={19} />
            <div>
              <strong>Protótipo em construção</strong>
              <p>Dados fictícios para explorar os fluxos da unidade.</p>
            </div>
          </div>
          <div className="profile">
            <span className="avatar">{initials(data.user.name)}</span>
            <div>
              <strong>{data.user.name.split(' ').slice(0, 2).join(' ')}</strong>
              <small>{roleLabels[data.user.role]}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Sair do sistema"
              onClick={async () => {
                await fetch('/api/logout', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: '{}',
                });
                window.location.assign('/login');
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="sidebar-overlay"
          aria-label="Fechar menu"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-toggle"
              aria-label="Abrir menu"
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X /> : <Menu />}
            </button>
            <span>Minha unidade</span>
            <ChevronRight size={14} />
            <strong>{sectionLabels[section]}</strong>
          </div>
          <div className="topbar-right">
            <span className="live-dot" /> <span>Ambiente local</span>
            <span className="topbar-divider" />
            <CalendarDays size={16} />
            <span>{formatDate(data.today)}</span>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {section === 'inicio' ? 'SEU DIA, MAIS ORGANIZADO' : 'GESTÃO DA UBS'}
              </div>
              <h1>
                {section === 'inicio'
                  ? `Olá, ${data.user.name.split(' ')[0]}`
                  : sectionLabels[section]}
                {section === 'inicio' && <span className="hello-dot">.</span>}
              </h1>
              <p>{descriptions[section]}</p>
            </div>
            <div className="heading-actions">
              <button
                className="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await reload();
                    setToast('Informações atualizadas.');
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Falha ao atualizar.');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <RefreshCw size={16} />
                <span>Atualizar</span>
              </button>
              {quick && (
                <button className="button primary" onClick={quick}>
                  <Plus size={17} />
                  {quickLabels[section]}
                </button>
              )}
            </div>
          </div>
          {error && (
            <div className="notice error" role="alert">
              {error}
              <button
                aria-label="Dispensar erro"
                className="icon-button"
                onClick={() => setError('')}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {section === 'inicio' && <Overview {...props} />}{' '}
          {section === 'pacientes' && <Patients {...props} />}{' '}
          {section === 'atendimento' && <Appointments {...props} />}{' '}
          {section === 'estoque' && <Inventory {...props} />}{' '}
          {section === 'vacinacao' && <Vaccination {...props} />}{' '}
          {section === 'acompanhamento' && <Followup {...props} />}{' '}
          {section === 'relatorios' && <Reports {...props} />}{' '}
          {section === 'gestao' && <Management {...props} />}
          <footer className="workspace-footer">
            <span>UBS Conecta · Cuidar também é organizar.</span>
            <span>Versão inicial · Dados de demonstração</span>
          </footer>
        </main>
      </div>
      {modal && <FormModal spec={modal} onClose={() => setModal(null)} onSubmit={mutate} />}{' '}
      {toast && (
        <div className="toast" role="status">
          <ShieldCheck size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}
function Overview({ data: d, open }: PanelProps) {
  const day = d.tickets.filter((t) => t.date === d.today),
    waiting = day.filter((t) => t.status === 'AGUARDANDO'),
    completed = day.filter((t) => t.status === 'CONCLUIDA');
  const low = d.items.filter((i) => i.usable <= i.minimum),
    expired = d.lots.filter((l) => l.expires_at < d.today && l.quantity > 0),
    near = d.lots.filter(
      (l) =>
        l.expires_at >= d.today &&
        new Date(l.expires_at).getTime() - new Date(d.today).getTime() <= l.alert_days * 86400000 &&
        l.quantity > 0,
    );
  const f = forms(d),
    isPatient = d.user.role === 'PACIENTE',
    canTickets = access.atendimento.includes(d.user.role),
    canStock = access.estoque.includes(d.user.role);
  const stats = isPatient
    ? [
        {
          label: 'Minhas fichas ativas',
          value: d.tickets.filter((t) => !['CONCLUIDA', 'CANCELADA'].includes(t.status)).length,
          note: 'Acompanhe suas reservas',
          icon: Ticket,
          tone: 'teal',
        },
        {
          label: 'Doses registradas',
          value: d.doses.length,
          note: 'Seu histórico de vacinação',
          icon: Syringe,
          tone: 'blue',
        },
        {
          label: 'Doses previstas',
          value: d.pendingDoses.filter((p) => !p.done).length,
          note: 'Conforme orientação da equipe',
          icon: CalendarDays,
          tone: 'amber',
        },
        {
          label: 'Visitas realizadas',
          value: d.visits.filter((v) => v.status === 'REALIZADA').length,
          note: 'Cuidado perto de você',
          icon: MapPinned,
          tone: 'purple',
        },
      ]
    : d.user.role === 'ESTOQUE'
      ? [
          {
            label: 'Itens cadastrados',
            value: d.items.length,
            note: 'Medicamentos e vacinas',
            icon: Package,
            tone: 'teal',
          },
          {
            label: 'Lotes em estoque',
            value: d.lots.length,
            note: 'Rastreabilidade por lote',
            icon: Package,
            tone: 'blue',
          },
          {
            label: 'Reposição necessária',
            value: low.length,
            note: 'Saldo utilizável ≤ mínimo',
            icon: ActivityIcon,
            tone: 'amber',
          },
          {
            label: 'Lotes vencidos',
            value: expired.length,
            note: 'Bloqueados para uso',
            icon: ShieldCheck,
            tone: 'purple',
          },
        ]
      : d.user.role === 'ACS'
        ? [
            {
              label: 'Pacientes da área',
              value: d.patients.length,
              note: d.user.area,
              icon: Users,
              tone: 'teal',
            },
            {
              label: 'Visitas planejadas',
              value: d.visits.filter((v) => v.status === 'PLANEJADA').length,
              note: 'Próximos acompanhamentos',
              icon: CalendarDays,
              tone: 'blue',
            },
            {
              label: 'Visitas realizadas',
              value: d.visits.filter((v) => v.status === 'REALIZADA').length,
              note: 'Tentativas sem contato excluídas',
              icon: MapPinned,
              tone: 'amber',
            },
            {
              label: 'Pacientes crônicos',
              value: d.patients.filter((p) => p.conditions).length,
              note: 'Condições registradas pela equipe',
              icon: HeartPulse,
              tone: 'purple',
            },
          ]
        : [
            {
              label: 'Fichas de hoje',
              value: day.filter((t) => t.status !== 'CANCELADA').length,
              note: 'Reservas e atendimentos do dia',
              icon: Ticket,
              tone: 'teal',
            },
            {
              label: 'Aguardando na fila',
              value: waiting.length,
              note: 'Com presença confirmada',
              icon: Users,
              tone: 'blue',
            },
            {
              label: 'Atendimentos concluídos',
              value: completed.length,
              note: 'Cuidado realizado hoje',
              icon: HeartPulse,
              tone: 'purple',
            },
            {
              label: 'Pacientes cadastrados',
              value: d.patients.length,
              note: 'Cadastro integrado da unidade',
              icon: MapPinned,
              tone: 'amber',
            },
          ];
  return (
    <>
      <div className="welcome-banner">
        <div>
          <span className="banner-kicker">
            {isPatient ? 'SEU ESPAÇO DE CUIDADO' : 'CONECTADOS PELO CUIDADO'}
          </span>
          <h2>
            {isPatient ? 'Sua unidade, mais perto de você.' : 'Cada atendimento faz a diferença.'}
          </h2>
          <p>
            {isPatient
              ? 'Consulte suas fichas, vacinas e acompanhamentos.'
              : 'Acompanhe a rotina, organize a equipe e cuide da comunidade.'}
          </p>
          {canTickets && (
            <button
              className="banner-link"
              onClick={() =>
                d.user.role === 'PROFISSIONAL'
                  ? window.location.assign('/atendimento')
                  : open(f.reservation())
              }
            >
              {isPatient ? 'Solicitar uma ficha' : 'Consultar vagas e emitir ficha'}
              <ArrowUpRight size={17} />
            </button>
          )}
        </div>
        <div className="banner-art" aria-hidden="true">
          <span className="art-ring ring-1" />
          <span className="art-ring ring-2" />
          <HeartPulse size={92} strokeWidth={1.1} />
          <span className="art-spark">+</span>
        </div>
      </div>
      <div className="stats-grid">
        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="stat-top">
              <span>{s.label}</span>
              <span className={`stat-icon ${s.tone}`}>
                <s.icon size={20} />
              </span>
            </div>
            <strong>{s.value.toString().padStart(2, '0')}</strong>
            <small>{s.note}</small>
          </div>
        ))}
      </div>
      <div className="overview-grid">
        <Card
          title={canTickets ? 'Atendimentos de hoje' : 'Acompanhamento da unidade'}
          subtitle={
            canTickets
              ? 'Presenças, chamadas e próximos atendimentos'
              : 'Informações disponíveis para seu perfil'
          }
          action={
            <Link
              href={canTickets ? '/atendimento' : canStock ? '/estoque' : '/acompanhamento'}
              className="text-button"
            >
              Ver todos <ArrowUpRight size={15} />
            </Link>
          }
        >
          {canTickets ? (
            day.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Paciente</th>
                      <th>Serviço</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {day.slice(0, 6).map((t) => (
                      <tr key={t.id}>
                        <td>
                          <div className="person">
                            <span className="avatar small">{initials(t.patient_name)}</span>
                            <div>
                              <strong>{t.patient_name}</strong>
                              <small>
                                Ficha {String(t.number).padStart(3, '0')}
                                {t.priority ? ' · Prioritário' : ''}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>
                          {t.service_name}
                          <small className="cell-note">{t.period}</small>
                        </td>
                        <td>
                          <Badge value={t.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>Nenhuma ficha para hoje. Consulte os próximos períodos.</Empty>
            )
          ) : canStock ? (
            <div className="simple-list">
              {d.items.map((i) => (
                <div key={i.id}>
                  <span>
                    {i.name}
                    <small>Saldo utilizável</small>
                  </span>
                  <strong>
                    {i.usable} <small>{i.unit}</small>
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="simple-list">
              {d.visits.length ? (
                d.visits.slice(0, 5).map((v) => (
                  <div key={v.id}>
                    <span>
                      {v.patient_name}
                      <small>{formatDate(v.date)}</small>
                    </span>
                    <Badge value={v.status} />
                  </div>
                ))
              ) : (
                <Empty>Nenhuma visita registrada.</Empty>
              )}
            </div>
          )}
        </Card>
        <Card title="Pontos de atenção" subtitle="O que merece um olhar hoje">
          <div className="attention-list">
            {canStock && (
              <>
                <Attention
                  tone="amber"
                  title={`${low.length} itens precisam de reposição`}
                  description={
                    low.map((i) => i.name).join(', ') || 'Os saldos estão acima do mínimo.'
                  }
                  href="/estoque"
                />
                <Attention
                  tone="red"
                  title={`${expired.length} lotes vencidos`}
                  description="Lotes vencidos não podem ser usados em saídas ou aplicações."
                  href="/estoque"
                />
                <Attention
                  tone="blue"
                  title={`${near.length} lotes próximos da validade`}
                  description="Consulte o prazo de alerta de cada item."
                  href="/estoque"
                />
              </>
            )}
            {access.acompanhamento.includes(d.user.role) && (
              <Attention
                tone="teal"
                title={`${d.visits.filter((v) => v.status === 'PLANEJADA').length} visitas planejadas`}
                description="Acompanhe as próximas visitas e pendências."
                href="/acompanhamento"
              />
            )}
            {canTickets && (
              <Attention
                tone="blue"
                title={`${day.filter((t) => t.status === 'RESERVADA').length} presenças a confirmar`}
                description="A entrada na fila acontece após a confirmação na recepção."
                href="/atendimento"
              />
            )}
          </div>
        </Card>
      </div>
      <div className="section-mini-heading">
        <h2>Acesso rápido</h2>
        <span>Os próximos passos da sua rotina</span>
      </div>
      <div className="quick-grid">
        {sections
          .filter(
            (s) =>
              s !== 'inicio' &&
              s !== 'relatorios' &&
              s !== 'gestao' &&
              access[s].includes(d.user.role),
          )
          .slice(0, 4)
          .map((s) => {
            const Icon = icons[s];
            return (
              <Link className="quick-card" key={s} href={`/${s}`}>
                <span className="quick-icon">
                  <Icon size={21} />
                </span>
                <strong>{sectionLabels[s]}</strong>
                <ChevronRight size={17} />
              </Link>
            );
          })}
      </div>
    </>
  );
}
const ActivityIcon = ChartNoAxesCombined;
function Attention({
  title,
  description,
  tone,
  href,
}: {
  title: string;
  description: string;
  tone: string;
  href: string;
}) {
  return (
    <Link className={`attention ${tone}`} href={href}>
      <span className="attention-dot" />
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <ChevronRight size={15} />
    </Link>
  );
}
