'use strict';

const { isDeepStrictEqual } = require('node:util');

function fail(code = 'TASK_WRITE_FORBIDDEN') {
  const error = new Error(code);
  error.code = code;
  error.httpStatus = 403;
  throw error;
}
function indexTasks(list) {
  if (!Array.isArray(list) || list.length > 20000) fail('INVALID_TASKS_DATA');
  const map = new Map();
  for (const task of list) {
    if (!task || typeof task !== 'object' || Array.isArray(task) ||
        typeof task.id !== 'string' || !task.id || task.id.length > 180 || map.has(task.id))
      fail('INVALID_TASK');
    map.set(task.id, task);
  }
  return map;
}
function source(task) {
  if (task.origenFito?.serieId || task.categoria === 'fumigacion') return 'pistola';
  if (task.categoria === 'especifico') return 'especifico';
  if (task.categoria === 'riego' || task.origenTarea === 'riego') return 'riego';
  if (task.categoria === 'manual' || task.origenTarea === 'manual' || !task.categoria) return 'manual';
  return 'otro';
}
function validateAssignment(task, roles) {
  if (Object.hasOwn(task, 'asignados') && Array.isArray(task.asignados) && task.asignados.length > 1)
    fail('MULTIPLE_ASSIGNEES_NOT_ALLOWED');
  const assignee = task.asignadoA;
  if (typeof assignee !== 'string' || !assignee.trim() || assignee.length > 80)
    fail('INVALID_ASSIGNEE');
  const assigneeRole = roles[assignee];
  const kind = source(task);
  const allowed = kind === 'riego' || kind === 'pistola' ? ['PEON']
    : kind === 'especifico' ? ['REGANTE']
      : kind === 'manual' ? ['PEON', 'REGANTE'] : [];
  if (!allowed.includes(assigneeRole)) fail('INVALID_ASSIGNEE_ROLE');
}
function isManager(role) { return role === 'ADMIN' || role === 'TECNICO'; }
function taskActive(task) { return task && !task.archivadaEn && task.estado !== 'anulada'; }
function keysChanged(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter(key => !isDeepStrictEqual(before[key], after[key]));
}
function onlyKeys(keys, allowed) { return keys.every(key => allowed.has(key)); }

const REGANTE_BY_INV = Object.freeze(Object.assign(
  Object.fromEntries(['0A','0B','1A','1B','2A','2B','3A','3B','4A','4B','7A','7B','28','29','30','8','5'].map(id => [id, 'REGANTE1'])),
  Object.fromEntries(['10A','10B','11A','11B','12','15','16','17','18','19','20','21','22'].map(id => [id, 'REGANTE2'])),
  Object.fromEntries(['31','32','33','34','35','36','37','40','41','42','43','44','45','51','52','53','54','55','56'].map(id => [id, 'REGANTE3']))
));
function isReganteForTask(task, actor) {
  return typeof task.inv === 'string' && REGANTE_BY_INV[task.inv] === actor;
}

