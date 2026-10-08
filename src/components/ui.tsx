'use client';
import { useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { X, LoaderCircle, Inbox } from 'lucide-react';
import { statusLabels } from '@/domain/rules';
export function formatDate(value: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Fortaleza',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value.length === 10 ? `${value}T12:00:00-03:00` : value));
}
export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((v) => v[0])
    .join('');
}
export function Badge({
  value,
  children,
  tone,
}: {
  value?: string;
  children?: ReactNode;
  tone?: string;
}) {
  return (
    <span className={`badge ${tone || value?.toLowerCase() || ''}`}>
      {children || statusLabels[value || ''] || value}
    </span>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <Inbox size={30} />
      <p>{children}</p>
    </div>
  );
}
export function Card({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      <div className="card-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export type Field = {
  name: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  value?: string | number;
  required?: boolean;
  min?: number;
  max?: number;
  wide?: boolean;
};
export type FormSpec = {
  title: string;
  description?: string;
  resource: string;
  fields: Field[];
  extra?: Record<string, unknown>;
  submitLabel?: string;
};
export function FormModal({
  spec,
  onClose,
  onSubmit,
}: {
  spec: FormSpec;
  onClose: () => void;
  onSubmit: (resource: string, payload: Record<string, unknown>) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError('');
    try {
      await onSubmit(spec.resource, { ...values, ...spec.extra });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="modal-heading">
          <div>
            <span className="eyebrow">UBS CONECTA</span>
            <h2>{spec.title}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Fechar formulário"
            onClick={onClose}
            disabled={busy}
          >
            <X />
          </button>
        </div>
        {spec.description && <p className="muted modal-description">{spec.description}</p>}
        <div className="form-grid">
          {spec.fields.map((f) => (
            <label key={f.name} className={f.wide ? 'wide' : ''}>
              {f.label}
              {f.type === 'textarea' ? (
                <textarea
                  name={f.name}
                  defaultValue={f.value}
                  required={f.required !== false}
                  maxLength={1000}
                  rows={3}
                />
              ) : f.options ? (
                <select name={f.name} defaultValue={f.value ?? ''} required={f.required !== false}>
                  <option value="">Selecione…</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  name={f.name}
                  type={f.type || 'text'}
                  defaultValue={f.value}
                  required={f.required !== false}
                  min={f.min}
                  max={f.max}
                  maxLength={f.type === 'password' ? 128 : 500}
                />
              )}
            </label>
          ))}
        </div>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-footer">
          <button className="button" type="button" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? (
              <>
                <LoaderCircle size={16} className="spin" /> Salvando…
              </>
            ) : (
              spec.submitLabel || 'Salvar registro'
            )}
          </button>
        </div>
      </form>
    </dialog>
  );
}
