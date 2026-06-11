import { useEffect, useState } from 'react';
import { api } from '../api';

const EMPTY = { name: '', phone: '', notes: '' };

export default function Clientes() {
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  const load = () => api('/api/clients').then(setClients).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      if (editing) {
        await api(`/api/clients/${editing}`, { method: 'PUT', body: JSON.stringify(form) });
      } else {
        await api('/api/clients', { method: 'POST', body: JSON.stringify(form) });
      }
      setForm(EMPTY);
      setEditing(null);
      load();
    } catch (err) { setError(err.message); }
  }

  async function remove(id) {
    if (!confirm('Excluir este cliente?')) return;
    try { await api(`/api/clients/${id}`, { method: 'DELETE' }); load(); }
    catch (err) { setError(err.message); }
  }

  return (
    <div>
      <div className="page-head"><h2>Clientes</h2></div>

      <form className="card form-row" onSubmit={submit}>
        <input placeholder="Nome" value={form.name} onChange={set('name')} required />
        <input placeholder="WhatsApp (com DDD)" value={form.phone} onChange={set('phone')} />
        <input placeholder="Observações" value={form.notes} onChange={set('notes')} />
        <button>{editing ? 'Salvar' : '+ Adicionar'}</button>
        {editing && (
          <button type="button" className="link-btn"
            onClick={() => { setEditing(null); setForm(EMPTY); }}>Cancelar</button>
        )}
      </form>
      {error && <p className="error">{error}</p>}

      <table className="card table">
        <thead><tr><th>Nome</th><th>WhatsApp</th><th>Obs.</th><th></th></tr></thead>
        <tbody>
          {clients.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.phone}</td>
              <td>{c.notes}</td>
              <td className="row-actions">
                <button className="link-btn"
                  onClick={() => { setEditing(c.id); setForm({ name: c.name, phone: c.phone, notes: c.notes }); }}>
                  Editar
                </button>
                <button className="link-btn danger" onClick={() => remove(c.id)}>Excluir</button>
              </td>
            </tr>
          ))}
          {clients.length === 0 && <tr><td colSpan={4} className="muted">Nenhum cliente ainda.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
