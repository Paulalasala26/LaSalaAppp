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

function validateManagerChange(oldTask, nextTask, roles) {
  if (!oldTask) {
    if (nextTask.estado !== 'pendiente' || !['manual', 'riego', 'pistola', 'especifico'].includes(source(nextTask)))
      fail('INVALID_NEW_TASK');
    validateAssignment(nextTask, roles);
    return;
  }
  if (!nextTask) {
    // El regenerador de Riego reemplaza exclusivamente pendientes de Riego.
    if (source(oldTask) !== 'riego' || oldTask.estado !== 'pendiente' || !taskActive(oldTask))
      fail('TASK_DELETE_FORBIDDEN');
    return;
  }
  const changed = keysChanged(oldTask, nextTask);
  if (!changed.length) return;
  if (oldTask.estado !== 'pendiente' || !taskActive(oldTask)) fail('TASK_ALREADY_IN_PROGRESS');
  if (nextTask.estado !== 'pendiente' && nextTask.estado !== 'anulada') fail('INVALID_TASK_TRANSITION');
  if (source(oldTask) === 'pistola' && changed.some(key => key !== 'visto'))
    fail('PISTOLA_TASK_PROTECTED');
  validateAssignment(nextTask, roles);
  // Esta función solo se llama para ADMIN/TÉCNICO. El cambio de responsable
  // nunca se admite en las rutas de PEÓN o REGANTE.
  // La cancelación/anulación nunca puede reescribirse como otro tipo de tarea.
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

  // REGANTE crea/actualiza solo tareas pendientes generadas desde específicos.
  if (role === 'REGANTE' && source(oldTask) === 'especifico' && source(nextTask) === 'especifico' &&
      oldTask.estado === 'pendiente' && nextTask.estado === 'pendiente' &&
      oldTask.especificoPartidaRegistroId && oldTask.especificoPartidaRegistroId === nextTask.especificoPartidaRegistroId &&
      changed.every(key => !['id', 'asignadoA', 'estado', 'categoria', 'origenFito'].includes(key))) {
    validateAssignment(nextTask, roles);
    return;
  }
  fail('TASK_WRITE_FORBIDDEN');
}

function validateTaskWrite({ before, after, actor, role, roles }) {
  const oldMap = indexTasks(before);
  const newMap = indexTasks(after);
  for (const next of newMap.values()) {
    // Se verifica la asignación de todos los registros modificados o creados;
    // los históricos intactos se conservan aunque sean anteriores al esquema.
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
        nextTask.asignadoA === actor && nextTask.especificoPartidaRegistroId) validateAssignment(nextTask, roles);
    else fail('TASK_CREATE_FORBIDDEN');
  }
  return true;
}

module.exports = { validateTaskWrite, source };
