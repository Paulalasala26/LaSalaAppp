'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTaskWrite } = require('../lib/tasks-write-policy');

const roles = { ADMIN: 'ADMIN', TECH: 'TECNICO', PEON1: 'PEON', REGANTE1: 'REGANTE', REGANTE2: 'REGANTE', REGANTE3: 'REGANTE', PEON2: 'PEON' };
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

test('REGANTE sincroniza un específico vinculado a Partidas sin reasignarlo', () => {
  const before = task({ categoria: 'especifico', origenTarea: 'especificos', asignadoA: 'REGANTE1',
    inv: '28', especificoPartidaRegistroId: 'r-1' });
  const after = { ...before, titulo: 'Tratamiento actualizado' };
  // Cambios de contenido de la ficha vinculada proceden de la sincronización administrativa.
  assert.equal(allow([before], [{ ...before, calles: 'C/1' }], 'REGANTE1', 'REGANTE'), true);
  deny([before], [{ ...after, asignadoA: 'REGANTE2' }], 'REGANTE1', 'REGANTE');
});

test('Específicos automáticos se crean y fusionan solo dentro de la sala del REGANTE', () => {
  const created = task({ categoria: 'especifico', origenTarea: 'especificos', asignadoA: 'REGANTE1', inv: '28' });
  assert.equal(allow([], [created], 'REGANTE1', 'REGANTE'), true);
  assert.equal(allow([], [{ ...created, id: 't-2', asignadoA: 'REGANTE2', inv: '10A' }], 'REGANTE2', 'REGANTE'), true);
  assert.throws(() => allow([], [{ ...created, id: 't-3', inv: '10A' }], 'REGANTE1', 'REGANTE'));
  assert.equal(allow([created], [{ ...created, calles: 'C/1-C/2' }], 'REGANTE1', 'REGANTE'), true);
  assert.throws(() => validateTaskWrite({ before: [created], after: [{ ...created, titulo: 'Cambio ajeno' }],
    actor: 'REGANTE1', role: 'REGANTE', roles }));
});

test('Pistola histórica fusiona objetivos solo si no está enlazada y conserva estado y responsable', () => {
  const base = task({ categoria: 'fumigacion', asignadoA: 'PEON1', fechaISO: '2026-11-17', objetivos: [{ inv: '28', calles: '1' }] });
  const merged = { ...base, objetivos: [{ inv: '28', calles: '1-2' }, { inv: '29', calles: '3' }], horario: '10:00' };
  assert.equal(allow([base], [merged]), true);
  assert.throws(() => allow([base], [{ ...merged, asignadoA: 'PEON2' }]));
  assert.throws(() => allow([base], [{ ...merged, estado: 'iniciada' }]));
  assert.throws(() => allow([{ ...base, origenFito: { serieId: 's1', jornadaId: 'j1' } }],
    [{ ...base, origenFito: { serieId: 's1', jornadaId: 'j1' }, objetivos: merged.objetivos }]));
});

test('la regeneración solo puede retirar tareas pendientes de Riego', () => {
  assert.equal(allow([task({ categoria: 'riego', origenTarea: 'riego' })], []), true);
  assert.throws(() => allow([task()], []));
  assert.throws(() => allow([task({ categoria: 'riego', origenTarea: 'riego', estado: 'iniciada' })], []));
});
