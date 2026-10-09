import type { Snapshot, User } from '@/domain/model';
import { today } from '@/domain/rules';
import { all } from './db';
import { publicUserColumns } from './security';
export async function snapshot(user: User): Promise<Snapshot> {
  const self = user.role === 'PACIENTE',
    acs = user.role === 'ACS',
    coord = user.role === 'COORDENACAO';
  const scope = self ? ' WHERE p.id=?' : acs ? ' WHERE p.area=?' : '';
  const params = self ? [user.patient_id!] : acs ? [user.area] : [];
  const patientIds = `SELECT p.id FROM patients p${scope}`;
  const patientAccess = user.role !== 'ESTOQUE';
  const appointments = ['COORDENACAO', 'RECEPCAO', 'PROFISSIONAL', 'PACIENTE'].includes(user.role);
  const clinical = ['COORDENACAO', 'PROFISSIONAL', 'PACIENTE'].includes(user.role);
  const inventory = ['COORDENACAO', 'ESTOQUE', 'PROFISSIONAL'].includes(user.role);
  const followup = ['COORDENACAO', 'PROFISSIONAL', 'ACS', 'PACIENTE'].includes(user.role);
  return {
    user,
    today: today(),
    patients: patientAccess
      ? await all(
          `SELECT p.id,p.name,p.document,p.birth_date,p.phone,p.neighborhood,p.area,p.acs_id,${user.role === 'RECEPCAO' ? "''" : 'p.conditions'} AS conditions,p.created_at FROM patients p${scope} ORDER BY p.name`,
          ...params,
        )
      : [],
    professionals: self
      ? []
      : await all(
          `SELECT ${coord ? publicUserColumns : "id,name,'' AS email,role,area,patient_id"} FROM users WHERE role!='PACIENTE'${acs ? ' AND id=?' : ''} ORDER BY name`,
          ...(acs ? [user.id] : []),
        ),
    services: appointments ? await all('SELECT * FROM services ORDER BY name') : [],
    slots: appointments
      ? await all(
          `SELECT s.*,v.name service_name,u.name professional_name,(SELECT COUNT(*) FROM tickets t WHERE t.slot_id=s.id AND t.status!='CANCELADA') reserved FROM slots s JOIN services v ON v.id=s.service_id JOIN users u ON u.id=s.professional_id WHERE s.date>=? ORDER BY s.date,s.starts_at`,
          today(),
        )
      : [],
    tickets: appointments
      ? await all(
          `SELECT t.*,p.name patient_name,v.name service_name,s.date,s.period FROM tickets t JOIN patients p ON p.id=t.patient_id JOIN slots s ON s.id=t.slot_id JOIN services v ON v.id=s.service_id WHERE t.patient_id IN (${patientIds}) ORDER BY s.date DESC,t.priority DESC,t.checked_in_at,t.number`,
          ...params,
        )
      : [],
    items:
      inventory || clinical
        ? await all(
            `SELECT i.*,(SELECT COALESCE(SUM(l.quantity),0) FROM lots l WHERE l.item_id=i.id AND l.blocked=0 AND l.expires_at>=?) usable FROM items i ${user.role === 'PROFISSIONAL' || self ? "WHERE i.kind='VACINA'" : ''} ORDER BY i.name`,
            today(),
          )
        : [],
    lots: inventory
      ? await all(
          `SELECT l.*,i.name item_name,i.kind,i.unit,i.alert_days FROM lots l JOIN items i ON i.id=l.item_id ${user.role === 'PROFISSIONAL' ? "WHERE i.kind='VACINA'" : ''} ORDER BY l.expires_at`,
        )
      : [],
    movements:
      coord || user.role === 'ESTOQUE'
        ? await all(
            'SELECT m.*,i.name item_name,l.code lot_code,u.name user_name FROM movements m JOIN lots l ON l.id=m.lot_id JOIN items i ON i.id=l.item_id JOIN users u ON u.id=m.user_id ORDER BY m.created_at DESC LIMIT 200',
          )
        : [],
    campaigns: clinical
      ? await all(
          'SELECT c.*,i.name item_name FROM campaigns c JOIN items i ON i.id=c.item_id ORDER BY c.ends_at DESC',
        )
      : [],
    coverage:
      coord || user.role === 'PROFISSIONAL'
        ? await all(
            `SELECT ct.*, (SELECT COUNT(*) FROM (SELECT d.patient_id FROM doses d JOIN patients p ON p.id=d.patient_id WHERE d.campaign_id=ct.campaign_id AND p.neighborhood=ct.neighborhood GROUP BY d.patient_id HAVING COUNT(DISTINCT d.dose)>=c.required_doses)) people FROM campaign_targets ct JOIN campaigns c ON c.id=ct.campaign_id`,
          )
        : [],
    doses: clinical
      ? await all(
          `SELECT d.id,d.patient_id,d.lot_id,d.campaign_id,d.dose,d.applied_at,d.user_id,p.name patient_name,i.name item_name,l.code lot_code,u.name user_name FROM doses d JOIN patients p ON p.id=d.patient_id JOIN lots l ON l.id=d.lot_id JOIN items i ON i.id=l.item_id JOIN users u ON u.id=d.user_id WHERE d.patient_id IN (${patientIds}) ORDER BY d.applied_at DESC`,
          ...params,
        )
      : [],
    pendingDoses: clinical
      ? await all(
          `SELECT d.*,p.name patient_name,i.name item_name FROM pending_doses d JOIN patients p ON p.id=d.patient_id JOIN items i ON i.id=d.item_id WHERE d.patient_id IN (${patientIds}) ORDER BY d.done,d.due_date`,
          ...params,
        )
      : [],
    visits: followup
      ? await all(
          `SELECT v.*,p.name patient_name,u.name acs_name FROM visits v JOIN patients p ON p.id=v.patient_id JOIN users u ON u.id=v.acs_id WHERE v.patient_id IN (${patientIds}) ORDER BY v.date DESC`,
          ...params,
        )
      : [],
    audit: coord
      ? await all(
          'SELECT a.id,a.action,a.entity_id,a.created_at,u.name user_name FROM audit a JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 40',
        )
      : [],
  };
}