function validateManagerChange(oldTask, nextTask, roles) {
  if (!oldTask) {
    if (nextTask.estado !== 'pendiente' || !['manual', 'riego', 'pistola', 'especifico'].includes(source(nextTask)))
      fail('INVALID_NEW_TASK');
    validateAssignment(nextTask, roles);
    return;
  }
  if (!nextTask) {
    if (source(oldTask) !== 'riego' || oldTask.estado !== 'pendiente' || !taskActive(oldTask))
      fail('TASK_DELETE_FORBIDDEN');
    return;
  }
  const changed = keysChanged(oldTask, nextTask);
  if (!changed.length) return;
  if (oldTask.estado !== 'pendiente' || !taskActive(oldTask)) fail('TASK_ALREADY_IN_PROGRESS');
  if (nextTask.estado !== 'pendiente' && nextTask.estado !== 'anulada') fail('INVALID_TASK_TRANSITION');

  // La sincronización histórica de Pistola puede añadir objetivos/calles y
  // completar un horario en una tarea no vinculada. No puede tocar firmas,
  // datos de producto, responsable ni una jornada Pistola enlazada.
  const oldLinked = !!oldTask.origenFito?.serieId;
  if (source(oldTask) === 'pistola') {
    if (!oldLinked && oldTask.estado === nextTask.estado &&
        source(nextTask) === 'pistola' &&
        onlyKeys(changed, new Set(['objetivos', 'horario']))) {
      validateAssignment(nextTask, roles);
      return;
    }
    if (changed.some(key => key !== 'visto')) fail('PISTOLA_TASK_PROTECTED');
  }
  validateAssignment(nextTask, roles);
  if (source(nextTask) !== source(oldTask)) fail('TASK_ORIGIN_IMMUTABLE');
}
function validateWorkerChange(oldTask, nextTask, actor, role, roles) {
  if (!oldTask || !nextTask || oldTask.asignadoA !== actor || nextTask.asignadoA !== actor)
    fail('TASK_NOT_ASSIGNED_TO_USER');
  if (!isDeepStrictEqual(oldTask.asignadoA, nextTask.asignadoA) || source(oldTask) !== source(nextTask))
    fail('TASK_ASSIGNMENT_IMMUTABLE');
  const changed = keysChanged(oldTask, nextTask);
  if (!changed.length) return;
  if (changed.length === 1 && changed[0] === 'visto' && oldTask.visto === false && nextTask.visto === true)
    return;

  const startKeys = new Set(['estado', 'horaInicio', 'horaInicioTs']);
  if (oldTask.estado === 'pendiente' && nextTask.estado === 'iniciada' && onlyKeys(changed, startKeys) &&
      changed.includes('estado') &&
      (role === 'PEON' ? ['riego', 'manual', 'pistola'].includes(source(oldTask)) : ['manual', 'especifico'].includes(source(oldTask))))
    return;

  const completeKeys = source(oldTask) === 'pistola'
    ? new Set(['estado', 'horaFin', 'horaFinTs', 'completadoISO', 'caldoSobrante', 'firmaPreparador', 'firmaAplicador', 'firmante'])
    : new Set(['estado', 'horaFin', 'horaFinTs', 'completadoISO', 'firmante']);
  if (oldTask.estado === 'iniciada' && nextTask.estado === 'completada' &&
      onlyKeys(changed, completeKeys) && changed.includes('estado') &&
      (source(oldTask) !== 'pistola' || role === 'PEON')) return;

  // Un REGANTE puede completar el auto-merge de específicos de su sala,
  // tanto los genéricos del módulo como los enlazados a Partidas.
  const specificMergeKeys = new Set(['calles', 'horario', 'producto', 'dosis', 'caldoLabel', 'gastoLabel']);
  if (role === 'REGANTE' && source(oldTask) === 'especifico' && source(nextTask) === 'especifico' &&
      ['pendiente', 'iniciada'].includes(oldTask.estado) && nextTask.estado === oldTask.estado &&
      taskActive(oldTask) && taskActive(nextTask) && isReganteForTask(oldTask, actor) &&
      isReganteForTask(nextTask, actor) && onlyKeys(changed, specificMergeKeys)) {
    validateAssignment(nextTask, roles);
    return;
  }
  fail('TASK_WRITE_FORBIDDEN');
}

function validateTaskWrite({ before, after, actor, role, roles }) {
  const oldMap = indexTasks(before);
  const newMap = indexTasks(after);
  for (const next of newMap.values()) {
    const old = oldMap.get(next.id);
    if (!old || !isDeepStrictEqual(old, next)) validateAssignment(next, roles);
  }
  const manager = isManager(role);
  if (!manager && !['PEON', 'REGANTE'].includes(role)) fail();
  for (const [id, oldTask] of oldMap) {
    const nextTask = newMap.get(id) || null;
    if (isDeepStrictEqual(oldTask, nextTask)) continue;
    if (manager) validateManagerChange(oldTask, nextTask, roles);
    else validateWorkerChange(oldTask, nextTask, actor, role, roles);
  }
  for (const [id, nextTask] of newMap) {
    if (oldMap.has(id)) continue;
    if (manager) validateManagerChange(null, nextTask, roles);
    else if (role === 'REGANTE' && source(nextTask) === 'especifico' && nextTask.estado === 'pendiente' &&
        nextTask.asignadoA === actor && isReganteForTask(nextTask, actor)) validateAssignment(nextTask, roles);
    else fail('TASK_CREATE_FORBIDDEN');
  }
  return true;
}

module.exports = { validateTaskWrite, source, isReganteForTask };
