import { z } from 'zod';
import { itemSchema, lotSchema, movementSchema, text } from '@/domain/schemas';
import { ensure, today } from '@/domain/rules';
import type { User, Lot } from '@/domain/model';
import { audit, id, now, one, run, transaction } from '../db';
import { authorize } from '../security';
export async function createItem(user: User, input: unknown) {
  authorize(user, ['COORDENACAO', 'ESTOQUE']);
  const d = itemSchema.parse(input);
  return await transaction(async () => {
    const key = id();
    await run(
      'INSERT INTO items VALUES(?,?,?,?,?,?)',
      key,
      d.name,
      d.kind,
      d.unit,
      d.minimum,
      d.alert_days,
    );
    await audit(user.id, 'Item cadastrado', key);
    return { id: key };
  });
}
export async function createLot(user: User, input: unknown) {
  authorize(user, ['COORDENACAO', 'ESTOQUE']);
  const d = lotSchema.parse(input);
  return await transaction(async () => {
    ensure(await one('SELECT id FROM items WHERE id=?', d.item_id), 'Item não encontrado.');
    const key = id();
    await run(
      'INSERT INTO lots VALUES(?,?,?,?,?,0)',
      key,
      d.item_id,
      d.code,
      d.expires_at,
      d.quantity,
    );
    await run(
      'INSERT INTO movements VALUES(?,?,?,?,?,?)',
      id(),
      key,
      d.quantity,
      'Saldo inicial',
      user.id,
      now(),
    );
    await audit(user.id, 'Lote cadastrado', key, d);
    return { id: key };
  });
}
export async function changeStock(user: User, input: unknown) {
  authorize(user, ['COORDENACAO', 'ESTOQUE']);
  const d = movementSchema.parse(input);
  return await transaction(async () => {
    const lot = await one<Lot>('SELECT * FROM lots WHERE id=?', d.lot_id);
    ensure(lot, 'Lote não encontrado.', 404);
    const delta =
      d.kind === 'ENTRADA' || (d.kind === 'AJUSTE' && d.direction === 'MAIS')
        ? d.quantity
        : -d.quantity;
    if (d.kind === 'SAIDA')
      ensure(
        lot.expires_at >= today() && !lot.blocked,
        'Lotes vencidos ou bloqueados não podem ser utilizados.',
      );
    ensure(
      lot.quantity + delta >= 0,
      'Saldo insuficiente. O estoque não pode ficar negativo.',
      409,
    );
    await run('UPDATE lots SET quantity=quantity+? WHERE id=?', delta, lot.id);
    await run(
      'INSERT INTO movements VALUES(?,?,?,?,?,?)',
      id(),
      lot.id,
      delta,
      `${d.kind}: ${d.reason}`,
      user.id,
      now(),
    );
    await audit(user.id, 'Estoque movimentado', lot.id, {
      before: lot.quantity,
      delta,
      reason: d.reason,
    });
    return { id: lot.id };
  });
}
export async function blockLot(user: User, input: unknown) {
  authorize(user, ['COORDENACAO', 'ESTOQUE']);
  const d = z.object({ id: text, blocked: z.boolean(), reason: text.min(3) }).parse(input);
  return await transaction(async () => {
    ensure(await one('SELECT id FROM lots WHERE id=?', d.id), 'Lote não encontrado.', 404);
    await run('UPDATE lots SET blocked=? WHERE id=?', d.blocked ? 1 : 0, d.id);
    await audit(user.id, d.blocked ? 'Lote bloqueado' : 'Lote desbloqueado', d.id, {
      reason: d.reason,
    });
    return { id: d.id };
  });
}
