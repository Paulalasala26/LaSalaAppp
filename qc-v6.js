(function (global) {
  const categories = {
    color: ['ok', 'verde', 'amarillo', 'verdeClaro'],
    tamano: ['ok', 'grande', 'pequeno'],
    flores: ['ok', 'con_flores'],
    raices: ['ok', 'pocaRaiz', 'raizVieja']
  };

  function createEmpty() {
    return {
      version: 6,
      color: null,
      tamano: null,
      sanidad: { ok: false, enfermedades: {} },
      flores: null,
      raices: null,
      global: 0
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function diseaseTotal(value) {
    return Object.values(value?.sanidad?.enfermedades || {})
      .reduce((total, amount) => total + (Number(amount) || 0), 0);
  }

  function anomalyTotal(value) {
    const ordinary = ['color', 'tamano', 'flores', 'raices']
      .reduce((total, key) => total + (value?.[key] && value[key] !== 'ok' ? 100 : 0), 0);
    return ordinary + (value?.sanidad?.ok ? 0 : diseaseTotal(value));
  }

  function proposal(value) {
    const mean = anomalyTotal(value) / 5;
    return Math.floor(mean / 10) * 10;
  }

  function hasAnomaly(value) {
    return anomalyTotal(value) > 0;
  }

  function validate(value) {
    const errors = [];
    if (!value || value.version !== 6) return { valid: false, errors: ['La evaluación no es QC v6'] };
    for (const key of Object.keys(categories)) {
      if (!categories[key].includes(value[key])) errors.push(`Selecciona una opción válida en ${key}`);
    }
    const sanidad = value.sanidad || {};
    const diseases = sanidad.enfermedades && typeof sanidad.enfermedades === 'object' ? sanidad.enfermedades : {};
    const selected = Object.entries(diseases);
    const diseaseKeys = ['tuta', 'minador', 'pulgon', 'oruga', 'trips', 'alternaria', 'mildiu', 'oidio', 'botrytis', 'didymella'];
    if (sanidad.ok) {
      if (selected.length) errors.push('Sanidad OK no puede mantener enfermedades seleccionadas');
    } else if (!selected.length) {
      errors.push('Selecciona OK o al menos una enfermedad en Sanidad');
    }
    let total = 0;
    for (const [key, raw] of selected) {
      const amount = Number(raw);
      if (!diseaseKeys.includes(key) || !Number.isInteger(amount) || amount < 10 || amount > 100 || amount % 10 !== 0) {
        errors.push('Cada porcentaje de enfermedad debe ser múltiplo de 10 entre 10 y 100');
        break;
      }
      total += amount;
    }
    if (total > 100) errors.push('La suma de enfermedades no puede superar el 100 %');
    const globalValue = Number(value.global);
    if (!Number.isInteger(globalValue) || globalValue < 0 || globalValue > 100 || globalValue % 10 !== 0) {
      errors.push('El porcentaje global debe ser múltiplo de 10 entre 0 y 100');
    }
    if (!hasAnomaly(value) && globalValue !== 0) errors.push('El global debe ser 0 % cuando no hay anomalías');
    return { valid: errors.length === 0, errors };
  }

  global.QC_V6 = Object.freeze({ categories, createEmpty, clone, diseaseTotal, anomalyTotal, proposal, hasAnomaly, validate });
})(window);
