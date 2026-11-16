'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTaskWrite } = require('../lib/tasks-write-policy');

const roles = { ADMIN: 'ADMIN', TECH: 'TECNICO', PEON1: 'PEON', REGANTE1: 'REGANTE', PEON2: 'PEON' };
const task = (overrides = {}) => ({
  id: 't-1', titulo: 'Revisar', categoria: 'manual', origenTarea: 'manual',
  asignadoA: 'PEON1', estado: 'pendiente', visto: false, ...overrides
});
const allow = (before, after, actor = 'TECH', role = 'TECNICO') =>
  validateTaskWrite({ before, after, actor, role, roles });
const deny = (before, after, actor = 'PEON1', role = 'PEON') =>
  assert.throws(() => validateTaskWrite({ before, after, actor, role, roles }), { httpStatus: 403 });

test('ADMIN/TÉCNICO crea una tarea manual con un único responsable elegible', () => {
  assert.equal(allow([], [task()]), true);
});

test('rechaza tareas con varios destinatarios o rol incompatible', () => {
  deny([], [task({ asignados: ['PEON1', 'PEON2'] })], 'TECH', 'TECNICO');
  assert.throws(() => allow([], [task({ asignadoA: 'REGANTE1', categoria: 'riego', origenTarea: 'riego' })]));
});

test('solo ADMIN/TÉCNICO puede reasignar una tarea pendiente', () => {
  const before = [task()];
  const after = [task({ asignadoA: 'REGANTE1' })];
  assert.equal(allow(before, after), true);
  deny(before, after);
});

test('PEÓN solo puede iniciar y completar su propia tarea', () => {
  const pending = task();
  const started = task({ estado: 'iniciada', horaInicio: '16/11/2026, 10:00', horaInicioTs: 1 });
  const completed = task({ estado: 'completada', horaInicio: '16/11/2026, 10:00', horaInicioTs: 1,
    horaFin: '16/11/2026, 10:10', horaFinTs: 2, completadoISO: '2026-11-16', firmante: 'Gines' });
  assert.equal(allow([pending], [started], 'PEON1', 'PEON'), true);
  assert.equal(allow([started], [completed], 'PEON1', 'PEON'), true);
  deny([pending], [started], 'PEON2', 'PEON');
  deny([pending], [task({ ...started, asignadoA: 'PEON2' })], 'PEON1', 'PEON');
});

test('REGANTE puede sincronizar sus específicos pendientes, pero no reasignarlos', () => {
  const before = task({ categoria: 'especifico', origenTarea: 'especificos', asignadoA: 'REGANTE1',
    especificoPartidaRegistroId: 'r-1' });
  const after = { ...before, titulo: 'Tratamiento actualizado' };
  assert.equal(allow([before], [after], 'REGANTE1', 'REGANTE'), true);
  deny([before], [{ ...after, asignadoA: 'REGANTE2' }], 'REGANTE1', 'REGANTE');
});

test('la regeneración solo puede retirar tareas pendientes de Riego', () => {
  assert.equal(allow([task({ categoria: 'riego', origenTarea: 'riego' })], []), true);
  assert.throws(() => allow([task()], []));
  assert.throws(() => allow([task({ categoria: 'riego', origenTarea: 'riego', estado: 'iniciada' })], []));
});
