'use client';
import { useState, type FormEvent } from 'react';
import { HeartPulse, ArrowRight, ShieldCheck, Users, CalendarDays, Activity } from 'lucide-react';
export function Login() {
  const [register, setRegister] = useState(false),
    [email, setEmail] = useState('coordenacao@ubs.demo'),
    [password, setPassword] = useState('Demo@12345'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = Object.fromEntries(new FormData(event.currentTarget));
      const response = await fetch(`/api/${register ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      window.location.assign('/inicio');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível conectar.');
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <a className="brand" href="/login">
          <span className="brand-mark">
            <HeartPulse size={25} />
          </span>
          <span>
            UBS<span className="brand-light">conecta</span>
          </span>
        </a>
        <div className="story-content">
          <span className="eyebrow">MAIS PERTO DE QUEM PRECISA</span>
          <h1>
            O cuidado começa
            <br />
            com uma boa
            <br />
            <em>conexão.</em>
          </h1>
          <p>
            Pacientes, equipe e informações no mesmo lugar. Mais organização para o dia a dia da sua
            unidade.
          </p>
          <div className="story-features">
            <span>
              <CalendarDays />
              Atendimento organizado
            </span>
            <span>
              <Users />
              Acompanhamento próximo
            </span>
            <span>
              <Activity />
              Gestão integrada
            </span>
          </div>
        </div>
        <span className="story-footer">Atenção Primária à Saúde · Protótipo acadêmico</span>
      </section>
      <section className="login-panel">
        <div className="login-box">
          <span className="chip">Ambiente de demonstração</span>
          <h2>{register ? 'Seu primeiro acesso' : 'Bem-vindo de volta'}</h2>
          <p className="muted">
            {register
              ? 'Crie seu cadastro para consultar vagas e acompanhar suas fichas.'
              : 'Entre para acompanhar o que acontece na sua unidade.'}
          </p>
          <form onSubmit={submit} className="login-form">
            {register && (
              <>
                <label>
                  Nome completo
                  <input name="name" required minLength={3} />
                </label>
                <div className="form-grid">
                  <label>
                    Documento (identificador)
                    <input name="document" required minLength={5} />
                  </label>
                  <label>
                    Data de nascimento
                    <input name="birth_date" type="date" required />
                  </label>
                  <label>
                    Bairro
                    <input name="neighborhood" required />
                  </label>
                  <label>
                    Área da UBS
                    <select name="area">
                      <option>Área 01</option>
                      <option>Área 02</option>
                    </select>
                  </label>
                </div>
                <label>
                  Telefone
                  <input name="phone" type="tel" />
                </label>
              </>
            )}
            <label>
              E-mail
              <input
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={register ? 'new-password' : 'current-password'}
                minLength={register ? 8 : 1}
                required
              />
            </label>
            {error && (
              <div className="notice error" role="alert">
                {error}
              </div>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? 'Conectando…' : register ? 'Criar cadastro' : 'Entrar no sistema'}
              <ArrowRight size={18} />
            </button>
          </form>
          <button
            className="text-button register-link"
            onClick={() => {
              setRegister(!register);
              setError('');
              setEmail('');
              setPassword('');
            }}
          >
            {register ? 'Já tenho uma conta. Entrar' : 'Primeiro acesso? Cadastre-se como paciente'}
          </button>
          {!register && (
            <div className="demo-accounts">
              <span className="eyebrow">EXPERIMENTE UM PERFIL</span>
              <div>
                {[
                  ['coordenacao', 'Coordenação'],
                  ['recepcao', 'Recepção'],
                  ['saude', 'Saúde'],
                  ['estoque', 'Estoque'],
                  ['acs', 'ACS'],
                  ['paciente', 'Paciente'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setEmail(`${key}@ubs.demo`);
                      setPassword('Demo@12345');
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <small>
                Contas fictícias · senha compartilhada: <strong>Demo@12345</strong>
              </small>
            </div>
          )}
          <p className="privacy-note">
            <ShieldCheck size={15} /> Protótipo local. Utilize apenas dados fictícios.
          </p>
        </div>
      </section>
    </main>
  );
}
