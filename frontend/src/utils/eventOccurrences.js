// Calcula a próxima ocorrência relevante (em andamento ou futura) de um evento, considerando
// recorrência semanal/mensal. Usado em MembrosModule (Início) e VoluntariosModule (topo da tela).
export const EVENT_DURATION_MS = 2 * 60 * 60 * 1000; // duração padrão de um evento (2h)

const advanceDate = (date, rec) => {
  const n = new Date(date);
  if (rec === 'WEEKLY') n.setDate(n.getDate() + 7);
  else if (rec === 'MONTHLY') n.setMonth(n.getMonth() + 1);
  return n;
};

const nextRelevantOccurrence = (ev) => {
  const rec = ev.recurrence || 'NONE';
  const agora = Date.now();
  let d = new Date(ev.date);
  if (rec === 'NONE') return (d.getTime() + EVENT_DURATION_MS >= agora) ? d : null;
  let guard = 0;
  while (d.getTime() + EVENT_DURATION_MS < agora && guard < 5000) { d = advanceDate(d, rec); guard++; }
  return d;
};

// Recebe a lista de eventos (GET /api/events) e retorna as próximas ocorrências, ordenadas,
// cada uma com occId (chave de idempotência — inclui a data para eventos recorrentes) e occIso.
export const getEventOccurrences = (events) => {
  const nowMs = Date.now();
  return (events || [])
    .map(ev => {
      const occ = nextRelevantOccurrence(ev);
      if (!occ) return null;
      const start = occ.getTime();
      const recurring = ev.recurrence && ev.recurrence !== 'NONE';
      return {
        ...ev,
        occId: recurring ? `${ev.id}@${occ.toISOString()}` : ev.id,
        occIso: occ.toISOString(),
        isNow: nowMs >= start && nowMs <= start + EVENT_DURATION_MS,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.occIso) - new Date(b.occIso));
};
