import { useEffect, useState } from 'react';
import { api, fmt } from '../api';

const EMPTY = { name: '', qty: 0, min_qty: 0, cost_price: 0, sale_price: 0 };

export default function Estoque() {
  const [parts, setParts] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  const load = () => api('/api/parts').then(setParts).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    const body = JSON.stringify({
      ...form,
      qty: Number(form.qty), min_qty: Number(form.min_qty),
      cost_price: Number(form.cost_price), sale_price: Number(form.sale_price),
    });
    try {
      if (editing) await api(`/api/parts/${editing}`, { method: 'PUT', body });
      else await api('/api/parts', { method: 'POST', body });
      setForm(EMPTY); setEditing(null); load();
    } catch (err) { setError(err.message); }
  }

  async function remove(id) {
    if (!confirm('Excluir esta peça?')) return;
    try { await api(`/api/parts/${id}`, { method: 'DELETE' }); load(); }
    catch (err) { setError(err.message); }
  }

  return (
    <div>
      <div className="page-head"><h2>Estoque</h2></div>

      <form className="card form-row" onSubmit={submit}>
        <input placeholder="Peça" value={form.name} onChange={set('name')} required />
        <input type="number" placeholder="Qtd" title="Quantidade" value={form.qty} onChange={set('qty')} />
        <input type="number" placeholder="Mín" title="Estoque mínimo" value={form.min_qty} onChange={set('min_qty')} />
        <input type="number" step="0.01" placeholder="Custo R$" value={form.cost_price} onChange={set('cost_price')} />
        <input type="number" step="0.01" placeholder="Venda R$" value={form.sale_price} onChange={set('sale_price')} />
        <button>{editing ? 'Salvar' : '+ Adicionar'}</button>
        {editing && (
          <button type="button" className="link-btn"
            onClick={() => { setEditing(null); setForm(EMPTY); }}>Cancelar</button>
        )}
      </form>
      {error && <p className="error">{error}</p>}

      <table className="card table">
        <thead><tr><th>Peça</th><th>Qtd</th><th>Mín</th><th>Custo</th><th>Venda</th><th></th></tr></thead>
        <tbody>
          {parts.map((p) => (
            <tr key={p.id} className={p.min_qty > 0 && p.qty <= p.min_qty ? 'low-stock' : ''}>
              <td>{p.name}</td>
              <td>{p.qty}</td>
              <td>{p.min_qty}</td>
              <td>{fmt(p.cost_price)}</td>
              <td>{fmt(p.sale_price)}</td>
              <td className="row-actions">
                <button className="link-btn" onClick={() => { setEditing(p.id); setForm(p); }}>Editar</button>
                <button className="link-btn danger" onClick={() => remove(p.id)}>Excluir</button>
              </td>
            </tr>
          ))}
          {parts.length === 0 && <tr><td colSpan={6} className="muted">Nenhuma peça cadastrada.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
