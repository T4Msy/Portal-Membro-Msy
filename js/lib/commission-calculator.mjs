/** Financial arithmetic shared by the editor and Node tests. All money is cents. */
export const SOURCES = ['Indicação direta', 'Instagram', 'Site', 'Marketing', 'Prospecção', 'Outro', 'MSY / Origem institucional'];
export const PARTICIPATIONS = [0, 50, 75, 100];
export const STATUS = { draft: 'Rascunho', review: 'Em análise', approved: 'Aprovado', pending: 'Pagamento pendente', paid: 'Pago', cancelled: 'Cancelado' };
export const MAX_CENTS = 100000000000;

export function parseDecimal(value, scale = 2) {
  const raw = String(value ?? '').trim();
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  if (!new RegExp(`^\\d+(?:\\.\\d{0,${scale}})?$`).test(normalized)) throw new Error('Informe um número válido com até duas casas decimais.');
  const [whole, fraction = ''] = normalized.split('.');
  const result = Number(whole) * 10 ** scale + Number(fraction.padEnd(scale, '0'));
  if (!Number.isSafeInteger(result)) throw new Error('Valor fora do limite permitido.');
  return result;
}

export function money(cents) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function integer(value, max, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) throw new Error(`${label} inválido.`);
  return value;
}

export function calculateCommission(input, strict = false) {
  const gross = integer(input.gross_cents, MAX_CENTS, 'Valor bruto');
  const costs = (input.costs || []).reduce((sum, cost) => sum + integer(cost.amount_cents, MAX_CENTS, 'Custo'), 0);
  if (costs > gross) throw new Error('Os custos não podem ultrapassar o valor do projeto.');
  const base = gross - costs;
  const referral = Math.floor((base * 10 + 50) / 100);
  const execution = Math.floor((base * 65 + 50) / 100);
  const company = base - referral - execution;
  const members = input.members || [];
  const weight = members.reduce((sum, member) => sum + integer(member.weight_bp, 10000, 'Peso'), 0);
  const ids = members.map(member => member.user_id).filter(Boolean);
  if (new Set(ids).size !== ids.length) throw new Error('Uma pessoa só pode aparecer uma vez na execução.');
  for (const member of members) {
    if (member.participation !== null && member.participation !== '' && !PARTICIPATIONS.includes(Number(member.participation))) {
      throw new Error('Participação inválida.');
    }
  }
  const errors = [];
  if (!input.project_name?.trim()) errors.push('Informe o nome do projeto.');
  if (!input.client_name?.trim()) errors.push('Informe o cliente.');
  if (!input.project_date) errors.push('Informe a data do projeto.');
  if (gross <= 0) errors.push('Informe um valor de projeto maior que zero.');
  if (!SOURCES.includes(input.referral_source)) errors.push('Selecione a origem do cliente.');
  if (!members.length || ids.length !== members.length) errors.push('Selecione os participantes.');
  if (members.some(member => member.participation === null || member.participation === '')) errors.push('Defina a participação de todos os participantes.');
  if (weight !== 10000) errors.push('Os pesos precisam somar exatamente 100%.');
  if ((input.costs || []).some(cost => !cost.description?.trim())) errors.push('Descreva todos os custos.');
  if (strict && errors.length) throw new Error(errors.join(' '));
  const last = members.findLastIndex(member => member.weight_bp > 0);
  let allocated = 0;
  const results = members.map((member, index) => {
    const amount = weight === 10000 && index === last ? execution - allocated : Math.floor(execution * member.weight_bp / 10000);
    allocated += amount;
    const participation = PARTICIPATIONS.includes(Number(member.participation)) ? Number(member.participation) : 0;
    const final = Math.floor((amount * participation + 50) / 100);
    return { ...member, base_cents: amount, final_cents: final, retained_cents: amount - final };
  });
  const retained = results.reduce((sum, member) => sum + member.retained_cents, 0);
  const effective = results.reduce((sum, member) => sum + member.final_cents, 0);
  return { gross_cents: gross, costs_cents: costs, distribution_cents: base, company_cents: company,
    referral_cents: referral, execution_cents: execution, effective_execution_cents: effective,
    retained_cents: retained, company_total_cents: company + retained + (input.referral_user_id ? 0 : referral),
    referral_user_id: input.referral_user_id || null, weight_bp: weight, members: results, valid: errors.length === 0, errors };
}
