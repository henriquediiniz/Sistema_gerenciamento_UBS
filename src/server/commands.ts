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
export function command(resource: string, user: User, input: unknown) {
  const payload = input as { id?: string };
  switch (resource) {
    case 'patients':
      return savePatient(user, input, payload.id);
    case 'conditions':
      return recordCondition(user, input);
    case 'reservations':
      return reserve(user, input);
    case 'tickets':
      return ticketAction(user, input);
    case 'items':
      return createItem(user, input);
    case 'lots':
      return createLot(user, input);
    case 'movements':
      return changeStock(user, input);
    case 'lot-status':
      return blockLot(user, input);
    case 'campaigns':
      return createCampaign(user, input);
    case 'targets':
      return saveTarget(user, input);
    case 'doses':
      return applyDose(user, input);
    case 'pending-doses':
      return planDose(user, input);
    case 'close-pending-dose':
      return closePendingDose(user, input);
    case 'visits':
      return saveVisit(user, input, payload.id);
    case 'professionals':
      return createProfessional(user, input);
    case 'services':
      return createService(user, input);
    case 'slots':
      return createSlot(user, input);
    default:
      throw new DomainError('Operação não encontrada.', 404);
  }
}
