import type { User } from '@/domain/model';
import { DomainError } from '@/domain/rules';
import { savePatient, recordCondition } from './modules/patients';
import { reserve, ticketAction } from './modules/appointments';
import { createItem, createLot, changeStock, blockLot } from './modules/inventory';
import {
  createCampaign,
  saveTarget,
  applyDose,
  planDose,
  closePendingDose,
  saveVisit,
} from './modules/care';
import { createProfessional, createService, createSlot } from './modules/management';
export async function command(resource: string, user: User, input: unknown) {
  const payload = input as {
    id?: string;
  };
  switch (resource) {
    case 'patients':
      return await savePatient(user, input, payload.id);
    case 'conditions':
      return await recordCondition(user, input);
    case 'reservations':
      return await reserve(user, input);
    case 'tickets':
      return await ticketAction(user, input);
    case 'items':
      return await createItem(user, input);
    case 'lots':
      return await createLot(user, input);
    case 'movements':
      return await changeStock(user, input);
    case 'lot-status':
      return await blockLot(user, input);
    case 'campaigns':
      return await createCampaign(user, input);
    case 'targets':
      return await saveTarget(user, input);
    case 'doses':
      return await applyDose(user, input);
    case 'pending-doses':
      return await planDose(user, input);
    case 'close-pending-dose':
      return await closePendingDose(user, input);
    case 'visits':
      return await saveVisit(user, input, payload.id);
    case 'professionals':
      return await createProfessional(user, input);
    case 'services':
      return await createService(user, input);
    case 'slots':
      return await createSlot(user, input);
    default:
      throw new DomainError('Operação não encontrada.', 404);
  }
}
