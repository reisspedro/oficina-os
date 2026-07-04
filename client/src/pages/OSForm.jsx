import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, fmt } from '../api';

const EMPTY_ITEM = { type: 'servico', description: '', qty: 1, unit_price: 0, part_id: null };

export default function OSForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [parts, setParts] = useState([]);
  const [form, setForm] = useState({ client_id: '', vehicle: '', plate: '', description: '', discount: 0 });
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/clients').then(setClients).catch(() => {});
    api('/api/parts').then(setParts).catch(() => {});
    if (id) {
      api(`/api/os/${id}`).then((os) => {
        setForm({
          client_id: os.client_id || '', vehicle: os.vehicle, plate: os.plate,
          description: os.description, discount: os.discount,
        });
        setItems(os.items.length ? os.items : [{ ...EMPTY_ITEM }]);
        setLocked(os.status !== 'orcamento');
      }).catch((e) => setError(e.message));
    }
  }, [id]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  function setItem(i, patch) {
    setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  function pickPart(i, partId) {
    const part = parts.find((p) => p.id === Number(partId));
    if (part) {
      setItem(i, { part_id: part.id, type: 'peca', description: part.name, unit_price: part.sale_price });
    } else {
      setItem(i, { part_id: null });
    }
  }

  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0);
  const total = Math.max(0, subtotal - (Number(form.discount) || 0));

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const payload = {
      ...form,
      client_id: form.client_id ? Number(form.client_id) : null,
      discount: Number(form.discount) || 0,
    };
    if (!locked) {
      payload.items = items
        .filter((it) => it.description)
        .map((it) => ({ ...it, qty: Number(it.qty) || 1, unit_price: Number(it.unit_price) || 0 }));
    }
    const body = JSON.stringify(payload);
    try {
      const os = id
        ? await api(`/api/os/${id}`, { method: 'PUT', body })
        : await api('/api/os', { method: 'POST', body });
      navigate(`/os/${os.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-head"><h2>{id ? `Editar OS-${id}` : 'Nova Ordem de Serviço'}</h2></div>

      <form className="card os-form" onSubmit={submit}>
        <div className="form-grid">
          <label>Cliente
            <select value={form.client_id} onChange={set('client_id')}>
              <option value="">— sem cliente —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Veículo <input value={form.vehicle} onChange={set('vehicle')} placeholder="Ex.: Scania R450" /></label>
          <label>Placa <input value={form.plate} onChange={set('plate')} placeholder="ABC-1234" /></label>
        </div>
        <label>Descrição do problema
          <textarea rows={2} value={form.description} onChange={set('description')}
            placeholder="Ex.: Radiador vazando na colmeia, revisar mangueiras" />
        </label>

        <h3>Itens</h3>
        {locked && (
          <p className="muted">
            🔒 Itens travados — a OS já foi aprovada. Volte pra orçamento na tela da OS pra alterar itens.
          </p>
        )}
        {!locked && items.map((it, i) => (
          <div className="item-row" key={i}>
            <select value={it.part_id || ''} onChange={(e) => pickPart(i, e.target.value)} title="Puxar do estoque">
              <option value="">manual</option>
              {parts.map((p) => <option key={p.id} value={p.id}>{p.name} (est. {p.qty})</option>)}
            </select>
            <select value={it.type} onChange={(e) => setItem(i, { type: e.target.value })}>
              <option value="servico">Serviço</option>
              <option value="peca">Peça</option>
            </select>
            <input placeholder="Descrição" value={it.description}
              onChange={(e) => setItem(i, { description: e.target.value })} />
            <input type="number" step="0.01" min="0" title="Qtd" value={it.qty}
              onChange={(e) => setItem(i, { qty: e.target.value })} />
            <input type="number" step="0.01" min="0" title="Preço unit." value={it.unit_price}
              onChange={(e) => setItem(i, { unit_price: e.target.value })} />
            <span className="muted">{fmt((Number(it.qty) || 0) * (Number(it.unit_price) || 0))}</span>
            <button type="button" className="link-btn danger"
              onClick={() => setItems(items.filter((_, idx) => idx !== i))}>✕</button>
          </div>
        ))}
        {!locked && (
          <button type="button" className="link-btn" onClick={() => setItems([...items, { ...EMPTY_ITEM }])}>
            + adicionar item
          </button>
        )}

        <div className="totals">
          <span>Subtotal: <b>{fmt(subtotal)}</b></span>
          <label>Desconto R$ <input type="number" step="0.01" min="0" value={form.discount} onChange={set('discount')} /></label>
          <span className="total-big">Total: <b>{fmt(total)}</b></span>
        </div>

        {error && <p className="error">{error}</p>}
        <button disabled={busy}>{id ? 'Salvar alterações' : 'Criar OS'}</button>
      </form>
    </div>
  );
}
